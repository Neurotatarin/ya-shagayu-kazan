#!/usr/bin/env bash
set -euo pipefail
xcodebuild -version
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath work/ios-build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' IPHONEOS_DEPLOYMENT_TARGET=15.0 build -quiet
APP='work/ios-build/Build/Products/Release-iphoneos/App.app'
test -d "$APP"
lipo -verify_arch arm64 "$APP/App"
PLATFORM=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$APP/Info.plist")
test "$PLATFORM" = iPhoneOS
mkdir -p work/iphone-output work/iphone-package/Payload
ditto "$APP" work/iphone-package/Payload/App.app
(cd work/iphone-package && zip -q -r ../iphone-output/YaShagayuKazan.ipa Payload)
shasum -a 256 work/iphone-output/YaShagayuKazan.ipa > work/iphone-output/SHA256.txt
printf 'Physical iPhone arm64 build, platform: %s\nCommit: %s\nUnsigned IPA for Sideloadly re-signing. No Apple credentials used.\n' "$PLATFORM" "${GITHUB_SHA:-local}" > work/iphone-output/build-info.txt
