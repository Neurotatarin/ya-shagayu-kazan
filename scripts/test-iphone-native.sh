#!/usr/bin/env bash
set -euo pipefail
# The unsigned device IPA was already packaged. This separate simulator build
# exercises the real scene launch and plugin; its test harness never enters IPA.
pnpm exec vite build --config scripts/native-smoke-vite.config.ts --logLevel error
ditto work/native-smoke-web ios/App/App/public
python3 - <<'PY'
from pathlib import Path
app = Path('ios/App/App')
delegate = app / 'AppDelegate.swift'
source = delegate.read_text()
launch, native = source.split('// BEGIN KAZAN AUDIO', 1)
assert launch.count('return true') == 1
source = launch.replace('return true', 'KazanAudioSmoke.start()\n        return true', 1) + '// BEGIN KAZAN AUDIO' + native
source += '\n' + Path('native/tests/AudioBridgeSmoke.swift').read_text()
delegate.write_text(source)
# The test document uses native downloads and locally served MapLibre assets;
# it does not create guest sessions or call OpenAI.
PY
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath work/ios-simulator CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' IPHONEOS_DEPLOYMENT_TARGET=15.0 TARGETED_DEVICE_FAMILY=1 build -quiet
DEVICE=$(python3 scripts/choose-iphone-simulator.py)
# The disposable runner must release its simulator GPU before Safari checks.
trap 'xcrun simctl shutdown "$DEVICE" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$DEVICE" || test "$(xcrun simctl list devices -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["state"] for a in d["devices"].values() for x in a if x["udid"] == sys.argv[1]))' "$DEVICE")" = Booted
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" work/ios-simulator/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$DEVICE" ru.yashagayu.kazan.demo
DATA=$(xcrun simctl get_app_container "$DEVICE" ru.yashagayu.kazan.demo data)
mkdir -p work/native-checks
for _ in $(seq 1 600); do
  if test -f "$DATA/Documents/kazan-audio-smoke.json"; then
    cp "$DATA/Documents/kazan-audio-smoke.json" work/native-checks/result.json
    if test -f "$DATA/Documents/kazan-audio-progress.json"; then cp "$DATA/Documents/kazan-audio-progress.json" work/native-checks/progress.json; fi
    if test -f "$DATA/Documents/kazan-offline-map.png"; then cp "$DATA/Documents/kazan-offline-map.png" work/native-checks/offline-map.png; fi
    xcrun simctl io "$DEVICE" screenshot work/native-checks/simulator.png
    if ! python3 -c 'import json; r=json.load(open("work/native-checks/result.json")); print(json.dumps(r,sort_keys=True)); assert r["ok"], "Native simulator audio check failed"'; then
      python3 scripts/collect-iphone-diagnostics.py "$DEVICE"
      exit 1
    fi
    exit 0
  fi
  sleep 1
done
if test -f "$DATA/Documents/kazan-audio-progress.json"; then cp "$DATA/Documents/kazan-audio-progress.json" work/native-checks/progress.json; fi
xcrun simctl io "$DEVICE" screenshot work/native-checks/simulator.png || true
python3 scripts/collect-iphone-diagnostics.py "$DEVICE"
printf 'Native simulator audio check timed out.\n' >&2
exit 1
