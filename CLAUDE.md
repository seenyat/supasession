# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SupaSession** - A music visualization web app that syncs with Spotify via WebSocket. The architecture consists of:
1. A **Spicetify extension** (producer) running inside Spotify that sends player state
2. A **WebSocket relay server** that routes messages between producer and consumers
3. A **React web app** (consumer) that displays the current session with animations

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Spicetify       │     │  Relay Server    │     │  Web App         │
│  Extension       │────▶│  (Node + WS)     │◀────│  (React + Motion)│
│  (Producer)      │     │  ws://17777      │     │  (Consumer)      │
└──────────────────┘     │  http://17778    │     └──────────────────┘
                         └──────────────────┘
```

## Monorepo Structure

| Package | Path | Description |
|---------|------|-------------|
| `@supasession/shared` | `shared/` | Shared TypeScript types and Effect/Schema message definitions |
| `@supasession/relay` | `relay/` | WebSocket relay server (Node + ws) + HTTP API |
| `@supasession/web` | `web/` | React web app with Motion animations |
| `@supasession/extension` | `extension/` | Spicetify extension messenger |

Legacy code in `src/` is the old Spicetify custom app (deprecated).

## Build Commands

```bash
# Development
pnpm dev              # Start relay + web in parallel
pnpm dev:relay        # Start relay server only (ws://localhost:17777, http://localhost:17778)
pnpm dev:web          # Start web app only (http://localhost:3000)

# Build
pnpm build            # Build all packages
pnpm build:extension  # Build Spicetify extension
pnpm build:web        # Build web app
pnpm build:relay      # Build relay server

# Type checking
pnpm check            # TypeScript check all packages

# Deploy extension to Spicetify
pnpm build:extension && cp extension/dist/supasession-messenger.js ~/.config/spicetify/Extensions/ && spicetify apply

# Restart Spotify
pkill -x Spotify; sleep 1; open -a Spotify
```

## Key Components

### Extension (`extension/src/extensions/messenger.tsx`)
- Generates random session ID on init
- Connects to relay as WebSocket producer
- Sends `player_state` and `queue_update` messages
- Fetches album art as base64 (no CORS in Electron) and sends with messages
- **Fetches images for LAST 2 prev tracks** (most recent) for drag preview functionality
- Displays green badge with session ID (click to copy)
- Handles control commands from consumers (play/pause/next/prev/seek)

### Relay Server (`relay/src/index.ts`)
- **WebSocket server** on port 17777
- **HTTP API server** on port 17778 (for debugging and control)
- Routes messages from producer to consumers
- **Caches last `player_state` and `queue_update`** per session
- **Sends cached state to new consumers** immediately after welcome (fixes refresh losing data)
- Supports auto-join (consumer connects without sessionId, gets the only active session)
- Session discovery via `?autoJoin=true` query param
- Validates messages with Effect/Schema
- Cleans up cached state when producer disconnects

### Web App (`web/src/`)
- **App.tsx** - Main layout, auto-join logic, session connection
- **Player.tsx** - Album art with drag-to-skip, tempo-synced bounce animation, prev/next previews
- **BlurredBackground.tsx** - Canvas-based blurred album art background with slow rotation
- **Session.tsx** - Queue preview display (shows 2 prev + 6 next tracks)
- **hooks/useWebSocket.ts** - Effect-based WebSocket client with reconnection
- **hooks/useDominantColor.ts** - Extracts dominant color from album art (uses base64 data)
- **stores/playerStore.ts** - Zustand store for player state, queue, dominant color
- **state/playerMachine.ts** - XState machine for player control commands

### Shared (`shared/src/`)
- **types.ts** - TypeScript interfaces (Track, PlayerState, QueueState, etc.)
- **schemas.ts** - Effect/Schema definitions for message validation

## HTTP API (Relay)

The relay exposes an HTTP API on port 17778 for debugging and control:

```bash
# List active sessions
curl http://localhost:17778/api/sessions

# Send debug command (returns Spicetify API inspection)
curl http://localhost:17778/api/debug

# Send any control command
curl -X POST http://localhost:17778/api/control \
  -H "Content-Type: application/json" \
  -d '{"command": "next"}'
```

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
- `welcome` - Server acknowledgment with sessionId
- `player_state` - Current playback state including base64 album art
- `queue_update` - Queue changed
- `heartbeat` - Keep-alive
- `control` - Playback commands (play/pause/next/prev/seek/skipPrevious/debug)
- `sessions` - List of available sessions (for auto-join)
- `error` - Error messages
- `debug_response` - Spicetify API inspection data

## Control Commands

Available control commands sent from consumer to producer:

| Command | Description |
|---------|-------------|
| `play` | Resume playback |
| `pause` | Pause playback |
| `togglePlayPause` | Toggle play/pause |
| `next` | Skip to next track |
| `previous` | Skip to previous (rewinds if >3s into track) |
| `skipPrevious` | **Always** skip to previous track (never rewinds) |
| `seek` | Seek to position (`positionMs` param) |
| `setVolume` | Set volume (`volume` param, 0-100) |
| `debug` | Trigger Spicetify API inspection |

## Spicetify API Notes

### Undocumented but useful methods:

```typescript
// Skip to previous track WITHOUT rewind behavior
Spicetify.Platform.PlayerAPI.skipToPrevious()

