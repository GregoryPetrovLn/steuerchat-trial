# Technical Writeup

## Overview

This is a streaming chat prototype with a NestJS backend and a native SwiftUI iOS client. The server streams a predefined ~500-word text (Edgar Allan Poe's "The Tell-Tale Heart") over socket.io at 5 words per second. The client renders words as they arrive, supports mid-stream cancellation, and transparently resumes after temporary network disconnects.

---

## WebSocket Lifecycle

The backend uses NestJS's `@WebSocketGateway` decorator to create a socket.io server (`chat.gateway.ts:20`). The gateway implements `OnGatewayConnection` and `OnGatewayDisconnect` for connection lifecycle hooks.

When a client connects, `handleConnection` logs the new socket ID (`chat.gateway.ts:39-41`). On the iOS side, `SocketService` creates a `SocketManager` pointing at `localhost:3000` with `forceWebsockets(true)` and auto-reconnect enabled (`SocketService.swift:31-39`). The app calls `connect()` when `ChatView` appears (`ChatView.swift:43`).

The gateway holds two maps for socket/message association (`chat.gateway.ts:32-33`):
- `messageToSocket: Map<string, string>` -- messageId to current socketId
- `socketToMessages: Map<string, Set<string>>` -- socketId to all its messageIds

This bidirectional mapping is critical: when a socket disconnects, the server can find all its active streams and pause them.

---

## Streaming Implementation

Streaming uses a tick-based approach: `setInterval` at 200ms (5 words/sec) in `StreamSession.start()` (`stream-session.ts:47-49`). Each tick calls `tick()` (`stream-session.ts:53-79`), which:

1. Checks if the corpus is exhausted -- if so, calls `complete()`.
2. Reads the current word from `CORPUS_WORDS` at `currentIndex`.
3. If state is `STREAMING` and a callback exists, emits `stream-chunk` with `{ messageId, word, index }`.
4. If state is `BUFFERING`, pushes `{ word, index }` to the internal buffer.
5. Increments `currentIndex`.

The emit callback is a closure created in `handleSendMessage` (`chat.gateway.ts:103-109`). It looks up the current socketId for the messageId and emits to that specific socket via `server.to(socketId).emit()`. This indirection means the callback always targets the right socket, even after reconnect.

**Why this approach:** A fixed-interval timer is simple, deterministic, and easy to test. It mimics LLM token streaming where tokens arrive at a roughly constant rate. The word index on every chunk lets the client detect gaps and the server compute catch-up ranges.

---

## Session Identity

The client generates a UUID for each message (`ChatViewModel.swift:39`) and sends it as `messageId` with the `send-message` event. All subsequent events (`cancel`, `resume`, `stream-chunk`, `catch-up`, `stream-end`) reference this `messageId`.

**Why not socket.id?** Socket.io assigns a new `socket.id` on every connection. After a network drop and reconnect, the client gets a different `socket.id`. If sessions were keyed by `socket.id`, the server would have no way to associate the new connection with the old stream. The client-generated `messageId` is stable across reconnects.

The server maintains three maps:
- `SessionManager.sessions: Map<messageId, StreamSession>` (`session-manager.ts:12`)
- `ChatGateway.messageToSocket: Map<messageId, socketId>` (`chat.gateway.ts:32`)
- `ChatGateway.socketToMessages: Map<socketId, Set<messageId>>` (`chat.gateway.ts:33`)

---

## Cancel Flow

1. Client calls `cancelStream(messageId:)` (`ChatViewModel.swift:56-58`), which emits `cancel { messageId }` via `SocketService.cancelStream` (`SocketService.swift:63-65`).
2. Server's `handleCancel` (`chat.gateway.ts:114-140`) finds the session, calls `session.cancel()` (`stream-session.ts:156-159`) which clears the interval timer and sets state to `CANCELLED`.
3. Server emits `stream-cancelled { messageId, lastIndex }` back to the client.
4. Server removes the session from both the socket mappings and the session manager.
5. Client receives `stream-cancelled`, calls `finaliseStream()` (`ChatViewModel.swift:142-150`) which sets `isStreaming = false` and clears tracking state.

Cancel is an explicit, clean teardown. The session is destroyed immediately -- no TTL, no buffer.

---

## Disconnect / Reconnect / Resume Flow

This is the core feature. Here is the step-by-step scenario:

### 1. Streaming in progress

The user sent a message. `StreamSession` is in `STREAMING` state, the 200ms timer is running, and words are being emitted to the connected socket.

### 2. Network drops

The transport layer fails (airplane mode, Wi-Fi toggle, etc.). Socket.io on the server detects the disconnect and fires `handleDisconnect` (`chat.gateway.ts:43-61`).

### 3. Server pauses the session

`handleDisconnect` iterates all messageIds associated with the disconnected socket (`chat.gateway.ts:46-58`). For each, it calls `session.pause()` (`stream-session.ts:100-112`):
- State changes from `STREAMING` to `BUFFERING`
- `socketId` and `emitCb` are set to `null`
- `disconnectedAt` is recorded for TTL tracking
- **The timer keeps running.** Subsequent ticks push words into `session.buffer` instead of emitting them (`stream-session.ts:69-71`).

### 4. Client shows reconnecting state

On the iOS side, `SocketService`'s disconnect handler fires (`SocketService.swift:86-91`). `ChatViewModel` sets `connectionState = .reconnecting` (`ChatViewModel.swift:78-81`). The `ConnectionBanner` appears in the UI (`ChatView.swift:10-12`).

### 5. Network restored, socket.io reconnects

Socket.io-client-swift has auto-reconnect with exponential backoff built in (`SocketService.swift:35-37`: `reconnectWait(1)`, `reconnectWaitMax(5)`). When the network comes back, the library establishes a new connection. The new connection has a new `socket.id`.

### 6. Client sends resume

`SocketService`'s connect handler fires (`SocketService.swift:80-84`). `ChatViewModel.onConnect` checks if there is an active stream (`ChatViewModel.swift:70`): if `currentMessageId` is set and `isStreaming` is true, it emits `resume { messageId, lastWordIndex }` (`ChatViewModel.swift:71-74`). The `lastWordIndex` tracks the highest word index the client has successfully received (`ChatViewModel.swift:135-136`).

### 7. Server processes resume

`handleResume` in the gateway (`chat.gateway.ts:142-199`):
1. Validates the payload (`chat.gateway.ts:148-160`).
2. Finds the session by messageId (`chat.gateway.ts:162`).
3. Updates socket mappings to point to the new socket (`chat.gateway.ts:180-181`).
4. Creates a new emit callback bound to the new socket (`chat.gateway.ts:183-188`).
5. Calls `session.resume(socketId, lastWordIndex, emitCallback)` (`chat.gateway.ts:190`).

Inside `StreamSession.resume()` (`stream-session.ts:118-153`):
1. Sets the new `socketId` and `emitCb`.
2. Clears `disconnectedAt`.
3. Builds the catch-up array: iterates from `lastWordIndex + 1` to `currentIndex - 1`, reconstructing missed words directly from the corpus array (`stream-session.ts:130-132`). This is more reliable than the buffer because it uses the source of truth.
4. Clears the buffer (`stream-session.ts:135`).
5. If the stream completed during disconnect, sends `stream-end` (`stream-session.ts:137-144`).
6. Otherwise, sets state back to `STREAMING` (`stream-session.ts:149`).

### 8. Catch-up delivered

Back in `handleResume`, if there are catch-up words, the server emits `catch-up { messageId, words }` (`chat.gateway.ts:192-194`). On the client, `onCatchUp` iterates the words array and calls `appendWord` for each (`ChatViewModel.swift:95-100`). The `appendWord` method has a guard: `index > lastWordIndex` (`ChatViewModel.swift:135`), preventing duplicates.

### 9. Normal streaming continues

The timer is still running. Now that state is back to `STREAMING` and a valid `emitCb` exists, subsequent ticks emit `stream-chunk` normally to the new socket. The client receives them and appends words. The stream completes when all corpus words have been sent.

---

## Garbage Collection

`SessionManager` runs a GC timer every 30 seconds (`session-manager.ts:16-18`). It removes:
- `BUFFERING` sessions older than 60 seconds (`session-manager.ts:50-52`)
- `COMPLETED` sessions older than 30 seconds (`session-manager.ts:53-56`)
- `CANCELLED` sessions immediately (`session-manager.ts:59`)

The module implements `OnModuleDestroy` to clean up all sessions and timers on shutdown (`session-manager.ts:72-83`).

---

## Tradeoffs

**In-memory storage.** All session state lives in `Map` objects in the Node process. A server restart loses every active stream. This is acceptable for a prototype but not for production.

**Buffer vs. pause.** I chose to keep the timer running during disconnect and buffer words. The alternative -- pausing the timer -- would mean the client waits the same wall-clock time regardless of the disconnect duration. Buffering mimics real LLM behavior (the model does not stop generating because a client dropped) and enables instant catch-up.

**No authentication.** Any client can connect, send messages, and resume any messageId. In production, you would validate ownership of the messageId during resume.

**No horizontal scaling.** Sessions are per-process. With multiple server instances behind a load balancer, a reconnecting client might hit a different instance that has no record of the session. Redis-backed sessions or sticky sessions would fix this.

**60s TTL for disconnected sessions.** This is an arbitrary but reasonable choice. Too short and the user cannot recover from a brief tunnel or elevator ride. Too long and the server accumulates stale sessions.

**Single concurrent stream per client.** The architecture supports multiple streams per socket (via the `socketToMessages` set), but the iOS client tracks only one `currentMessageId`.

---

## What I Would Improve With More Time

- **Redis-backed sessions** for horizontal scaling across multiple server instances.
- **Authentication** (JWT handshake middleware on socket.io) to validate client identity and messageId ownership.
- **Backpressure handling** -- check `socket.conn.transport.writable` before emitting; pause the timer if the client cannot keep up.
- **Rate limiting** to prevent abuse (max concurrent streams, max messages per minute).
- **Persistent chat history** -- store completed messages in a database so users can reload past conversations.
- **E2E tests with a real iOS simulator** (XCTest + a local server) in addition to the unit tests.
- **Metrics and observability** -- Prometheus counters for active sessions, stream completions, reconnects, and buffer sizes; structured JSON logging.
- **Configurable streaming rate** -- accept a `wordsPerSecond` parameter instead of hardcoding 200ms.
- **Multiple concurrent streams per client** -- allow the user to send a new message while one is still streaming.
