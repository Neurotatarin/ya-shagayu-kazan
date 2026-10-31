#!/usr/bin/env bash
set -euo pipefail
# The unsigned device IPA was already packaged. This separate simulator build
# exercises the real scene launch and plugin; its test harness never enters IPA.
python3 - <<'PY'
from pathlib import Path
app = Path('ios/App/App')
delegate = app / 'AppDelegate.swift'
source = delegate.read_text()
assert source.count('return true') == 1
source = source.replace('return true', 'KazanAudioSmoke.start()\n        return true', 1)
source += '\n' + Path('native/tests/AudioBridgeSmoke.swift').read_text()
delegate.write_text(source)
# A minimal local document avoids guest data writes and network map loading.
(app / 'public/index.html').write_text('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>Native audio check</body></html>')
PY
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath work/ios-simulator CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' IPHONEOS_DEPLOYMENT_TARGET=15.0 TARGETED_DEVICE_FAMILY=1 build -quiet
DEVICE=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["udid"] for devices in d["devices"].values() for x in devices if x["isAvailable"] and "iPhone" in x["name"]))')
xcrun simctl boot "$DEVICE" || test "$(xcrun simctl list devices -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["state"] for a in d["devices"].values() for x in a if x["udid"] == sys.argv[1]))' "$DEVICE")" = Booted
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" work/ios-simulator/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$DEVICE" ru.yashagayu.kazan.demo
DATA=$(xcrun simctl get_app_container "$DEVICE" ru.yashagayu.kazan.demo data)
mkdir -p work/native-checks
for _ in $(seq 1 150); do
  if test -f "$DATA/Documents/kazan-audio-smoke.json"; then
    cp "$DATA/Documents/kazan-audio-smoke.json" work/native-checks/result.json
    if test -f "$DATA/Documents/kazan-audio-progress.json"; then cp "$DATA/Documents/kazan-audio-progress.json" work/native-checks/progress.json; fi
    xcrun simctl io "$DEVICE" screenshot work/native-checks/simulator.png
    python3 -c 'import json; r=json.load(open("work/native-checks/result.json")); print(json.dumps(r,sort_keys=True)); assert r["ok"], "Native simulator audio check failed"'
    exit 0
  fi
  sleep 1
done
if test -f "$DATA/Documents/kazan-audio-progress.json"; then cp "$DATA/Documents/kazan-audio-progress.json" work/native-checks/progress.json; fi
xcrun simctl io "$DEVICE" screenshot work/native-checks/simulator.png || true
printf 'Native simulator audio check timed out.\n' >&2
exit 1
