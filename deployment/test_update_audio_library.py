import importlib.util
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('audio_library', Path(__file__).with_name('update-audio-library.py'))
library = importlib.util.module_from_spec(spec)
spec.loader.exec_module(library)


class AudioLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.database = self.root / 'test.sqlite3'
        self.media = self.root / 'media'
        self.media.mkdir()
        self.original = {'id': 'kremlin', 'description': library.PLACEHOLDER, 'durationSeconds': 246, 'audioUrl': '/media/original.mp3', 'audioTracks': {'ru': {'url': '/media/original.mp3', 'durationSeconds': 246}}, 'image': {'url': '/media/photo.jpg'}, 'coordinates': [49.105, 55.798]}
        with sqlite3.connect(self.database) as db:
            db.executescript('CREATE TABLE places(id TEXT PRIMARY KEY, body TEXT); CREATE TABLE guests(id TEXT PRIMARY KEY, body TEXT); CREATE TABLE routes(id TEXT PRIMARY KEY, body TEXT);')
            db.execute('INSERT INTO places VALUES (?,?)', ('kremlin', json.dumps(self.original)))
            db.execute('INSERT INTO places VALUES (?,?)', ('ushkova', '{"untouched":true}'))
            db.execute('INSERT INTO guests VALUES (?,?)', ('guest', '{"progress":42}'))
            db.execute('INSERT INTO routes VALUES (?,?)', ('walk', '{"distance":100}'))
        self.tracks = []
        for language in ('en', 'ar'):
            content = ('audio transport test fixture ' + language).encode()
            digest = hashlib.sha256(content).hexdigest()
            name = f'kremlin-{language}-{digest[:16]}.mp3'
            (self.media / name).write_bytes(content)
            self.tracks.append({'placeId': 'kremlin', 'language': language, 'filename': name, 'url': '/media/' + name, 'sha256': digest, 'bytes': len(content), 'durationSeconds': 100.25})
        desired = {**self.original, 'description': 'Ready audio', 'translations': {'en': {'description': 'Ready audio'}, 'ar': {'description': 'Ready audio'}}, 'audioTracks': {**self.original['audioTracks'], **{t['language']: {'url': t['url'], 'durationSeconds': 100} for t in self.tracks}}}
        self.catalog = self.root / 'catalog.json'
        self.catalog.write_text(json.dumps({'places': [desired]}), encoding='utf-8')
        self.manifest = self.root / 'manifest.json'
        self.save_manifest()

    def save_manifest(self):
        self.manifest.write_text(json.dumps({'version': 1, 'tracks': self.tracks}), encoding='utf-8')

    def place(self):
        with sqlite3.connect(self.database) as db:
            return json.loads(db.execute('SELECT body FROM places WHERE id="kremlin"').fetchone()[0])

    def publish(self, rollback=None):
        return library.publish(self.database, self.catalog, self.manifest, self.media, self.root / 'backups', rollback)

    def test_publish_and_rollback_preserve_old_audio_new_progress_and_unrelated_data(self):
        backup = self.publish()
        place = self.place()
        self.assertEqual(set(place['audioTracks']), {'ru', 'en', 'ar'})
        self.assertEqual(place['audioUrl'], self.original['audioUrl'])
        self.assertEqual(place['image'], self.original['image'])
        with sqlite3.connect(self.database) as db:
            db.execute('UPDATE guests SET body=? WHERE id="guest"', ('{"progress":99}',))
            db.execute('UPDATE routes SET body=? WHERE id="walk"', ('{"distance":200}',))
        self.publish(backup / 'previous-audio-fields.json')
        self.assertEqual(self.place(), self.original)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT body FROM guests').fetchone()[0], '{"progress":99}')
            self.assertEqual(db.execute('SELECT body FROM routes').fetchone()[0], '{"distance":200}')
            self.assertEqual(db.execute('SELECT body FROM places WHERE id="ushkova"').fetchone()[0], '{"untouched":true}')

    def test_rollback_refuses_to_overwrite_later_edits(self):
        backup = self.publish()
        place = self.place()
        place['description'] = 'Later editor change'
        with sqlite3.connect(self.database) as db:
            db.execute('UPDATE places SET body=? WHERE id="kremlin"', (json.dumps(place),))
        with self.assertRaises(AssertionError):
            self.publish(backup / 'previous-audio-fields.json')
        self.assertEqual(self.place(), place)

    def test_corrupted_file_and_duplicate_track_leave_database_unchanged(self):
        path = self.media / self.tracks[0]['filename']
        original = path.read_bytes()
        path.write_bytes(b'x' * len(original))
        with self.assertRaises(AssertionError): self.publish()
        path.write_bytes(original)
        self.tracks.append(self.tracks[0])
        self.save_manifest()
        with self.assertRaises(AssertionError): self.publish()
        self.assertEqual(self.place(), self.original)

    def test_existing_language_audio_is_never_silently_replaced(self):
        original = self.place()
        original['audioTracks']['ar'] = {'url': '/media/editor-ar.mp3', 'durationSeconds': 90}
        with sqlite3.connect(self.database) as db:
            db.execute('UPDATE places SET body=? WHERE id="kremlin"', (json.dumps(original),))
        with self.assertRaises(AssertionError): self.publish()
        self.assertEqual(self.place(), original)


if __name__ == '__main__':
    unittest.main()
