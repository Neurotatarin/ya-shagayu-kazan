import Foundation
import CryptoKit
import Network
import Capacitor

enum KazanOfflineStore {
    static let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("KazanOffline", isDirectory: true)
    static let blobs = root.appendingPathComponent("files", isDirectory: true)
    static let manifests = root.appendingPathComponent("packages", isDirectory: true)
    static let mapLimit: Int64 = 50_000_000
    static let packageLimit: Int64 = 300_000_000
    static let reserve: Int64 = 200_000_000
    static let userAgent = "YaShagayuKazan/0.4 (iPhone offline; github.com/Neurotatarin/ya-shagayu-kazan)"

    static func prepare() throws {
        for directory in [root, blobs, manifests] {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
        }
        var directory = root
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }
    static func allowed(_ raw: String) -> URL? {
        guard let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil, !url.pathComponents.contains(".."), url.port == nil || url.port == 443 else { return nil }
        if url.host == "tiles.openfreemap.org" { return url }
        if url.host == "kazan-demo.38-180-191-162.sslip.io", url.path.hasPrefix("/media/") { return url }
        return nil
    }
    static func file(_ raw: String) -> URL {
        let hash = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        let ext = URL(string: raw)?.pathExtension.lowercased() ?? "bin"
        let safeExtension = ext.range(of: "^[a-z0-9]{1,6}$", options: .regularExpression) != nil ? ext : "bin"
        return blobs.appendingPathComponent(hash + "." + safeExtension)
    }
    static func size(_ url: URL) -> Int64? {
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]), values.isRegularFile == true, let size = values.fileSize else { return nil }
        return Int64(size)
    }
    static func localAudio(_ url: URL) -> Bool {
        guard url.isFileURL, url.pathExtension == "mp3" || url.pathExtension == "m4a" else { return false }
        let path = url.resolvingSymlinksInPath().standardizedFileURL.path
        return path.hasPrefix(blobs.resolvingSymlinksInPath().standardizedFileURL.path + "/") && (size(url) ?? 0) > 0
    }
    static func availableBytes() -> Int64 {
        if let capacity = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage { return capacity }
        return ((try? FileManager.default.attributesOfFileSystem(forPath: root.path)[.systemFreeSize]) as? NSNumber)?.int64Value ?? 0
    }
    static func manifest(_ id: String) -> URL { manifests.appendingPathComponent(id + ".json") }
}

