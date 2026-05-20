# Streaming Chat Prototype

Real-time streaming chat system: NestJS backend streams text over socket.io at ~5 words/sec; native SwiftUI iOS app displays words as they arrive, with support for mid-stream cancellation and transparent reconnect/resume.

## Tech Stack

| Component | Version |
|-----------|---------|
| Node.js | 20.x LTS |
| NestJS | 10.x |
| socket.io | 4.7.x |
| TypeScript | 5.x |
| Swift | 5.9+ |
| iOS target | 17.0+ |
| Xcode | 15+ |
| socket.io-client-swift | 16.x (SPM) |

## Quick Start: Backend

```bash
cd backend
npm install
npm run start:dev
```

Server starts on `http://localhost:3000`.

## Quick Start: iOS App

1. Open `ios/StreamingChat.xcodeproj` in Xcode 15+.
2. Xcode will resolve the `socket.io-client-swift` SPM dependency automatically.
3. Select a simulator (iOS 17+) and press **Cmd+R** to build and run.
4. The app connects to `localhost:3000` on launch.

## Project Structure

```
steuerchat-trial/
├── PLAN.md                     # Architecture plan and design decisions
├── WRITEUP.md                  # Technical explanation for reviewers
├── INTERVIEW_NOTES.md          # Interview prep cheat sheet
├── backend/
│   ├── src/
│   │   ├── main.ts             # Bootstrap, CORS, port config
│   │   ├── app.module.ts       # Root NestJS module
│   │   ├── types.ts            # Shared types/interfaces/enums
│   │   └── chat/
│   │       ├── chat.module.ts
│   │       ├── chat.gateway.ts     # Socket.io gateway: event handlers
│   │       ├── stream-session.ts   # StreamSession state machine + buffer
│   │       ├── session-manager.ts  # Session map + garbage collection
│   │       └── corpus.ts           # ~500-word text (Poe excerpt)
│   └── test/
│       ├── stream-session.spec.ts
│       └── session-manager.spec.ts
├── ios/
│   ├── StreamingChat.xcodeproj/
│   └── StreamingChat/
│       ├── StreamingChatApp.swift
│       ├── Models/
│       │   ├── ChatMessage.swift
│       │   └── ConnectionState.swift
│       ├── Networking/
│       │   └── SocketService.swift
│       ├── ViewModels/
│       │   └── ChatViewModel.swift
│       └── Views/
│           ├── ChatView.swift
│           ├── MessageBubble.swift
│           └── ConnectionBanner.swift
└── scripts/
    ├── package.json
    └── tsconfig.json
```

## Documentation

- **[WRITEUP.md](./WRITEUP.md)** -- Technical deep-dive for reviewers
- **[PLAN.md](./PLAN.md)** -- Architecture plan and design decisions
