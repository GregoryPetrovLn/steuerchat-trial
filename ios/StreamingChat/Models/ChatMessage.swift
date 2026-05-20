import Foundation

struct ChatMessage: Identifiable {
    let id: UUID
    let isUser: Bool
    let messageId: String

    /// The original text the user typed (only meaningful for user messages).
    var text: String

    /// Accumulates streamed words from the server.
    var streamedText: String

    /// True while the server is still sending chunks for this message.
    var isStreaming: Bool

    var displayText: String {
        isUser ? text : streamedText
    }

    // MARK: - Convenience initialisers

    static func userMessage(text: String, messageId: String) -> ChatMessage {
        ChatMessage(
            id: UUID(),
            isUser: true,
            messageId: messageId,
            text: text,
            streamedText: "",
            isStreaming: false
        )
    }

    static func serverMessage(messageId: String) -> ChatMessage {
        ChatMessage(
            id: UUID(),
            isUser: false,
            messageId: messageId,
            text: "",
            streamedText: "",
            isStreaming: true
        )
    }
}
