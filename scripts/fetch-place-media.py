"""Fetch licensed media to a separate directory; never bundle it into the app.

Usage: python scripts/fetch-place-media.py OUTPUT_DIRECTORY [--music]
The public source manifests contain attribution, licenses and content hashes.
Music conversion runs locally and requires ffmpeg. No server setup is needed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.request

repository = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--music", action="store_true")
options = parser.parse_args()
destination = options.output.resolve()
destination.mkdir(parents=True, exist_ok=True)
headers = {"User-Agent": "YaShagayuKazan/0.4 (https://github.com/Neurotatarin/ya-shagayu-kazan)"}


def download(url, path, digest):
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
        return
    temporary = path.with_suffix(path.suffix + ".part")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
            assert hashlib.sha256(temporary.read_bytes()).hexdigest() == digest, "Source bytes changed; review before publishing"
            temporary.replace(path)
            return
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503) or attempt == 3:
                raise
            time.sleep(max(5, int(error.headers.get("Retry-After", "5"))))


sources = json.loads((repository / "server/media/sources.json").read_text(encoding="utf-8"))
for source in sources:
    assert source["license"].startswith("CC BY") or source["license"] in ("CC0", "Public domain")
    name = Path(source["url"]).name
    assert source["url"] == "/media/" + name and name.startswith("photo-")
    download(source["downloadUrl"], destination / name, source["sha256"])

catalog = json.loads((repository / "server/catalog.json").read_text(encoding="utf-8"))
for place in catalog["places"]:
    if "galleryUrl" in place:
        payload = (repository / "server/media" / (place["id"] + ".json")).read_bytes()
        assert hashlib.sha256(payload).hexdigest()[:16] in place["galleryUrl"]
        (destination / Path(place["galleryUrl"]).name).write_bytes(payload)

if options.music:
    music = json.loads((repository / "server/media/background-music.json").read_text(encoding="utf-8"))
    original = destination / "music-for-manatees-original.mp3"
    download(music["downloadUrl"], original, music["originalSha256"])
    converted = destination / Path(music["url"]).name
    if not converted.exists():
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(original), "-map_metadata", "-1", "-codec:a", "libmp3lame", "-b:a", "128k", str(converted)], check=True)
    assert hashlib.sha256(converted.read_bytes()).hexdigest() == music["sha256"], "ffmpeg output differs; review and update media identity before publishing"

print("Prepared", len(sources), "licensed images and the catalog's gallery manifests.")
