"""Attach a verified MP3 to one existing place, preserving other records.

Back up SQLite online before the change. --rollback restores only changed
place fields from that backup, keeping newer guest data and route progress.
No server restart, schema migration or nginx change is required.
"""
import argparse
from contextlib import closing
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("database", type=Path)
parser.add_argument("catalog", type=Path)
parser.add_argument("backup_directory", type=Path)
parser.add_argument("--place-id", required=True)
parser.add_argument("--media-directory", type=Path, required=True)
parser.add_argument("--replace-placeholder-description", action="store_true")
parser.add_argument("--rollback", type=Path)
options = parser.parse_args()
assert options.database.is_file()
os.umask(0o077)

fields = ["audioUrl", "audioOriginalDurationSeconds", "durationSeconds"]
if options.rollback:
    rollback = json.loads(options.rollback.read_text(encoding="utf-8"))
    assert rollback["placeId"] == options.place_id
    fields, changes = rollback["fields"], rollback["values"]
    assert set(fields) <= {"audioUrl", "audioOriginalDurationSeconds", "durationSeconds", "description"}
else:
    catalog = json.loads(options.catalog.read_text(encoding="utf-8"))
    place = next(p for p in catalog["places"] if p["id"] == options.place_id)
    if options.replace_placeholder_description:
        fields.append("description")
    changes = {field: place[field] for field in fields}
    duration = changes["audioOriginalDurationSeconds"]
    assert type(duration) in (int, float) and math.isfinite(duration) and duration > 0
    assert changes["durationSeconds"] == round(duration)
    audio_url = changes["audioUrl"]
    assert audio_url.startswith("/media/") and Path(audio_url).name == audio_url[7:]
    match = re.fullmatch(re.escape(options.place_id) + r"-([a-f0-9]{12,64})\.mp3", Path(audio_url).name)
    assert match, "Use a content-hashed MP3 filename"
    audio = options.media_directory / Path(audio_url).name
    assert audio.is_file() and not audio.is_symlink()
    assert hashlib.sha256(audio.read_bytes()).hexdigest().startswith(match[1]), "MP3 checksum mismatch"

stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
backup = options.backup_directory / ("audio-" + options.place_id + "-" + stamp)
backup.mkdir(parents=True, mode=0o700)
with closing(sqlite3.connect(options.database, timeout=10)) as database:
    with closing(sqlite3.connect(backup / "kazan.sqlite3")) as snapshot:
        database.backup(snapshot)
    with database:
        database.execute("BEGIN IMMEDIATE")
        row = database.execute("SELECT body FROM places WHERE id=?", (options.place_id,)).fetchone()
        assert row is not None, "Unknown place"
        body = json.loads(row[0])
        previous = {field: body[field] for field in fields if field in body}
        if not options.rollback and "description" in fields:
            placeholder = "Место в Казани для твоей прогулки. Полная история и готовая аудиозапись появятся после подготовки материалов."
            assert body.get("description") in (placeholder, changes["description"]), "Preserve independently edited description"
        before = {key: value for key, value in body.items() if key not in fields}
        for field in fields:
            if field in changes:
                body[field] = changes[field]
            else:
                body.pop(field, None)
        assert before == {key: value for key, value in body.items() if key not in fields}
        (backup / "previous-audio-fields.json").write_text(json.dumps({"placeId": options.place_id, "fields": fields, "values": previous}, ensure_ascii=False, indent=2), encoding="utf-8")
        database.execute("UPDATE places SET body=? WHERE id=?", (json.dumps(body, ensure_ascii=False), options.place_id))
print("Updated audio fields for", options.place_id, "Private backup:", backup)
