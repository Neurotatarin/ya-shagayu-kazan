#!/usr/bin/env bash
set -euo pipefail
xcodebuild -version
# Original Figma icon; its configured export is already 1024x1024.
cp app/public/branding/app-icon.png ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
python3 - <<'PY'
import plistlib
from pathlib import Path
p = Path('ios/App/App/Info.plist')
info = plistlib.loads(p.read_bytes())
info['UIUserInterfaceStyle'] = 'Light'
info['NSLocationWhenInUseUsageDescription'] = 'Показать твоё местоположение и пешеходный путь к достопримечательностям Казани.'
p.write_bytes(plistlib.dumps(info))
PY
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath work/ios-build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' IPHONEOS_DEPLOYMENT_TARGET=15.0 TARGETED_DEVICE_FAMILY=1 build -quiet
APP=work/ios-build/Build/Products/Release-iphoneos/App.app
test -s "$APP/App"
lipo "$APP/App" -verify_arch arm64
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$APP/Info.plist")" = iPhoneOS
mkdir -p work/iphone-output work/iphone-package/Payload
ditto "$APP" work/iphone-package/Payload/App.app
(cd work/iphone-package && zip -q -r ../iphone-output/YaShagayuKazan.ipa Payload)
shasum -a 256 work/iphone-output/YaShagayuKazan.ipa > work/iphone-output/SHA256.txt
printf 'Physical iPhone arm64; unsigned IPA for Sideloadly.\nCommit: %s\nNo Apple credentials used.\n' "${GITHUB_SHA:-local}" > work/iphone-output/build-info.txt
