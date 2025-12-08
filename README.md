# SupaSession

A modern music visualization web app that syncs with Spotify via WebSocket.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Spicetify       │     │  Relay Server    │     │  Web App         │
│  Extension       │────▶│  (Node + WS)     │◀────│  (React + Motion)│
│  (Producer)      │     │                  │     │  (Consumer)      │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                         │                        │
        └─────── WebSocket ───────┴──── WebSocket ─────────┘
```

- **extension/** - Spicetify extension that runs inside Spotify, sends player state
- **relay/** - WebSocket relay server that routes messages between producer and consumers
- **web/** - React web app with modern animations (Motion) that displays the current session
- **shared/** - Shared TypeScript types and Effect/Schema message definitions

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the relay server (terminal 1)
pnpm dev:relay

# Start the web app (terminal 2)
pnpm dev:web

# Build the Spicetify extension
pnpm build:extension
```

## How It Works

1. **Spicetify Extension** runs inside Spotify and generates a session ID
2. The extension connects to the relay server as a **producer**
3. The extension sends player state (current track, queue, play/pause) to the relay
4. **Web App** connects to the relay with the same session ID as a **consumer**
5. The web app receives real-time updates and displays them with smooth animations

## Session Pairing

1. In Spotify, the extension shows a badge with the session ID (click to copy)
2. Open the web app and paste the session ID, or use the URL `?session=<id>`
3. The web app connects and syncs with your Spotify playback

## Development

### Packages

| Package | Description | Port |
|---------|-------------|------|
| `@supasession/shared` | Shared types and schemas | - |
| `@supasession/relay` | WebSocket relay server | 17777 |
| `@supasession/web` | React web app | 3000 |
| `@supasession/extension` | Spicetify extension | - |

### Commands

```bash
pnpm dev          # Start relay + web in parallel
pnpm dev:relay    # Start relay server only
pnpm dev:web      # Start web app only
pnpm build        # Build all packages
pnpm check        # TypeScript check all packages
```

### Installing the Extension

After building, copy the extension to your Spicetify extensions folder:

```bash
pnpm build:extension
cp extension/dist/supasession-messenger.js ~/.config/spicetify/Extensions/
spicetify config extensions supasession-messenger.js
spicetify apply
```

## Tech Stack

- **React 18** with functional components and hooks
- **Motion** (framer-motion v11) for animations
- **Zustand** for state management
- **Effect** + **@effect/schema** for robust message handling
- **TailwindCSS** for styling
- **Vite** for fast development
- **WebSocket** for real-time communication

## Message Protocol

All messages use a versioned JSON envelope:

```typescript
interface Message {
  v: 1;              // Protocol version
  sessionId: string; // Session identifier
  kind: string;      // Message type
  ts: number;        // Timestamp
  payload: unknown;  // Type-specific payload
}
```

Message kinds:
- `hello` - Initial handshake (role: producer/consumer)
- `welcome` - Server acknowledgment
- `player_state` - Current playback state
- `queue_update` - Queue changed
- `heartbeat` - Keep-alive
- `control` - Playback commands (from consumer to producer)
- `error` - Error messages
