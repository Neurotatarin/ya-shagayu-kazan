"""Run as root on the existing VPS with a previously uploaded backend archive.

Only the kazan-demo host and new kazan-demo-api service are changed. The old
static release remains active; web publication is a separate atomic step.
"""
import datetime
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time
import urllib.request

archive = Path(sys.argv[1]).resolve()
assert archive.parent == Path('/var/lib/kazan-demo-deploy') and archive.name.startswith('api-') and archive.name.endswith('.tar.gz')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
release = Path('/opt/kazan-demo/releases') / digest
current = Path('/opt/kazan-demo/current')
config = Path('/etc/nginx/sites-available/kazan-demo')
unit = Path('/etc/systemd/system/kazan-demo-api.service')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = Path('/var/backups/kazan-demo') / ('api-' + stamp)
backup.mkdir(parents=True, mode=0o700)
old_config = config.read_bytes()
(backup / 'kazan-demo.conf').write_bytes(old_config)
old_unit = unit.read_bytes() if unit.exists() else None
if old_unit:
    (backup / 'kazan-demo-api.service').write_bytes(old_unit)
previous = current.resolve() if current.is_symlink() else None
(backup / 'previous-api.txt').write_text(str(previous or '') + '\n')
database = Path('/var/lib/kazan-demo/kazan.sqlite3')
if database.is_file():
    source = sqlite3.connect('file:' + str(database) + '?mode=ro', uri=True)
    destination = sqlite3.connect(backup / 'kazan.sqlite3')
    source.backup(destination)
    source.close()
    destination.close()
    (backup / 'kazan.sqlite3').chmod(0o600)
assert Path('/etc/kazan-demo/api.env').is_file()
subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
release.mkdir(parents=True, exist_ok=True)
release.parent.chmod(0o755)
release.parent.parent.chmod(0o755)
with tarfile.open(archive) as tar:
    for member in tar.getmembers():
        assert member.name in {'server.py', 'catalog.json', 'kazan-demo-api.service'} and member.isfile()
    tar.extractall(release)
for path in release.iterdir():
    path.chmod(0o644)
release.chmod(0o755)

try:
    temporary_link = current.with_name('.next-' + stamp)
    temporary_link.symlink_to(release)
    os.replace(temporary_link, current)
    shutil.copyfile(release / 'kazan-demo-api.service', unit)
    unit.chmod(0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'kazan-demo-api'], check=True)
    subprocess.run(['systemctl', 'restart', 'kazan-demo-api'], check=True)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8792/api/health', timeout=2) as response:
                assert response.status == 200
            break
        except Exception:
            if attempt == 19:
                raise
            time.sleep(.5)
    text = old_config.decode()
    if 'location /api/' not in text:
        api_location = '''    location /api/ {
        client_max_body_size 16k;
        proxy_pass http://127.0.0.1:8792;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 3s;
    }
'''
        marker = '    location /assets/'
        assert marker in text
        text = text.replace(marker, api_location + marker, 1)
    text = text.replace("img-src 'self' data:;", "img-src 'self' data: blob: https://tiles.openfreemap.org;")
    text = text.replace("connect-src 'self';", "connect-src 'self' https://tiles.openfreemap.org; worker-src 'self';")
    if '# KAZAN STATIC PERFORMANCE' not in text:
        # Compressed files are produced locally. Only content-hashed Vite assets
        # get immutable caching; original Figma filenames remain revalidated.
        security = '\n'.join(line for line in text.splitlines() if line.strip().startswith('add_header ') and 'Cache-Control' not in line)
        performance = '''    # KAZAN STATIC PERFORMANCE
    gzip_static on;
    gzip_vary on;
    location ~* "^/assets/.+-[A-Za-z0-9_-]{8}\\.(js|css|woff2?)$" {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
''' + security + '\n    }\n'
        marker = '    location /assets/'
        assert marker in text
        text = text.replace(marker, performance + marker, 1)
    config.write_text(text)
    subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    with urllib.request.urlopen('https://kazan-demo.38-180-191-162.sslip.io/api/health', timeout=15) as response:
        assert response.status == 200
    print('API release:', release)
    print('Backup:', backup)
    subprocess.run(['systemctl', 'is-active', 'nginx', 'telegram-mcp', 'max-mcp', 'kazan-demo-api'], check=True)
except Exception:
    config.write_bytes(old_config)
    if previous:
        rollback = current.with_name('.rollback-' + stamp)
        rollback.symlink_to(previous)
        os.replace(rollback, current)
    if old_unit:
        unit.write_bytes(old_unit)
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', 'restart', 'kazan-demo-api'], check=True)
    else:
        subprocess.run(['systemctl', 'disable', '--now', 'kazan-demo-api'], check=True)
    subprocess.run(['/usr/sbin/nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
