# SteuerChat Backend

Streaming chat backend built with NestJS and socket.io.

## Requirements

- Node.js 20.x
- npm 10.x

## Setup

```bash
cd backend
npm install
npm run start:dev
```

The server starts on port 3000 by default. Set the `PORT` environment variable to override.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start` | Start in production mode |
| `npm run start:dev` | Start with file watching |
| `npm run build` | Compile TypeScript |
| `npm test` | Run unit tests |

## Protocol

The server communicates over socket.io with the following events:

- **Client to Server:** `send-message`, `cancel`, `resume`
- **Server to Client:** `stream-chunk`, `stream-end`, `stream-cancelled`, `catch-up`, `error`

See the project `PLAN.md` for the full protocol specification and state machine.
