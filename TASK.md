# Streaming Chat Prototype — Orchestrator Task

You are the orchestrator for a paid technical trial. Your job: deliver a complete,
working prototype (NestJS backend + native iOS SwiftUI app) that satisfies every
acceptance criterion below, plus all supporting materials I'll need to present this
on an interview call.

You have full autonomy. Spawn sub-agents via the Task tool whenever a unit of work
is large enough to benefit from isolation (separate context, parallel execution, or
a focused single responsibility). Don't ask me for permission between phases —
proceed through the whole plan. Only stop to ask if a requirement is genuinely
ambiguous and the wrong guess would waste >30 minutes of work.

---

## 1. Context: what's being evaluated

This trial tests real-time client/server engineering. The reviewers explicitly say
the reconnect/resume scenario is the most important part. They will likely ask me
to walk through the code live and make small changes. Therefore:

- Code must be clean, idiomatic, and explainable line-by-line.
- No clever tricks I can't defend. Prefer boring, obvious solutions.
- Every non-trivial design decision must be documented with rationale in the
  technical writeup so I can repeat the reasoning verbally.

## 2. Functional requirements (from the brief)

### Backend (NestJS + TypeScript + socket.io)
- WebSocket endpoint the iOS app connects to.
- Accepts any chat message from the client.
- Has one predefined ~500-word text (use a public-domain poem or short story
  excerpt; pick something neutral).
- On receiving a user message, streams the text back over the WebSocket at
  approximately 5 words per second.
- Supports cancellation: when the client cancels, the server stops sending
  immediately.
- Tracks the active session/message so a reconnecting client can resume from the
  correct word index.
- Survives temporary client disconnects without losing the active stream.

### iOS app (native SwiftUI, single screen)
- Text input + send button.
- Shows the user's sent message and the streaming server response (chunks visible
  as they arrive, not all at once).
- Stop/cancel button visible while streaming.
- Handles disconnect/reconnect gracefully; preserves chat state across reconnect.
- Shows connection state to the user (connected / reconnecting / offline / failed).
- After reconnect, missing chunks appear quickly and the response continues from
  the correct position.
- After a cancel or reconnect, the user can send another message normally — never
  stuck in a loading state.

### The reconnect scenario (the one they'll actually test)
Mid-stream, user toggles airplane mode → waits ~5s → toggles off. App detects
loss, shows reconnecting state, auto-reconnects, fast-forwards missed chunks,
resumes the stream from the correct position.

## 3. Design decisions you must make and document

Don't paper over these — pick a position, implement it, and explain it in
WRITEUP.md so I can defend it:

- **Session/message identity across reconnects.** socket.io gives a new socket.id
  on reconnect. Use a client-generated UUID (e.g. `messageId`) sent with every
  request and on resume. Server keys the active stream by `messageId`.
- **What the server does during a client disconnect.** Two reasonable choices:
  (a) keep advancing the stream into an in-memory buffer and flush on resume, or
  (b) pause the stream when no client is attached and resume on reconnect.
  Choice (b) is simpler and matches "continue from the correct position" without
  needing to drop a backlog. Pick one, justify it, implement it.
- **Cancel vs. disconnect.** These are different events. Cancel is an explicit
  client message → server destroys the stream state. Disconnect is transport-level
  → server keeps state for a TTL (e.g. 60s) then garbage-collects.
- **Catch-up after reconnect.** When the client resumes, server sends accumulated
  words as a single batch (or a few rapid chunks), then resumes the ~5 wps cadence.
  "Quickly after reconnect" in the brief means don't replay at 5 wps from scratch.
- **Storage.** In-memory Map keyed by messageId is fine — no persistence required.
  Note this limitation in WRITEUP.md.

## 4. Suggested agent decomposition

Use your judgment, but a reasonable split is:

1. **Architect pass (you, in the main thread).** Read this file, write `PLAN.md`
   with the chosen architecture, message protocol (event names + payload shapes),
   and the cancel/disconnect/resume state machine. Don't skip this — every
   sub-agent reads PLAN.md before coding.
2. **Backend agent.** Sub-agent. Builds the NestJS app in `backend/`. Implements
   the gateway, the StreamSession service (in-memory store, tick loop, cancel,
   pause-on-disconnect, resume-with-catchup), the ~500-word corpus, and a README
   for running locally.
3. **iOS agent.** Sub-agent. Builds the SwiftUI app in `ios/`. Implements a
   WebSocketClient (Starscream or socket.io-client-swift — pick one and justify),
   a ChatViewModel holding messages + connection state + current streamId, the
   ChatView, reconnect logic with backoff, and a README. The iOS agent should
   produce an Xcode project that opens and builds cleanly on a recent Xcode
   (target iOS 17+).