@objc(KazanOfflinePlugin)
public final class KazanOfflinePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KazanOfflinePlugin"
    public let jsName = "KazanOffline"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "estimate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "ru.yashagayu.kazan.offline")
    private let monitor = NWPathMonitor()
    private var connected = true
    private var job: KazanOfflineDownload?
    private var estimates: [String: Int64] = [:]
    private lazy var metadataSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpAdditionalHeaders = ["User-Agent": KazanOfflineStore.userAgent]
        config.httpMaximumConnectionsPerHost = 2
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 60
        return URLSession(configuration: config)
    }()

    public override func load() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            self.connected = path.status == .satisfied
            self.event("networkChange", ["connected": self.connected])
        }
        monitor.start(queue: queue)
        queue.async { try? KazanOfflineStore.prepare(); try? self.collectUnusedFiles() }
    }
    private func event(_ name: String, _ data: [String: Any]) {
        DispatchQueue.main.async { self.notifyListeners(name, data: data) }
    }
    private func packages() -> [[String: Any]] {
        guard let urls = try? FileManager.default.contentsOfDirectory(at: KazanOfflineStore.manifests, includingPropertiesForKeys: nil) else { return [] }
        return urls.filter { $0.pathExtension == "json" }.compactMap { url in
            guard let data = try? Data(contentsOf: url), var record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let assets = record["assets"] as? [[String: Any]] else { return nil }
            var files: [String: String] = [:]
            for asset in assets {
                guard let raw = asset["url"] as? String, KazanOfflineStore.allowed(raw) != nil, KazanOfflineStore.size(KazanOfflineStore.file(raw)) != nil else { return nil }
                files[raw] = KazanOfflineStore.file(raw).absoluteString
            }
            record["files"] = files
            return record
        }.sorted { ($0["downloadedAt"] as? String ?? "") > ($1["downloadedAt"] as? String ?? "") }
    }
    private func collectUnusedFiles() throws {
        let referenced = Set(packages().flatMap { ($0["assets"] as? [[String: Any]] ?? []).compactMap { ($0["url"] as? String).map { KazanOfflineStore.file($0).lastPathComponent } } })
        for file in (try? FileManager.default.contentsOfDirectory(at: KazanOfflineStore.blobs, includingPropertiesForKeys: nil)) ?? [] where !referenced.contains(file.lastPathComponent) {
            try FileManager.default.removeItem(at: file)
        }
    }
    @objc func getState(_ call: CAPPluginCall) {
        queue.async {
            do {
                try KazanOfflineStore.prepare()
                var state: [String: Any] = ["ready": true, "connected": self.connected, "packages": self.packages(), "availableBytes": KazanOfflineStore.availableBytes(), "error": ""]
                if let job = self.job { state["transfer"] = job.snapshot() }
                call.resolve(state)
            } catch { call.reject("Хранилище iPhone недоступно.", "OFFLINE_STORAGE") }
        }
    }
    @objc func fetchMetadata(_ call: CAPPluginCall) {
        queue.async {
        guard let raw = call.getString("url"), let url = KazanOfflineStore.allowed(raw) else { call.reject("Недопустимый адрес материала.", "OFFLINE_URL"); return }
        self.metadataSession.dataTask(with: url) { data, response, error in
            guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200, let data = data, data.count <= 2_000_000,
                  let value = try? JSONSerialization.jsonObject(with: data) else { call.reject("Не удалось получить состав пакета.", "OFFLINE_NETWORK"); return }
            call.resolve(["value": value])
        }.resume()
        }
    }
    private func assets(_ plan: [String: Any]) throws -> [[String: Any]] {
        guard plan["schema"] as? Int == 1, let id = plan["id"] as? String, id.range(of: "^[a-z][a-z0-9-]{1,64}$", options: .regularExpression) != nil,
              let language = plan["language"] as? String, ["ru", "en", "ar"].contains(language),
              let places = plan["placeIds"] as? [String], !places.isEmpty, places.count <= 20,
              let list = plan["assets"] as? [[String: Any]], !list.isEmpty, list.count <= 4000,
              let map = plan["map"] as? [String: Any], let count = map["tileCount"] as? Int, count > 0, count <= 3000,
              ((plan["kind"] as? String == "content" && plan["mapId"] as? String == "kazan-city-map" && list.allSatisfy { $0["kind"] as? String == "media" && $0["tile"] as? Bool != true }) || (plan["kind"] as? String != "content" && count == list.filter({ $0["tile"] as? Bool == true }).count)) else { throw NSError(domain: "Offline", code: 1) }
        if let kind = plan["kind"] as? String {
            guard ["city-map", "content"].contains(kind) else { throw NSError(domain: "Offline", code: 1) }
            if kind == "city-map" {
                guard id == "kazan-city-map", list.allSatisfy({ $0["kind"] as? String == "map" }) else { throw NSError(domain: "Offline", code: 1) }
            }
        }
        var seen = Set<String>()
        for asset in list {
            guard let raw = asset["url"] as? String, KazanOfflineStore.allowed(raw) != nil, let kind = asset["kind"] as? String, ["map", "media"].contains(kind), seen.insert(raw).inserted else { throw NSError(domain: "Offline", code: 1) }
        }
        return list
    }
    private func signature(_ plan: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: plan, options: [.sortedKeys])
        guard data.count <= 3_000_000 else { throw NSError(domain: "Offline", code: 1) }
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    @objc func estimate(_ call: CAPPluginCall) {
        queue.async {
            guard let plan = call.getObject("plan") else { call.reject("Некорректный пакет.", "OFFLINE_PLAN"); return }
            do {
                try KazanOfflineStore.prepare()
                let assets = try self.assets(plan)
                let media = assets.filter { $0["kind"] as? String == "media" }
                let signature = try self.signature(plan)
                let missingMap = assets.contains { $0["kind"] as? String == "map" && ($0["url"] as? String).flatMap({ KazanOfflineStore.size(KazanOfflineStore.file($0)) }) == nil }
                self.estimateMedia(media, index: 0, bytes: 0, mapUpper: missingMap ? KazanOfflineStore.mapLimit : 0, signature: signature, call: call)
            } catch { call.reject("Не удалось подготовить пакет.", "OFFLINE_PLAN") }
        }
    }
    private func estimateMedia(_ assets: [[String: Any]], index: Int, bytes: Int64, mapUpper: Int64, signature: String, call: CAPPluginCall) {
        if index == assets.count {
            let upper = min(KazanOfflineStore.packageLimit, bytes + mapUpper)
            estimates[signature] = upper
            call.resolve(["upperBytes": upper, "availableBytes": KazanOfflineStore.availableBytes(), "enoughSpace": KazanOfflineStore.availableBytes() >= upper + KazanOfflineStore.reserve]); return
        }
        guard let raw = assets[index]["url"] as? String, let url = KazanOfflineStore.allowed(raw) else { call.reject("Некорректный пакет.", "OFFLINE_PLAN"); return }
        if KazanOfflineStore.size(KazanOfflineStore.file(raw)) != nil { estimateMedia(assets, index: index + 1, bytes: bytes, mapUpper: mapUpper, signature: signature, call: call); return }
        var request = URLRequest(url: url); request.httpMethod = "HEAD"
        metadataSession.dataTask(with: request) { _, response, error in
            self.queue.async {
                guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200, response.expectedContentLength >= 0 else { call.reject("Не удалось определить размер пакета.", "OFFLINE_NETWORK"); return }
                let next = bytes + response.expectedContentLength
                guard next + mapUpper <= KazanOfflineStore.packageLimit else { call.reject("Пакет слишком большой.", "OFFLINE_LIMIT"); return }
                self.estimateMedia(assets, index: index + 1, bytes: next, mapUpper: mapUpper, signature: signature, call: call)
            }
        }.resume()
    }
    @objc func download(_ call: CAPPluginCall) {
        queue.async {
            guard self.job == nil else { call.reject("Другая загрузка ещё выполняется.", "OFFLINE_BUSY"); return }
            guard self.connected else { call.reject("Для скачивания нужен интернет.", "OFFLINE_NETWORK"); return }
            guard let plan = call.getObject("plan") else { call.reject("Некорректный пакет.", "OFFLINE_PLAN"); return }
            do {
                try KazanOfflineStore.prepare()
                let assets = try self.assets(plan)
                if plan["kind"] as? String == "content", !self.packages().contains(where: { $0["id"] as? String == "kazan-city-map" }) {
                    call.reject("Сначала скачай карту Казани.", "OFFLINE_PREPARE"); return
                }
                let signature = try self.signature(plan)
                guard let upper = self.estimates[signature] else { call.reject("Сначала проверь состав и размер пакета.", "OFFLINE_PREPARE"); return }
                guard KazanOfflineStore.availableBytes() >= upper + KazanOfflineStore.reserve else { call.reject("Недостаточно свободного места на iPhone.", "OFFLINE_STORAGE"); return }
                let download = KazanOfflineDownload(plan: plan, assets: assets, queue: self.queue, progress: { [weak self] state in self?.event("transferChange", state) }, finished: { [weak self] code in
                    guard let self = self else { return }
                    self.job = nil
                    if let code = code { try? self.collectUnusedFiles(); call.reject(code == "OFFLINE_CANCELLED" ? "Загрузка отменена." : "Не удалось скачать пакет.", code) }
                    else { try? self.collectUnusedFiles(); self.event("packagesChange", [:]); call.resolve(["saved": true]) }
                    self.event("transferChange", ["finished": true])
                })
                self.job = download; download.start()
            } catch { call.reject("Не удалось подготовить пакет.", "OFFLINE_PLAN") }
        }
    }
    @objc func cancel(_ call: CAPPluginCall) {
        queue.async {
            self.job?.cancel()
            self.metadataSession.getAllTasks { tasks in
                for task in tasks { task.cancel() }
                self.queue.async { call.resolve() }
            }
        }
    }
    @objc func remove(_ call: CAPPluginCall) {
        queue.async {
            guard self.job == nil else { call.reject("Дождись завершения или отмени загрузку.", "OFFLINE_BUSY"); return }
            guard let id = call.getString("id"), id.range(of: "^[a-z][a-z0-9-]{1,64}$", options: .regularExpression) != nil else { call.reject("Некорректный пакет.", "OFFLINE_PLAN"); return }
            do {
                let file = KazanOfflineStore.manifest(id)
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
                try self.collectUnusedFiles()
                self.event("packagesChange", [:]); call.resolve()
            } catch { call.reject("Не удалось удалить пакет.", "OFFLINE_STORAGE") }
        }
    }
    deinit { monitor.cancel(); metadataSession.invalidateAndCancel() }
}

