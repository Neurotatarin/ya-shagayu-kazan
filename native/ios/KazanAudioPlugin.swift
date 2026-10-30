import AVFoundation
import MediaPlayer
import UIKit
import Capacitor

class KazanBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KazanAudioPlugin())
    }
}

@objc(KazanAudioPlugin)
public class KazanAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KazanAudioPlugin"
    public let jsName = "KazanAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]
    private var player: AVPlayer?
    private var music: AVQueuePlayer?
    private var musicLooper: AVPlayerLooper?
    private var musicObserver: NSKeyValueObservation?
    private var backgroundEnabled = false
    private var backgroundError = ""
    private var itemObserver: NSKeyValueObservation?
    private var playbackObserver: NSKeyValueObservation?
    private var timeObserver: Any?
    private var tokens: [NSObjectProtocol] = []
    private var placeId = ""
    private var title = ""
    private var source = ""
    private var position = 0.0
    private var duration = 0.0
    private var speed = 1.0
    private var wantsPlay = false
    private var pendingSeek: Double?
    private var failure = ""
    private var lastSaved = -10.0
    private var resumeAfterInterruption = false
    private let storageKey = "kazan.audio.lastTrack.v1"
    private lazy var artwork: MPMediaItemArtwork? = {
        guard let path = Bundle.main.path(forResource: "app-icon", ofType: "png", inDirectory: "public/branding"), let image = UIImage(contentsOfFile: path) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }()

    public override func load() {
        DispatchQueue.main.async { [weak self] in self?.configure() }
    }

    private func configure() {
        if let saved = UserDefaults.standard.dictionary(forKey: storageKey) {
            placeId = saved["placeId"] as? String ?? ""
            title = saved["title"] as? String ?? ""
            source = saved["url"] as? String ?? ""
            position = saved["position"] as? Double ?? 0
            duration = saved["duration"] as? Double ?? 0
            speed = saved["speed"] as? Double ?? 1
        }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            guard let self = self, self.player != nil else { return .noSuchContent }
            DispatchQueue.main.async { try? self.start() }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.stop() }; return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { guard let self = self else { return }; if self.wantsPlay { self.stop() } else { try? self.start() } }
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { guard let self = self else { return }; self.move(to: self.position - 15) }; return .success
        }
        center.skipForwardCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { guard let self = self else { return }; self.move(to: self.position + 15) }; return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            DispatchQueue.main.async { self?.move(to: event.positionTime) }; return .success
        }
        let nc = NotificationCenter.default
        tokens.append(nc.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] event in
            guard let self = self, let item = event.object as? AVPlayerItem, item === self.player?.currentItem else { return }
            self.wantsPlay = false; self.player?.pause(); self.music?.pause(); self.position = self.duration; self.save(); self.emit()
        })
        tokens.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] event in
            guard let self = self, let type = event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
            if type == AVAudioSession.InterruptionType.began.rawValue {
                self.resumeAfterInterruption = self.wantsPlay; self.stop()
            } else {
                let options = (event.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
                if self.resumeAfterInterruption && AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) { try? self.start() }
                self.resumeAfterInterruption = false
            }
        })
        tokens.append(nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] event in
            let reason = (event.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
            if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.stop() }
        })
        tokens.append(nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.save() })
        tokens.append(nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.emit() })
    }

    @objc func loadTrack(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https", url.host == "kazan-demo.38-180-191-162.sslip.io", url.path.hasPrefix("/media/") else {
                call.reject("Недопустимый адрес аудио."); return
            }
            if self.placeId == id && self.player != nil && self.player?.currentItem?.status != .failed { call.resolve(self.snapshot()); return }
            self.stop()
            if let observer = self.timeObserver { self.player?.removeTimeObserver(observer) }
            self.itemObserver?.invalidate(); self.playbackObserver?.invalidate()
            self.placeId = id; self.title = call.getString("title") ?? "История Казани"; self.source = raw
            self.duration = max(0, call.getDouble("duration") ?? 0)
            self.position = max(0, min(call.getDouble("position") ?? 0, self.duration))
            self.speed = max(1, min(call.getDouble("speed") ?? 1, 2))
            self.failure = ""; self.wantsPlay = false; self.pendingSeek = self.position
            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item); self.player = player
            player.automaticallyWaitsToMinimizeStalling = true
            self.itemObserver = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                DispatchQueue.main.async {
                    guard let self = self, self.player?.currentItem === item else { return }
                    if item.status == .failed { self.failure = "Не удалось загрузить аудио. Проверь подключение."; self.wantsPlay = false }
                    if item.status == .readyToPlay {
                        let seconds = item.duration.seconds
                        if seconds.isFinite && seconds > 0 { self.duration = seconds }
                        if let target = self.pendingSeek {
                            self.player?.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                                DispatchQueue.main.async { guard let self = self, self.player?.currentItem === item else { return }; self.pendingSeek = nil; if self.wantsPlay { self.player?.playImmediately(atRate: Float(self.speed)) }; self.emit() }
                            }
                        }
                    }
                    self.emit()
                }
            }
            self.playbackObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in DispatchQueue.main.async { self?.emit() } }
            self.timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] _ in self?.emit() }
            self.save(); self.emit(); call.resolve(self.snapshot())
        }
    }

    private func start() throws {
        guard let player = player else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [])
        try session.setActive(true)
        wantsPlay = true; failure = ""
        if position >= duration - 0.1 && duration > 0 { move(to: 0) }
        if pendingSeek == nil { player.playImmediately(atRate: Float(speed)) }
        emit()
    }
    private func stop() {
        wantsPlay = false; player?.pause(); music?.pause(); save(); emit()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    private func move(to seconds: Double) {
        position = max(0, min(seconds, duration)); pendingSeek = position
        guard let player = player else { pendingSeek = nil; save(); emit(); return }
        player.seek(to: CMTime(seconds: position, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            DispatchQueue.main.async { guard let self = self else { return }; self.pendingSeek = nil; if self.wantsPlay { self.player?.playImmediately(atRate: Float(self.speed)) }; self.save(); self.emit() }
        }
        save(); emit()
    }
    private func snapshot() -> [String: Any] {
        if pendingSeek == nil, let seconds = player?.currentTime().seconds, seconds.isFinite { position = max(0, seconds) }
        return ["placeId": placeId, "position": position, "duration": duration, "playing": wantsPlay, "loading": wantsPlay && player?.timeControlStatus != .playing, "speed": speed, "error": failure, "backgroundEnabled": backgroundEnabled, "backgroundPlaying": music?.timeControlStatus == .playing, "backgroundError": backgroundError]
    }
    private func save() {
        guard !placeId.isEmpty else { return }
        _ = snapshot()
        UserDefaults.standard.set(["placeId": placeId, "title": title, "url": source, "position": position, "duration": duration, "speed": speed], forKey: storageKey)
        lastSaved = position
    }
    private func emit() {
        // Music follows audible narration, including stalls, interruptions and
        // lock-screen controls. It always stays at normal speed and low volume.
        if backgroundEnabled && wantsPlay && player?.timeControlStatus == .playing && pendingSeek == nil {
            if music?.rate == 0 { music?.play() }
        } else { music?.pause() }
        let data = snapshot()
        if abs(position - lastSaved) >= 5 { save() }
        if !placeId.isEmpty {
            var info: [String: Any] = [MPMediaItemPropertyTitle: title, MPMediaItemPropertyArtist: "Зилант", MPMediaItemPropertyAlbumTitle: "Я шагаю по Казани", MPMediaItemPropertyPlaybackDuration: duration, MPNowPlayingInfoPropertyElapsedPlaybackTime: position, MPNowPlayingInfoPropertyPlaybackRate: wantsPlay ? speed : 0]
            if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
        if UIApplication.shared.applicationState == .active { notifyListeners("stateChange", data: data) }
    }
    @objc func play(_ call: CAPPluginCall) { DispatchQueue.main.async { do { try self.start(); call.resolve(self.snapshot()) } catch { call.reject("Не удалось включить аудио.") } } }
    @objc func pause(_ call: CAPPluginCall) { DispatchQueue.main.async { self.stop(); call.resolve(self.snapshot()) } }
    @objc func seek(_ call: CAPPluginCall) { DispatchQueue.main.async { self.move(to: call.getDouble("seconds") ?? 0); call.resolve(self.snapshot()) } }
    @objc func setSpeed(_ call: CAPPluginCall) { DispatchQueue.main.async { self.speed = max(1, min(call.getDouble("speed") ?? 1, 2)); if self.wantsPlay { self.player?.rate = Float(self.speed) }; self.save(); self.emit(); call.resolve(self.snapshot()) } }
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.snapshot()) } }
    @objc func setBackground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let enabled = call.getBool("enabled") ?? false
            if enabled {
                guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https", url.host == "kazan-demo.38-180-191-162.sslip.io", url.path.hasPrefix("/media/") else {
                    call.reject("Недопустимый адрес музыки."); return
                }
                if self.music == nil || self.musicLooper?.status == .failed {
                    self.music?.pause(); self.musicObserver?.invalidate()
                    self.musicLooper?.disableLooping(); self.musicLooper = nil
                    let queue = AVQueuePlayer()
                    queue.volume = Float(max(0, min(call.getDouble("volume") ?? 0.08, 0.15)))
                    self.music = queue
                    let looper = AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url))
                    self.musicLooper = looper
                    self.musicObserver = looper.observe(\.status, options: [.new]) { [weak self] looper, _ in
                        DispatchQueue.main.async {
                            guard let self = self, self.musicLooper === looper, looper.status == .failed else { return }
                            self.backgroundEnabled = false; self.music?.pause()
                            self.backgroundError = "Музыкальный фон недоступен. Рассказ продолжается; фон можно включить ещё раз."
                            self.emit()
                        }
                    }
                }
            }
            self.backgroundEnabled = enabled; self.backgroundError = ""
            self.emit(); call.resolve(self.snapshot())
        }
    }
}
