#!/usr/bin/env bash
set -euo pipefail
umask 022

DEMO_ROOT=/var/www/kazan-demo
DEMO_HOST=kazan-demo.38-180-191-162.sslip.io
STAGE=/var/lib/kazan-demo-deploy/figma-restart-20261029
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE="$DEMO_ROOT/releases/figma-restart-$STAMP"
BACKUP="/var/backups/kazan-demo/figma-restart-$STAMP"
SWITCHED=0

test "$(id -u)" -eq 0
test -L "$DEMO_ROOT/current"
PREVIOUS=$(readlink -f "$DEMO_ROOT/current")
case "$PREVIOUS" in
  /var/www/kazan-demo/releases/*) ;;
  *) printf 'Unexpected current release; stopped.\n' >&2; exit 1 ;;
esac
test -s "$PREVIOUS/index.html"
test -s "$STAGE/index.html"
test -s "$STAGE/status.css"
test ! -e "$RELEASE"
test ! -e "$BACKUP"
/usr/sbin/nginx -t
NGINX_BEFORE=$(sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/kazan-demo)
install -d -m 700 "$BACKUP" "$BACKUP/downloads"
printf '%s\n' "$PREVIOUS" > "$BACKUP/previous-release.txt"
cp -p /etc/nginx/nginx.conf "$BACKUP/nginx.conf"
cp -p /etc/nginx/sites-available/kazan-demo "$BACKUP/kazan-demo.conf"

rollback_if_failed() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ "$SWITCHED" -eq 1 ]; then
    ln -s "$PREVIOUS" "$DEMO_ROOT/.rollback-figma-restart-$STAMP"
    mv -Tf "$DEMO_ROOT/.rollback-figma-restart-$STAMP" "$DEMO_ROOT/current"
    for ipa in "$BACKUP/downloads"/YaShagayuKazan-*.ipa; do
      [ -f "$ipa" ] || continue
      mv -- "$ipa" "$DEMO_ROOT/downloads/"
    done
    printf 'Previous publication restored after failed verification.\n' >&2
  fi
  exit "$result"
}
trap rollback_if_failed EXIT

install -d -m 755 "$RELEASE"
install -m 644 "$STAGE/index.html" "$RELEASE/index.html"
install -m 644 "$STAGE/status.css" "$RELEASE/status.css"
ln -s "$RELEASE" "$DEMO_ROOT/.current-figma-restart-$STAMP"
mv -Tf "$DEMO_ROOT/.current-figma-restart-$STAMP" "$DEMO_ROOT/current"
SWITCHED=1

curl -fsS --noproxy '*' --connect-timeout 5 --max-time 15 \
  --resolve "$DEMO_HOST:443:127.0.0.1" "https://$DEMO_HOST/" \
  -o "$BACKUP/verified-index.html" -w 'Preview HTTPS: %{http_code}; TLS: %{ssl_verify_result}\n'
cmp "$RELEASE/index.html" "$BACKUP/verified-index.html"
curl -fsS --noproxy '*' --connect-timeout 5 --max-time 15 \
  --resolve "$DEMO_HOST:443:127.0.0.1" "https://$DEMO_HOST/status.css" \
  -o "$BACKUP/verified-status.css"
cmp "$RELEASE/status.css" "$BACKUP/verified-status.css"
grep -q 'name="demo-stage" content="figma-restart"' "$BACKUP/verified-index.html"

for ipa in "$DEMO_ROOT/downloads"/YaShagayuKazan-*.ipa; do
  [ -f "$ipa" ] || continue
  mv -- "$ipa" "$BACKUP/downloads/"
done

/usr/sbin/nginx -t
NGINX_AFTER=$(sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/kazan-demo)
test "$NGINX_BEFORE" = "$NGINX_AFTER"
test "$(readlink -f "$DEMO_ROOT/current")" = "$RELEASE"
test -s "$PREVIOUS/index.html"
printf 'Release: %s\nPrevious: %s\nBackup: %s\nNginx configuration unchanged.\n' \
  "$RELEASE" "$PREVIOUS" "$BACKUP"
systemctl is-active nginx
