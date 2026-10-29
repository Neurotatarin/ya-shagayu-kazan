#!/usr/bin/env bash
set -euo pipefail
umask 022
COMMIT=${1:?Pass the full commit SHA}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]]
ROOT=/var/www/kazan-demo
HOST=kazan-demo.38-180-191-162.sslip.io
ARCHIVE="/var/lib/kazan-demo-deploy/home-$COMMIT.tar.gz"
RELEASE="$ROOT/releases/$COMMIT"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/var/backups/kazan-demo/home-$STAMP"
test -L "$ROOT/current"
test -s "$ARCHIVE"
test ! -e "$RELEASE"
PREVIOUS=$(readlink -f "$ROOT/current")
case "$PREVIOUS" in /var/www/kazan-demo/releases/*) ;; *) exit 1 ;; esac
/usr/sbin/nginx -t
NGINX_BEFORE=$(sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/kazan-demo)
install -d -m 700 "$BACKUP"
printf '%s\n' "$PREVIOUS" > "$BACKUP/previous-release.txt"
cp -p /etc/nginx/nginx.conf "$BACKUP/nginx.conf"
cp -p /etc/nginx/sites-available/kazan-demo "$BACKUP/kazan-demo.conf"
install -d -m 755 "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE" --no-same-owner --no-same-permissions
test -s "$RELEASE/index.html"
grep -q 'name="demo-stage" content="figma-home"' "$RELEASE/index.html"
find "$RELEASE" -type d -exec chmod 755 {} +
find "$RELEASE" -type f -exec chmod 644 {} +
rollback() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    ln -s "$PREVIOUS" "$ROOT/.rollback-home-$STAMP"
    mv -Tf "$ROOT/.rollback-home-$STAMP" "$ROOT/current"
  fi
  exit "$result"
}
ln -s "$RELEASE" "$ROOT/.current-home-$STAMP"
mv -Tf "$ROOT/.current-home-$STAMP" "$ROOT/current"
trap rollback EXIT
curl -fsS --noproxy '*' --connect-timeout 5 --max-time 15 --resolve "$HOST:443:127.0.0.1" "https://$HOST/" -o "$BACKUP/verified-index.html" -w 'Preview HTTPS: %{http_code}; TLS: %{ssl_verify_result}\n'
cmp "$RELEASE/index.html" "$BACKUP/verified-index.html"
for asset in zilant-hello.png kremlin.jpg house.svg zilant-head.svg zilant-crown.svg; do
  curl -fsS --noproxy '*' --max-time 15 --resolve "$HOST:443:127.0.0.1" "https://$HOST/assets/home/$asset" -o /dev/null
done
/usr/sbin/nginx -t
test "$NGINX_BEFORE" = "$(sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/kazan-demo)"
printf 'Release: %s\nPrevious: %s\nBackup: %s\nNginx configuration unchanged.\n' "$RELEASE" "$PREVIOUS" "$BACKUP"
systemctl is-active nginx
