// Added to a separate simulator build only, after the device IPA is packaged.
// Tests the real UIWindowScene -> controller -> WKWebView -> Capacitor -> AVPlayer
// path. Does not require Apple credentials, application accounts or OpenAI.
import WebKit

enum KazanAudioSmoke {
    private static var timer: Timer?
    private static var attempts = 0
    private static var started = false
    private static var mapCaptured = false

    static func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in probe() }
    }

    private static func finish(_ result: [String: Any]) {
        timer?.invalidate()
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]) {
            try? data.write(to: directory.appendingPathComponent("kazan-audio-smoke.json"), options: .atomic)
        }
    }

    private static func probe() {
        attempts += 1
        guard attempts < 1100 else { finish(["ok": false, "check": started ? "bridge-timeout" : "scene-timeout"]); return }
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }
        guard let controller = root as? KazanBridgeViewController else {
            finish(["ok": false, "check": "wrong-root-controller"]); return
        }
        guard let webView = controller.webView, webView.url?.scheme == "capacitor", !webView.isLoading, scene.activationState == .foregroundActive else { return }
        if !started {
            started = true
            // Launch normally in the page's event loop. Polling a global result
            // avoids keeping a WebKit callAsyncJavaScript completion open while
            // Capacitor needs to evaluate the native promise responses itself.
            webView.evaluateJavaScript("window.kazanSmokePromise = (async function(){\n" + script + "\n})().then(r => { window.kazanSmokeResult = r; }); void 0;") { _, error in
                if error != nil { finish(["ok": false, "check": "javascript-start"]) }
            }
            return
        }
        webView.evaluateJavaScript("JSON.stringify({stage:window.kazanSmokeStage || 'starting', result:window.kazanSmokeResult || null})") { value, _ in
            guard let text = value as? String, let data = text.data(using: .utf8),
                  let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try? data.write(to: directory.appendingPathComponent("kazan-audio-progress.json"), options: .atomic)
            if status["stage"] as? String == "offline-map-rendered" && !mapCaptured {
                mapCaptured = true
                webView.takeSnapshot(with: nil) { image, _ in
                    try? image?.pngData()?.write(to: directory.appendingPathComponent("kazan-offline-map.png"), options: .atomic)
                }
            }
            if let result = status["result"] as? [String: Any] { finish(result) }
        }
    }

    private static let script = #"""
    let check = "plugin-header";
    const stage = name => { check = name; window.kazanSmokeStage = name; };
    stage(check);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const call = (method, options = {}) => window.Capacitor.nativePromise("KazanAudio", method, options);
    const until = async predicate => {
      for (let i = 0; i < 120; i++) {
        const state = await call("getState");
        if (state.error) throw new Error("native-player-error");
        if (predicate(state)) return state;
        await sleep(500);
      }
      throw new Error("timeout");
    };
    try {
      const header = window.Capacitor?.PluginHeaders?.find(p => p.name === "KazanAudio");
      if (!header || !["getState", "loadTrack", "play", "pause", "seek", "clearTrack"].every(name => header.methods.some(m => m.name === name))) throw new Error("missing-header");
      stage("native-get-state");
      const initial = await call("getState");
      if (typeof initial.position !== "number") throw new Error("invalid-state");
      await call("clearTrack");
      stage("url-guard");
      let rejected = false;
      try { await call("loadTrack", {id: "smoke@ru", url: "http://invalid.example/audio.mp3"}); }
      catch (error) { rejected = error.code === "AUDIO_URL_REJECTED"; }
      if (!rejected) throw new Error("missing-url-guard");
      stage("native-load-play");
      await call("loadTrack", {id: "smoke@ru", url: "https://kazan-demo.38-180-191-162.sslip.io/media/ushkova-5e9c3ac57387.mp3", title: "Audio bridge check", artist: "Test", album: "Test", duration: 255, position: 0, speed: 1});
      await call("play");
      const playing = await until(state => state.playing && !state.loading && state.position > 1.5);
      stage("native-pause");
      const paused = await call("pause");
      await sleep(700);
      const still = await call("getState");
      if (still.playing || Math.abs(still.position - paused.position) > 0.2) throw new Error("pause-failed");
      stage("native-seek-resume");
      await call("seek", {seconds: 20});
      await until(state => Math.abs(state.position - 20) < 0.5);
      await call("play");
      await until(state => state.playing && state.position > 21);
      stage("native-clear");
      const cleared = await call("clearTrack");
      if (cleared.playing || cleared.placeId !== "") throw new Error("clear-failed");
      stage("offline-module");
      for (let i = 0; i < 100 && typeof window.kazanOfflineSmoke !== "function"; i++) await sleep(100);
      if (typeof window.kazanOfflineSmoke !== "function") throw new Error("offline-module-missing");
      const offline = await window.kazanOfflineSmoke(stage);
      return {ok: true, check: "complete", nativeBridge: true, avPlayerAdvanced: true, initialPlaybackSeconds: playing.position, pause: true, seekResume: true, clear: true, offline};
    } catch (_) {
      void call("clearTrack").catch(() => {});
      return {ok: false, check};
    }
    """#
}
