import { create } from "zustand";
import type { PlayerState, QueueState, LyricsState } from "@supasession/shared";

interface PlayerStore {
  sessionId: string | null;
  isConnected: boolean;
  connectionStatus: "disconnected" | "connecting" | "connected";

  playerState: PlayerState;
  queue: QueueState;
  lyrics: LyricsState | null;
  dominantColor: string;
  artworkTop: number;

  setSessionId: (sessionId: string | null) => void;
  setConnectionStatus: (status: "disconnected" | "connecting" | "connected") => void;
  setPlayerState: (state: PlayerState) => void;
  setQueue: (queue: QueueState) => void;
  setLyrics: (lyrics: LyricsState) => void;
  setDominantColor: (color: string) => void;
  setArtworkTop: (top: number) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  sessionId: null,
  isConnected: false,
  connectionStatus: "disconnected",

  playerState: {
    currentTrack: null,
    isPlaying: false,
    positionMs: 0,
    tempo: null,
    volume: 100,
    shuffleEnabled: false,
    repeatMode: "off",
    colors: null,
  },

  queue: {
    current: null,
    next: [],
    prev: [],
    version: 0,
  },

  lyrics: null,
  dominantColor: "#1a1a2e",
  artworkTop: 0,

  setSessionId: (sessionId) => set({ sessionId }),
  setConnectionStatus: (status) =>
    set({ connectionStatus: status, isConnected: status === "connected" }),
  setPlayerState: (playerState) => set({ playerState }),
  setQueue: (queue) => set({ queue }),
  setLyrics: (lyrics) => set({ lyrics }),
  setDominantColor: (color) => set({ dominantColor: color }),
  setArtworkTop: (top) => set({ artworkTop: top }),
}));
