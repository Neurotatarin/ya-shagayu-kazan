#!/usr/bin/env bash
set -euo pipefail
mkdir -p work/android-checks
trap 'adb logcat -d -s AndroidRuntime Capacitor/Console KazanAudio > work/android-checks/logcat.txt; adb pull /sdcard/Android/data/ru.yashagayu.kazan.demo/files work/android-checks/files >/dev/null 2>&1 || true; if test -d work/emulator-startup; then cp -r work/emulator-startup work/android-checks/emulator-startup; fi' EXIT
python scripts/prepare-android-emulator.py
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
run_phase() {
  adb shell am instrument -w -r -e phase "$1" -e class ru.yashagayu.kazan.demo.NativeCheck ru.yashagayu.kazan.demo.test/androidx.test.runner.AndroidJUnitRunner | tee "work/android-checks/instrumentation-$1.txt"
  grep -q 'OK (1 test)' "work/android-checks/instrumentation-$1.txt"
}
failed=0
run_phase online || failed=1
adb shell am force-stop ru.yashagayu.kazan.demo
adb shell svc wifi disable
adb shell svc data disable
adb shell cmd connectivity airplane-mode enable
adb shell settings put secure location_mode 3
adb emu geo fix 37.62 55.75
sleep 3
run_phase offline || failed=1
adb shell am force-stop ru.yashagayu.kazan.demo
run_phase remove || failed=1
adb shell cmd connectivity airplane-mode disable
adb shell svc wifi enable
adb shell svc data enable
adb emu geo fix 37.62 55.75
adb shell settings put secure location_mode 3
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell am force-stop ru.yashagayu.kazan.demo
sleep 3
run_phase ui || failed=1
exit "$failed"
