import Foundation
import Combine

@MainActor
final class ChatViewModel: ObservableObject {

    // MARK: - Published state

    @Published var messages: [ChatMessage] = []
    @Published var connectionState: ConnectionState = .offline
    @Published var inputText: String = ""
    @Published var isStreaming: Bool = false

    // MARK: - Stream tracking

    private var currentMessageId: String?
    private var lastWordIndex: Int = -1
    private var offlineTimer: Timer?

    // MARK: - Networking

    private let socketService = SocketService()

    // MARK: - Init

    init() {
        bindSocketCallbacks()
    }

    // MARK: - Public actions

    func connect() {
        socketService.connect()
    }

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }

        let messageId = UUID().uuidString
        inputText = ""

        // User bubble
        messages.append(.userMessage(text: text, messageId: messageId))

        // Empty server bubble that will fill as chunks arrive
        messages.append(.serverMessage(messageId: messageId))

        currentMessageId = messageId
        lastWordIndex = -1
        isStreaming = true

        socketService.sendMessage(messageId: messageId, text: text)
    }

    func cancelStream() {
        guard let messageId = currentMessageId, isStreaming else { return }
        socketService.cancelStream(messageId: messageId)
        finaliseStream()
    }

    // MARK: - Socket callbacks

    private func bindSocketCallbacks() {

        socketService.onConnect = { [weak self] in
            guard let self else { return }
            self.offlineTimer?.invalidate()
            self.offlineTimer = nil
            self.connectionState = .connected

            // Resume an in-progress stream after reconnect
            if let messageId = self.currentMessageId, self.isStreaming {
                self.socketService.resumeStream(
                    messageId: messageId,
                    lastWordIndex: self.lastWordIndex
                )
            }
        }

        socketService.onDisconnect = { [weak self] reason in
            guard let self else { return }
            self.connectionState = .reconnecting
            self.startOfflineTimer()
        }

        socketService.onStreamChunk = { [weak self] messageId, word, index in
            guard let self else { return }
            self.appendWord(word, index: index, for: messageId)
        }

        socketService.onStreamEnd = { [weak self] messageId, _ in
            guard let self else { return }
            if self.currentMessageId == messageId {
                self.finaliseStream()
            }
        }

        socketService.onCatchUp = { [weak self] messageId, words in
            guard let self else { return }
            for entry in words {
                self.appendWord(entry.word, index: entry.index, for: messageId)
            }
        }

        socketService.onStreamCancelled = { [weak self] messageId, _ in
            guard let self else { return }
            if self.currentMessageId == messageId {
                self.finaliseStream()
            }
        }

        socketService.onError = { [weak self] messageId, message in
            guard let self else { return }
            // If the error is about the current stream, stop it
            if let mid = messageId, mid == self.currentMessageId {
                self.finaliseStream()
            }
            // Optionally surface the error as a system message
            let errorMsg = ChatMessage(
                id: UUID(),
                isUser: false,
                messageId: messageId ?? "",
                text: "",
                streamedText: "Error: \(message)",
                isStreaming: false
            )
            self.messages.append(errorMsg)
        }
    }

    // MARK: - Helpers

    private func appendWord(_ word: String, index: Int, for messageId: String) {
        guard let idx = messages.lastIndex(where: { $0.messageId == messageId && !$0.isUser }) else {
            return
        }
        // Only accept words newer than what we have
        guard index > lastWordIndex else { return }
        lastWordIndex = index

        let separator = messages[idx].streamedText.isEmpty ? "" : " "
        messages[idx].streamedText += separator + word
    }

    private func startOfflineTimer() {
        offlineTimer?.invalidate()
        offlineTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.connectionState = .offline
            }
        }
    }

    private func finaliseStream() {
        if let messageId = currentMessageId,
           let idx = messages.lastIndex(where: { $0.messageId == messageId && !$0.isUser }) {
            messages[idx].isStreaming = false
        }
        isStreaming = false
        currentMessageId = nil
        lastWordIndex = -1
    }
}
