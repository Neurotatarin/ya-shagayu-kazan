#!/usr/bin/env bash
set -euo pipefail
mkdir -p work/android-checks
trap 'adb logcat -d -s AndroidRuntime Capacitor/Console KazanAudio > work/android-checks/logcat.txt; adb pull /sdcard/Android/data/ru.yashagayu.kazan.demo/files work/android-checks/files >/dev/null 2>&1 || true' EXIT
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
run_phase() {
  adb shell am instrument -w -r -e phase "$1" -e class ru.yashagayu.kazan.demo.NativeCheck ru.yashagayu.kazan.demo.test/androidx.test.runner.AndroidJUnitRunner | tee "work/android-checks/instrumentation-$1.txt"
  grep -q 'OK (1 test)' "work/android-checks/instrumentation-$1.txt"
}
run_phase online
adb shell am force-stop ru.yashagayu.kazan.demo
adb shell svc wifi disable
adb shell svc data disable
adb shell cmd connectivity airplane-mode enable
sleep 3
run_phase offline
adb shell am force-stop ru.yashagayu.kazan.demo
run_phase remove
