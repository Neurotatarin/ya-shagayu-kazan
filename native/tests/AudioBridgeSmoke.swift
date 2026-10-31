// Added to a separate simulator build only, after the device IPA is packaged.
// Tests the real UIWindowScene -> controller -> WKWebView -> Capacitor -> AVPlayer
// path. Does not require Apple credentials, application accounts or OpenAI.
import WebKit

enum KazanAudioSmoke {
    private static var timer: Timer?
    private static var attempts = 0
    private static var started = false
    private static var mapCaptured = false
    private static var evaluating = false
    private static var finished = false
    private static var stages: [String] = []

    static func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in probe() }
    }

    private static func finish(_ result: [String: Any]) {
        guard !finished else { return }
        finished = true
        timer?.invalidate()
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]) {
            try? data.write(to: directory.appendingPathComponent("kazan-audio-smoke.json"), options: .atomic)
        }
    }

    private static func probe() {
        guard !finished, !evaluating else { return }
        attempts += 1
        if !started && attempts > 240 { finish(["ok": false, "check": "test-document-timeout"]); return }
        guard attempts < 1100 else { finish(["ok": false, "check": started ? "bridge-timeout" : "scene-timeout"]); return }
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return }
        guard let controller = root as? KazanBridgeViewController else {
            finish(["ok": false, "check": "wrong-root-controller"]); return
        }
        guard let webView = controller.webView, webView.url?.scheme == "capacitor", !webView.isLoading, scene.activationState == .foregroundActive else { return }
        evaluating = true
        webView.evaluateJavaScript("JSON.stringify({stage:window.kazanSmokeStage || 'starting', moduleReady:typeof window.kazanOfflineSmoke === 'function', result:window.kazanSmokeResult || null})") { value, _ in
            evaluating = false
            guard let text = value as? String, let data = text.data(using: .utf8),
                  let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            if status["stage"] as? String != "starting" { started = true }
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            if let stage = status["stage"] as? String, stages.last != stage { stages.append(stage) }
            var progress = status; progress["history"] = Array(stages.suffix(40))
            if let progressData = try? JSONSerialization.data(withJSONObject: progress, options: [.sortedKeys]) {
                try? progressData.write(to: directory.appendingPathComponent("kazan-audio-progress.json"), options: .atomic)
            }
            if status["stage"] as? String == "offline-map-rendered" && !mapCaptured {
                mapCaptured = true
                webView.takeSnapshot(with: nil) { image, _ in
                    try? image?.pngData()?.write(to: directory.appendingPathComponent("kazan-offline-map.png"), options: .atomic)
                }
            }
            if let result = status["result"] as? [String: Any] { finish(result) }
        }
    }

}
