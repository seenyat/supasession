export type Role = "producer" | "consumer";

export type MessageKind =
  | "hello"
  | "welcome"
  | "player_state"
  | "queue_update"
  | "lyrics"
  | "heartbeat"
  | "control"
  | "error";

export interface Track {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumArtUrl: string | null;
  albumArtData: string | null; // base64 encoded image data
  durationMs: number;
}

export interface TrackColors {
  vibrant: string | null;
  prominent: string | null;
  desaturated: string | null;
  lightVibrant: string | null;
}

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMs: number;
  tempo: number | null;
  volume: number;
  shuffleEnabled: boolean;
  repeatMode: "off" | "track" | "context";
  colors: TrackColors | null;
}

export interface QueueState {
  current: Track | null;
  next: Track[];
  prev: Track[];
}

export interface LyricLine {
  startTime: number; // milliseconds
  text: string;
}

export interface LyricsState {
  trackId: string;
  synced: LyricLine[] | null;
  unsynced: string[] | null;
}

export type ControlCommand =
  | { command: "play" }
  | { command: "pause" }
  | { command: "togglePlayPause" }
  | { command: "next" }
  | { command: "previous" }
  | { command: "seek"; positionMs: number }
  | { command: "setVolume"; volume: number };

export interface HelloPayload {
  role: Role;
}

export interface WelcomePayload {
  sessionId: string;
  connectedAt: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type MessagePayload =
  | { kind: "hello"; payload: HelloPayload }
  | { kind: "welcome"; payload: WelcomePayload }
  | { kind: "player_state"; payload: PlayerState }
  | { kind: "queue_update"; payload: QueueState }
  | { kind: "lyrics"; payload: LyricsState }
  | { kind: "heartbeat"; payload: Record<string, never> }
  | { kind: "control"; payload: ControlCommand }
  | { kind: "error"; payload: ErrorPayload };

export interface Message<K extends MessageKind = MessageKind> {
  v: 1;
  sessionId: string;
  kind: K;
  ts: number;
  payload: Extract<MessagePayload, { kind: K }>["payload"];
}
