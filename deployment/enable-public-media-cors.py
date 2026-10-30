"""Allow the Capacitor shell to fetch public gallery JSON and future downloads.

Run on the VPS after creating the existing /media/ alias. Only public static
files receive wildcard CORS; authenticated API policy stays unchanged.
"""
import datetime
from pathlib import Path
import subprocess
import urllib.request

config = Path("/etc/nginx/sites-available/kazan-demo")
assert config.is_file()
old = config.read_bytes()
text = old.decode()
marker = "location /media/ {"
assert text.count(marker) == 1
block = text[text.index(marker):text.index("}", text.index(marker))]
header = 'add_header Access-Control-Allow-Origin "*" always;'
changed = header not in block
subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
if changed:
    assert "Access-Control-Allow-Origin" not in block, "Review existing CORS before changing it"
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = Path("/var/backups/kazan-demo") / ("public-media-cors-" + stamp)
    backup.mkdir(mode=0o700)
    (backup / "kazan-demo.conf").write_bytes(old)
    try:
        config.write_text(text.replace(marker, marker + " " + header, 1))
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    except Exception:
        config.write_bytes(old)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        raise
    print("Public media CORS enabled. Backup:", backup)
else:
    print("Public media CORS already configured.")

# No cookies or credentials are permitted by this public-file policy.
request = urllib.request.Request("https://kazan-demo.38-180-191-162.sslip.io/media/background-1a2a86e2c8b6edf5.mp3", method="HEAD", headers={"Origin": "capacitor://localhost"})
with urllib.request.urlopen(request, timeout=15) as response:
    assert response.headers.get("Access-Control-Allow-Origin") == "*"
    assert response.headers.get("Access-Control-Allow-Credentials") is None
print("Capacitor origin can read public media; authenticated API policy unchanged.")
