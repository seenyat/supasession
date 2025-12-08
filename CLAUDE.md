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
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

## Monorepo Structure

| Package | Path | Description |
|---------|------|-------------|
| `@supasession/shared` | `shared/` | Shared TypeScript types and Effect/Schema message definitions |
| `@supasession/relay` | `relay/` | WebSocket relay server (Node + ws) |
| `@supasession/web` | `web/` | React web app with Motion animations |
| `@supasession/extension` | `extension/` | Spicetify extension messenger |

Legacy code in `src/` is the old Spicetify custom app (deprecated).

## Build Commands

```bash
# Development
pnpm dev              # Start relay + web in parallel
pnpm dev:relay        # Start relay server only (ws://localhost:17777)
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
- **Fetches images for first 2 next/prev tracks** for drag preview functionality
- Displays green badge with session ID (click to copy)
- Handles control commands from consumers (play/pause/next/prev/seek)

### Relay Server (`relay/src/index.ts`)
- WebSocket server on port 17777
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
- **BlurredBackground.tsx** - Canvas-based blurred album art background with slow rotation, uses flex centering to avoid transform conflicts with rotation animation
- **Session.tsx** - QR code display for session sharing
- **hooks/useWebSocket.ts** - Effect-based WebSocket client with reconnection
- **hooks/useDominantColor.ts** - Extracts dominant color from album art (uses base64 data)
- **stores/playerStore.ts** - Zustand store for player state, queue, dominant color

### Shared (`shared/src/`)
- **types.ts** - TypeScript interfaces (Track, PlayerState, QueueState, etc.)
- **schemas.ts** - Effect/Schema definitions for message validation

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
- `control` - Playback commands (play/pause/next/prev/seek)
- `sessions` - List of available sessions (for auto-join)
- `error` - Error messages

## Key Features

### Album Art with Base64 Data
The extension fetches album art and converts to base64 inside Spotify's Electron context (no CORS restrictions). This allows the web app to:
- Use canvas for blurred background (would fail with cross-origin URLs)
- Extract dominant colors with fast-average-color
- Display images without CORS issues

### Drag-to-Skip
Dragging the album art left/right:
- Shows prev/next track album art sliding in from sides (z-index above current)
- Shows prev/next track labels sliding in below album art (replacing current label)
- Current album art applies hue-rotate and blur effects during drag
- Current label slides down and fades out rapidly to avoid overlap
- Triggers skip when drag exceeds threshold (120px)
- Sends control command to extension
- Uses single `dragX` motion value as source of truth with `useTransform` for all derived animations
- Spring physics for snappy feel (stiffness: 650, damping: 40)
- Commit state with scale pop and white overlay flash when threshold crossed

### Tempo-Synced Animations
Album art bounces to the beat:
- 3D rotation (rotateX, rotateY, rotateZ)
- Scale pulsing
- Dynamic box-shadow
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

The app uses a layered approach for the background and content:

```
z-0   : BlurredBackground (canvas with rotating blurred album art)
z-[1] : Color overlay (dominant color at 50% opacity, blends with canvas)
z-10  : Main content container
z-20  : Prev/next album art previews (appear above current during drag)
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

This avoids imperative `animationControls` and ensures all animations stay in sync.