4. **QA / integration agent.** Sub-agent. Writes:
   - Backend unit tests for StreamSession (cancel stops emission; disconnect
     pauses; reconnect resumes from correct index; catch-up batch is correct).
   - A Node-based integration script `scripts/test-reconnect.ts` that connects as
     a socket.io client, sends a message, disconnects mid-stream, reconnects with
     the same messageId after 5s, and asserts the full text was received in
     order with no duplicates or gaps. This is the script I'll actually run to
     prove the reconnect works without needing a phone.
   - A short manual test plan in `TESTING.md` covering the airplane-mode flow on
     a real device.
5. **Docs agent.** Sub-agent. Writes `README.md` (top-level setup), `WRITEUP.md`
   (technical explanation: ws lifecycle, streaming, cancel, reconnect/resume,
   tradeoffs, what I'd improve with more time), and `INTERVIEW_NOTES.md` (see
   §6 — this one is for me, not the reviewer).

Run agents in parallel where dependencies allow (backend and iOS can be built in
parallel once PLAN.md exists; QA waits for backend; docs waits for everything).

## 5. Repository layout

```
/
├── README.md                  # top-level: what this is, how to run both sides
├── PLAN.md                    # architecture + protocol (you write this first)
├── WRITEUP.md                 # technical explanation for reviewers
├── TESTING.md                 # manual test plan
├── INTERVIEW_NOTES.md         # cheat sheet for me (not for the reviewer)
├── backend/                   # NestJS + socket.io
│   ├── README.md
│   ├── package.json
│   ├── src/...
│   └── test/...
├── ios/                       # SwiftUI app
│   ├── README.md
│   └── StreamingChat.xcodeproj + sources
└── scripts/
    └── test-reconnect.ts      # automated reconnect proof
```

Use a single git repo at the root. Make atomic commits with clear messages — the
reviewer will look at the history.

## 6. INTERVIEW_NOTES.md — what I need from you for the call

This file is for me to study before the interview. Include:

- **One-paragraph elevator pitch** of the architecture.
- **The message protocol table** (event name → direction → payload → meaning).
- **The state machine** of a StreamSession (states + transitions) as ASCII or
  a mermaid diagram.
- **Walk-through of the reconnect path**, step by step, with the exact code paths
  involved (file:line references). I should be able to open the files in order
  while talking.
- **Answers to the questions they said they'd ask:**
  - How does the WebSocket connection work?
  - How is streaming implemented?
  - How does cancellation stop the server response?
  - How does reconnect/resume work after a temporary disconnect?
  - What tradeoffs did you make?
  - What would you improve with more time?
- **Likely follow-up questions** (5–10) with crisp answers. Examples: "what if
  two devices use the same messageId?", "why pause instead of buffer?", "how
  would this scale to N servers?", "what breaks if the server restarts mid-stream?".
- **Five small live-change requests they might make** and the exact diff I'd
  write for each (e.g. "change rate to 10 wps", "add a typing indicator event",
  "persist sessions to Redis", "add auth", "add backpressure"). I want to have
  rehearsed these.

## 7. Acceptance criteria (must all pass before you stop)

- App sends a message; server responds with the long text.
- Response appears in chunks at ~5 wps.
- Stop button cancels and the server stops emitting immediately.
- Airplane-mode mid-response → reconnect → missing chunks fast-forward → stream
  continues from correct position.
- App never sticks in a loading state.
- User can send another message after cancel or reconnect.
- `scripts/test-reconnect.ts` passes when run against the local backend.
- Backend unit tests pass.
- All four READMEs (root, backend, ios, plus WRITEUP and INTERVIEW_NOTES) exist
  and are accurate.
- iOS project opens and builds in Xcode without manual fixes beyond what's
  documented in `ios/README.md`.

## 8. Working rules

- Verify as you go. After the backend agent finishes, run its tests. After the
  integration script exists, run it. Don't declare done until you've actually
  executed the proof.
- If something doesn't work, fix it before moving on. Don't leave TODOs.
- Prefer well-known libraries over custom code (socket.io's built-in reconnect,
  Starscream or the official socket.io swift client, NestJS's WsAdapter).
- Pin versions in package.json and document the exact Node, npm, Xcode, and iOS
  versions you targeted in the root README.
- When you finish, end with a single message summarizing: what's in the repo,
  how to run it (the three commands I'll type), how to run the reconnect proof,
  and anything you couldn't fully verify (e.g. you can't open Xcode yourself, so
  flag any iOS assumptions I should sanity-check).

Begin with PLAN.md. Then dispatch the agents.