// Skip to next track
Spicetify.Platform.PlayerAPI.skipToNext()

// Get current context (playlist/album)
Spicetify.Player.data.context

// PlayerAPI has many useful methods on its prototype:
// getState, play, pause, resume, skipToNext, skipToPrevious, skipTo,
// seekTo, seekBy, setShuffle, setRepeat, addToQueue, removeFromQueue,
// clearQueue, reorderQueue, insertIntoQueue, getQueue, playAsNextInQueue
```

### Queue ordering:
- `Spicetify.Queue.prevTracks` is **chronological** (oldest first)
- To get the immediate previous track: `prevTracks[prevTracks.length - 1]`
- `Spicetify.Queue.nextTracks[0]` is the immediate next track

## Key Features

### Album Art with Base64 Data
The extension fetches album art and converts to base64 inside Spotify's Electron context (no CORS restrictions). This allows the web app to:
- Use canvas for blurred background (would fail with cross-origin URLs)
- Extract dominant colors with fast-average-color
- Display images without CORS issues

### Drag-to-Skip
Dragging the album art left/right:
- **Drag LEFT** → Shows next track preview → Triggers `next` command
- **Drag RIGHT** → Shows prev track preview → Triggers `skipPrevious` command
- Shows prev/next track album art sliding in from sides (z-index above current)
- Shows prev/next track labels sliding in below album art
- Current album art applies hue-rotate and blur effects during drag
- Triggers skip when drag exceeds threshold (120px)
- Uses single `dragX` motion value as source of truth with `useTransform`
- Spring physics for snappy feel (stiffness: 650, damping: 40)

### Tempo-Synced Animations
Album art bounces to the beat:
- 3D rotation (rotateX, rotateY, rotateZ)
- Scale pulsing
- Dynamic box-shadow with glow
- Duration calculated from track tempo

### Auto-Join
Web app can auto-connect to the only active session:
1. Opens without `?session=` param
2. Connects with `?autoJoin=true`
3. If one producer exists, automatically joins
4. Updates URL with session ID

## Tech Stack

- **React 18** - UI framework
- **Motion (framer-motion v11)** - Animations
- **Zustand** - State management
- **XState** - State machine for player control
- **Effect + @effect/schema** - Message validation
- **TailwindCSS** - Styling
- **Vite** - Web app bundler
- **esbuild** - Extension bundler
- **pnpm workspaces** - Monorepo management

## Styling

- TailwindCSS for utility classes
- CSS filters for blur effects (blur, saturate, hue-rotate)
- Dynamic colors extracted from album art
- Contrast-aware text colors (white/black based on luminance)

## Visual Layers (z-index)

```
z-0   : BlurredBackground (canvas with rotating blurred album art)
z-[1] : Color overlay (dominant color at 50% opacity)
z-10  : Main content container
z-20  : Prev/next album art previews (appear above current during drag)
z-30  : Current draggable album art
```

## Animation Architecture (Player.tsx)

The drag-to-skip animation uses a single source of truth pattern:

1. **`dragX` MotionValue** - Raw drag offset, bound to the draggable element
2. **`dragXSpring`** - Smoothed version with spring physics for visual outputs
3. **`dragProgress`** - Normalized 0→1 as approaching threshold
4. **`dragDirection`** - -1 (next), 0 (idle), 1 (prev)
5. **`commit`** - Springs to 1 when threshold crossed (triggers visual feedback)

All derived animations use `useTransform`:
- Album art blur, hue-rotate, scale, opacity
- Preview positions and opacity
- Label positions and fade
- Commit overlay flash

## State Machine (playerMachine.ts)

XState machine handles player control with proper acknowledgment:

States: `ready` → `waitingAck` → `ready`

Events:
- `SERVER_QUEUE` / `SERVER_PLAYER` - Updates from extension
- `USER_NEXT` / `USER_PREV` - User initiated skip
- `USER_REWIND` - Seek to beginning
- `CTRL_ACK` / `CTRL_TIMEOUT` - Command acknowledgment

The machine sends control commands via `getSendControl()` callback and tracks pending commands.

## Troubleshooting

### Extension not responding
1. Rebuild: `pnpm build:extension`
2. Copy: `cp extension/dist/supasession-messenger.js ~/.config/spicetify/Extensions/`
3. Apply: `spicetify apply`
4. Restart Spotify

### Debug Spicetify APIs
```bash
curl http://localhost:17778/api/debug
```
Returns available PlayerAPI methods, queue state, and context info.

### Previous track shows wrong song
- `prev` array is chronological (oldest first)
- Use `prev[prev.length - 1]` for immediate previous
- Use `prev.slice(-2)` for last 2 tracks in Session.tsx
