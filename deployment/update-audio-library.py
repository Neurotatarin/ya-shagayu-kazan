"""Publish an already decoded MP3 batch, with an atomic SQLite field update.

The caller uploads immutable media before running this script. Existing audio,
edited descriptions, photos, routes, guests and progress are preserved. Rollback
restores changed place fields only and refuses to overwrite later field edits.
"""
import argparse
import copy
from contextlib import closing
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3

PLACEHOLDER = 'Место в Казани для твоей прогулки. Полная история и готовая аудиозапись появятся после подготовки материалов.'
FIELDS = ('audioUrl', 'audioOriginalDurationSeconds', 'durationSeconds', 'audioTracks', 'description', 'translations')


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def publish(database_path, catalog_path, manifest_path, media_directory, backup_directory, rollback_path=None):
    assert database_path.is_file()
    os.umask(0o077)
    if rollback_path:
        rollback = json.loads(rollback_path.read_text(encoding='utf-8'))
        assert rollback['version'] == 1 and rollback['changes']
        changes = rollback['changes']
        for change in changes.values():
            assert set(change['before']) <= set(FIELDS) and set(change['after']) <= set(FIELDS)
    else:
        catalog = {p['id']: p for p in json.loads(catalog_path.read_text(encoding='utf-8'))['places']}
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        assert manifest['version'] == 1 and manifest['tracks']
        tracks, seen = {}, set()
        for track in manifest['tracks']:
            place_id, language = track['placeId'], track['language']
            assert place_id in catalog and re.fullmatch(r'[a-z0-9-]+', place_id)
            assert language in ('ru', 'en', 'ar') and (place_id, language) not in seen
            seen.add((place_id, language))
            digest = track['sha256']
            assert re.fullmatch(r'[a-f0-9]{64}', digest)
            name = f'{place_id}-{language}-{digest[:16]}.mp3'
            assert track['filename'] == name and track['url'] == '/media/' + name
            duration = track['durationSeconds']
            assert type(duration) in (int, float) and math.isfinite(duration) and 0 < duration < 14400
            path = media_directory / name
            assert path.is_file() and not path.is_symlink() and path.stat().st_size == track['bytes']
            assert file_hash(path) == digest, 'MP3 checksum mismatch'
            tracks.setdefault(place_id, []).append(track)

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = backup_directory / ('audio-library-' + stamp)
    backup.mkdir(parents=True, mode=0o700)
    with closing(sqlite3.connect(database_path, timeout=10)) as db:
        with closing(sqlite3.connect(backup / 'kazan.sqlite3')) as snapshot:
            db.backup(snapshot)
        undo = {}
        with db:
            db.execute('BEGIN IMMEDIATE')
            for place_id in changes if rollback_path else tracks:
                row = db.execute('SELECT body FROM places WHERE id=?', (place_id,)).fetchone()
                assert row is not None, 'Unknown place'
                place = json.loads(row[0])
                before = copy.deepcopy({key: place[key] for key in FIELDS if key in place})
                untouched = {key: value for key, value in place.items() if key not in FIELDS}
                if rollback_path:
                    change = changes[place_id]
                    assert before == change['after'], 'Place fields changed after publication; preserve newer edits'
                    for key in FIELDS:
                        if key in change['before']:
                            place[key] = change['before'][key]
                        else:
                            place.pop(key, None)
                else:
                    audio = place.setdefault('audioTracks', {})
                    if place.get('audioUrl'):
                        audio.setdefault('ru', {'url': place['audioUrl'], 'durationSeconds': place['durationSeconds']})
                    for track in tracks[place_id]:
                        language = track['language']
                        old = audio.get(language)
                        assert not old or old['url'] == track['url'], 'Preserve existing language recording'
                        value = {'url': track['url'], 'durationSeconds': round(track['durationSeconds'])}
                        assert catalog[place_id]['audioTracks'][language] == value
                        audio[language] = value
                        if language == 'ru':
                            place.update(audioUrl=track['url'], durationSeconds=round(track['durationSeconds']), audioOriginalDurationSeconds=track['durationSeconds'])
                    if place.get('description') == PLACEHOLDER:
                        desired = catalog[place_id]
                        assert desired['description'] != PLACEHOLDER
                        place['description'] = desired['description']
                        for language in ('en', 'ar'):
                            localized = place.setdefault('translations', {}).setdefault(language, {})
                            localized.setdefault('description', desired['translations'][language]['description'])
                assert untouched == {key: value for key, value in place.items() if key not in FIELDS}
                after = {key: place[key] for key in FIELDS if key in place}
                undo[place_id] = {'before': before, 'after': after}
                db.execute('UPDATE places SET body=? WHERE id=?', (json.dumps(place, ensure_ascii=False), place_id))
            (backup / 'previous-audio-fields.json').write_text(json.dumps({'version': 1, 'changes': undo}, ensure_ascii=False, indent=2), encoding='utf-8')
    return backup


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('media_directory', type=Path)
    parser.add_argument('backup_directory', type=Path)
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    backup = publish(args.database, args.catalog, args.manifest, args.media_directory, args.backup_directory, args.rollback)
    print('Audio library place fields updated. Private backup:', backup)
