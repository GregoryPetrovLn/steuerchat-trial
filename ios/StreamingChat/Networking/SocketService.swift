import Foundation
import SocketIO

/// Thin wrapper around socket.io-client-swift.
/// All callbacks are dispatched on the **main queue** so callers can
/// update `@Published` properties directly.
final class SocketService {

    // MARK: - Configuration

    private static let serverURL = URL(string: "http://localhost:3000")!

    // MARK: - Socket.IO objects

    private let manager: SocketManager
    private let socket: SocketIOClient

    // MARK: - Callbacks

    var onConnect: (() -> Void)?
    var onDisconnect: ((String) -> Void)?
    var onStreamChunk: ((_ messageId: String, _ word: String, _ index: Int) -> Void)?
    var onStreamEnd: ((_ messageId: String, _ totalWords: Int) -> Void)?
    var onCatchUp: ((_ messageId: String, _ words: [(word: String, index: Int)]) -> Void)?
    var onStreamCancelled: ((_ messageId: String, _ lastIndex: Int) -> Void)?
    var onError: ((_ messageId: String?, _ message: String) -> Void)?

    // MARK: - Init

    init() {
        manager = SocketManager(
            socketURL: Self.serverURL,
            config: [
                .forceWebsockets(true),
                .reconnects(true),
                .reconnectWait(1),
                .reconnectWaitMax(5),
                .log(false)
            ]
        )
        socket = manager.defaultSocket
        setupHandlers()
    }

    // MARK: - Public API

    func connect() {
        socket.connect()
    }

    func disconnect() {
        socket.disconnect()
    }

    func sendMessage(messageId: String, text: String) {
        let payload: [String: Any] = [
            "messageId": messageId,
            "text": text
        ]
        socket.emit("send-message", payload)
    }

    func cancelStream(messageId: String) {
        let payload: [String: Any] = ["messageId": messageId]
        socket.emit("cancel", payload)
    }

    func resumeStream(messageId: String, lastWordIndex: Int) {
        let payload: [String: Any] = [
            "messageId": messageId,
            "lastWordIndex": lastWordIndex
        ]
        socket.emit("resume", payload)
    }

    // MARK: - Event Handlers

    private func setupHandlers() {

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.onConnect?()
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] data, _ in
            let reason = (data.first as? String) ?? "unknown"
            DispatchQueue.main.async {
                self?.onDisconnect?(reason)
            }
        }

        socket.on("stream-chunk") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any],
                  let messageId = payload["messageId"] as? String,
                  let word = payload["word"] as? String,
                  let index = payload["index"] as? Int else { return }
            DispatchQueue.main.async {
                self?.onStreamChunk?(messageId, word, index)
            }
        }

        socket.on("stream-end") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any],
                  let messageId = payload["messageId"] as? String,
                  let totalWords = payload["totalWords"] as? Int else { return }
            DispatchQueue.main.async {
                self?.onStreamEnd?(messageId, totalWords)
            }
        }

        socket.on("catch-up") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any],
                  let messageId = payload["messageId"] as? String,
                  let wordsRaw = payload["words"] as? [[String: Any]] else { return }

            let words: [(word: String, index: Int)] = wordsRaw.compactMap { entry in
                guard let word = entry["word"] as? String,
                      let index = entry["index"] as? Int else { return nil }
                return (word: word, index: index)
            }

            DispatchQueue.main.async {
                self?.onCatchUp?(messageId, words)
            }
        }

        socket.on("stream-cancelled") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any],
                  let messageId = payload["messageId"] as? String,
                  let lastIndex = payload["lastIndex"] as? Int else { return }
            DispatchQueue.main.async {
                self?.onStreamCancelled?(messageId, lastIndex)
            }
        }

        socket.on("error") { [weak self] data, _ in
            let payload = data.first as? [String: Any]
            let messageId = payload?["messageId"] as? String
            let message = (payload?["message"] as? String) ?? "Unknown error"
            DispatchQueue.main.async {
                self?.onError?(messageId, message)
            }
        }
    }
}
