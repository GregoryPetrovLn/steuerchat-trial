import SwiftUI

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 60) }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(message.displayText.isEmpty && message.isStreaming ? " " : message.displayText)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(bubbleBackground)
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                if message.isStreaming && !message.isUser {
                    streamingIndicator
                }
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
    }

    // MARK: - Subviews

    private var bubbleBackground: Color {
        message.isUser ? .blue : Color(.systemGray5)
    }

    private var streamingIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.gray)
                    .frame(width: 5, height: 5)
                    .opacity(0.6)
                    .animation(
                        .easeInOut(duration: 0.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.15),
                        value: message.isStreaming
                    )
            }
        }
        .padding(.leading, 8)
    }
}

#Preview {
    VStack(spacing: 12) {
        MessageBubble(message: .userMessage(text: "Hello!", messageId: "1"))
        MessageBubble(message: ChatMessage(
            id: UUID(), isUser: false, messageId: "1",
            text: "", streamedText: "This is a streaming response",
            isStreaming: true
        ))
    }
    .padding()
}
