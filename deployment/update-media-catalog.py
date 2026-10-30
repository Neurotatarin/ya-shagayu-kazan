"""Update public photo fields only; keep edited texts, audio and guest data.

Run after uploading all referenced media. SQLite's online backup is private.
Rollback restores only the two photo fields, never old guest/progress records.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("database", type=Path)
parser.add_argument("catalog", type=Path)
parser.add_argument("backup_directory", type=Path)
parser.add_argument("--media-directory", type=Path)
parser.add_argument("--rollback", type=Path)
options = parser.parse_args()
assert options.database.is_file()
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
backup = options.backup_directory / ("media-" + stamp)
backup.mkdir(parents=True, mode=0o700)
database = sqlite3.connect(options.database, timeout=10)
with sqlite3.connect(backup / "kazan.sqlite3") as snapshot:
    database.backup(snapshot)

fields = ("image", "galleryUrl")
if options.rollback:
    changes = json.loads(options.rollback.read_text(encoding="utf-8"))
else:
    catalog = json.loads(options.catalog.read_text(encoding="utf-8"))
    changes = {p["id"]: {key: p[key] for key in fields if key in p} for p in catalog["places"]}
    if options.media_directory:
        for photo in changes.values():
            urls = ([photo["image"]["url"]] if "image" in photo else []) + ([photo["galleryUrl"]] if "galleryUrl" in photo else [])
            for url in urls:
                assert url.startswith("/media/") and Path(url).name == url[7:]
                assert (options.media_directory / Path(url).name).is_file(), "Upload missing media first"

before = {}
with database:
    for place_id, change in changes.items():
        row = database.execute("SELECT body FROM places WHERE id=?", (place_id,)).fetchone()
        assert row is not None, "Unknown catalog place"
        place = json.loads(row[0])
        before[place_id] = {key: place[key] for key in fields if key in place}
        untouched = {key: value for key, value in place.items() if key not in fields}
        for key in fields:
            if key in change:
                place[key] = change[key]
            else:
                place.pop(key, None)
        assert untouched == {key: value for key, value in place.items() if key not in fields}
        database.execute("UPDATE places SET body=? WHERE id=?", (json.dumps(place, ensure_ascii=False), place_id))
(backup / "previous-media-fields.json").write_text(json.dumps(before, ensure_ascii=False, indent=2), encoding="utf-8")
database.close()
print("Updated photo fields for", len(changes), "places. Private backup:", backup)
