# StreamingChat - iOS

Native SwiftUI chat app that connects to a socket.io backend and displays streamed responses in real time. Supports cancel mid-stream and automatic reconnect with resume.

## Prerequisites

- Xcode 15 or later
- iOS 17.0+ simulator or physical device
- The backend server running at `localhost:3000` (see `../backend/`)

## Setup

1. Open `StreamingChat.xcodeproj` in Xcode.
2. Xcode will automatically resolve the Swift Package Manager dependency (`socket.io-client-swift`). Wait for it to finish.
3. Select an iOS 17+ simulator (e.g. iPhone 15) or a physical device.
4. Press **Cmd+R** to build and run.

## Configuration

The server URL is set in `StreamingChat/Networking/SocketService.swift`:

```swift
private static let serverURL = URL(string: "http://localhost:3000")!
```

Change this to point to your backend if it runs on a different host or port.

### Running on a physical device

If you run the app on a real iPhone connecting to a Mac running the server:

1. Replace `localhost` with your Mac's local IP address (e.g. `http://192.168.1.42:3000`).
2. The app declares `NSLocalNetworkUsageDescription` in its Info.plist so iOS will prompt for local network access -- allow it.
3. Make sure both the Mac and the iPhone are on the same Wi-Fi network.

## Testing the reconnect scenario

1. Start the backend server and send a message in the app.
2. While the response is streaming, toggle **Airplane Mode** on the device (or disconnect the simulator's network via Network Link Conditioner).
3. The connection banner should turn yellow ("Reconnecting...").
4. Re-enable the network. The app will auto-reconnect, request catch-up from the server, and resume displaying the stream from where it left off.

## Architecture

```
StreamingChat/
  StreamingChatApp.swift       App entry point
  Models/
    ChatMessage.swift          Message data model
    ConnectionState.swift      Connection state enum
  Networking/
    SocketService.swift        socket.io client wrapper
  ViewModels/
    ChatViewModel.swift        Main state management (ObservableObject)
  Views/
    ChatView.swift             Main chat screen
    MessageBubble.swift        Individual message bubble
    ConnectionBanner.swift     Connection status indicator
```

## Protocol

The app communicates with the backend using the following socket.io events:

| Event | Direction | Payload |
|-------|-----------|---------|
| `send-message` | Client -> Server | `{ messageId, text }` |
| `stream-chunk` | Server -> Client | `{ messageId, word, index }` |
| `stream-end` | Server -> Client | `{ messageId, totalWords }` |
| `cancel` | Client -> Server | `{ messageId }` |
| `stream-cancelled` | Server -> Client | `{ messageId, lastIndex }` |
| `resume` | Client -> Server | `{ messageId, lastWordIndex }` |
| `catch-up` | Server -> Client | `{ messageId, words: [{word, index}] }` |
| `error` | Server -> Client | `{ messageId?, message }` |