private final class KazanOfflineDownload: NSObject, URLSessionDownloadDelegate {
    private let plan: [String: Any]
    private let assets: [[String: Any]]
    private let queue: DispatchQueue
    private let progress: ([String: Any]) -> Void
    private let completed: (String?) -> Void
    private var session: URLSession!
    private var tasks: [Int: (asset: [String: Any], received: Int64)] = [:]
    private var cursor = 0
    private var filesReady = 0
    private var bytes: Int64 = 0
    private var mapBytes: Int64 = 0
    private var finished = false
    private var lastEvent = 0.0

    init(plan: [String: Any], assets: [[String: Any]], queue: DispatchQueue, progress: @escaping ([String: Any]) -> Void, finished: @escaping (String?) -> Void) {
        self.plan = plan; self.assets = assets; self.queue = queue
        self.progress = progress; self.completed = finished
        super.init()
        let config = URLSessionConfiguration.default
        config.httpAdditionalHeaders = ["User-Agent": KazanOfflineStore.userAgent]
        config.httpMaximumConnectionsPerHost = 2
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 600
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        let delegate = OperationQueue(); delegate.maxConcurrentOperationCount = 1; delegate.underlyingQueue = queue
        session = URLSession(configuration: config, delegate: self, delegateQueue: delegate)
    }
    func snapshot() -> [String: Any] {
        return ["id": plan["id"] as? String ?? "", "phase": "downloading", "completed": filesReady, "total": assets.count, "bytes": bytes + tasks.values.reduce(Int64(0)) { $0 + $1.received }]
    }
    func start() { next() }
    func cancel() { finish("OFFLINE_CANCELLED") }
    private func emit(force: Bool = false) {
        let now = Date().timeIntervalSince1970
        if force || now - lastEvent >= 0.2 { lastEvent = now; progress(snapshot()) }
    }
    private func isEmptyGlyph(_ raw: String) -> Bool { URL(string: raw)?.path.hasPrefix("/fonts/") == true && raw.hasSuffix(".pbf") }
    private func addSize(_ size: Int64, _ asset: [String: Any]) -> Bool {
        bytes += size
        if asset["kind"] as? String == "map" { mapBytes += size }
        if bytes > KazanOfflineStore.packageLimit || mapBytes > KazanOfflineStore.mapLimit { finish("OFFLINE_LIMIT"); return false }
        return true
    }
    private func next() {
        guard !finished else { return }
        while tasks.count < 2 && cursor < assets.count {
            let asset = assets[cursor]; cursor += 1
            guard let raw = asset["url"] as? String, let url = KazanOfflineStore.allowed(raw) else { finish("OFFLINE_URL"); return }
            if let size = KazanOfflineStore.size(KazanOfflineStore.file(raw)), size > 0 || isEmptyGlyph(raw) {
                guard addSize(size, asset) else { return }; filesReady += 1; continue
            }
            guard KazanOfflineStore.availableBytes() > KazanOfflineStore.reserve else { finish("OFFLINE_STORAGE"); return }
            var request = URLRequest(url: url)
            request.setValue(KazanOfflineStore.userAgent, forHTTPHeaderField: "User-Agent")
            let task = session.downloadTask(with: request)
            tasks[task.taskIdentifier] = (asset, 0); task.resume()
        }
        emit(force: true)
        if cursor == assets.count && tasks.isEmpty { commit() }
    }
    private func commit() {
        guard !finished, let id = plan["id"] as? String else { return }
        do {
            var record = plan
            record["downloadedAt"] = ISO8601DateFormatter().string(from: Date())
            record["bytes"] = bytes
            let data = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
            try data.write(to: KazanOfflineStore.manifest(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            finish(nil)
        } catch { finish("OFFLINE_STORAGE") }
    }
    private func finish(_ error: String?) {
        guard !finished else { return }
        finished = true; session.invalidateAndCancel(); completed(error)
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard !finished, var task = tasks[downloadTask.taskIdentifier] else { return }
        task.received = totalBytesWritten; tasks[downloadTask.taskIdentifier] = task
        let pending = tasks.values.reduce(Int64(0)) { $0 + $1.received }
        let pendingMap = tasks.values.filter { $0.asset["kind"] as? String == "map" }.reduce(Int64(0)) { $0 + $1.received }
        if bytes + pending > KazanOfflineStore.packageLimit || mapBytes + pendingMap > KazanOfflineStore.mapLimit { finish("OFFLINE_LIMIT"); return }
        if KazanOfflineStore.availableBytes() <= KazanOfflineStore.reserve { finish("OFFLINE_STORAGE"); return }
        emit()
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard !finished, let task = tasks[downloadTask.taskIdentifier], let raw = task.asset["url"] as? String,
              let response = downloadTask.response as? HTTPURLResponse else { finish("OFFLINE_NETWORK"); return }
        do {
            let file = KazanOfflineStore.file(raw)
            if response.statusCode == 404 && isEmptyGlyph(raw) {
                // An absent Unicode range is an empty glyph set, never a
                // substitute for a missing street tile, photo or recording.
                try Data().write(to: file, options: .atomic)
            } else {
                guard response.statusCode == 200, let size = KazanOfflineStore.size(location), size > 0 else { finish("OFFLINE_NETWORK"); return }
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
                try FileManager.default.moveItem(at: location, to: file)
            }
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: file.path)
            guard let size = KazanOfflineStore.size(file), addSize(size, task.asset) else { return }
            tasks.removeValue(forKey: downloadTask.taskIdentifier); filesReady += 1; next()
        } catch { finish("OFFLINE_STORAGE") }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if !finished && error != nil { finish("OFFLINE_NETWORK") }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, KazanOfflineStore.allowed(url.absoluteString) != nil, url.host == task.originalRequest?.url?.host else { completionHandler(nil); finish("OFFLINE_URL"); return }
        var redirected = request; redirected.setValue(KazanOfflineStore.userAgent, forHTTPHeaderField: "User-Agent")
        completionHandler(redirected)
    }
}
