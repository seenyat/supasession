import { useEffect, useRef, useCallback } from "react";
import * as Effect from "effect/Effect";
import * as S from "@effect/schema/Schema";
import {
  AnyMessageSchema,
  PlayerStateMessageSchema,
  QueueUpdateMessageSchema,
  LyricsMessageSchema,
  WelcomeMessageSchema,
} from "@supasession/shared";
import { usePlayerStore } from "../stores/playerStore";

const RELAY_URL = import.meta.env.VITE_RELAY_URL || "ws://localhost:17777";
const RECONNECT_DELAYS = [100, 500, 1000, 2000, 5000, 10000];

interface UseWebSocketOptions {
  sessionId?: string | null;
  autoJoin?: boolean;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const { sessionId = null, autoJoin = false } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const setConnectionStatus = usePlayerStore((s) => s.setConnectionStatus);
  const setSessionId = usePlayerStore((s) => s.setSessionId);
  const setPlayerState = usePlayerStore((s) => s.setPlayerState);
  const setQueue = usePlayerStore((s) => s.setQueue);
  const setLyrics = usePlayerStore((s) => s.setLyrics);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const raw = JSON.parse(event.data);

        // Handle sessions list (for choosing or auto-join failure)
        if (raw.kind === "sessions") {
          console.log("Available sessions:", raw.payload.sessions);
          return;
        }

        const welcomeResult = Effect.runSync(
          Effect.either(S.decodeUnknown(WelcomeMessageSchema)(raw))
        );
        if (welcomeResult._tag === "Right") {
          setSessionId(welcomeResult.right.payload.sessionId);
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;
          return;
        }

        const playerResult = Effect.runSync(
          Effect.either(S.decodeUnknown(PlayerStateMessageSchema)(raw))
        );
        if (playerResult._tag === "Right") {
          const payload = playerResult.right.payload;
          setPlayerState({
            ...payload,
            currentTrack: payload.currentTrack
              ? { 
                  ...payload.currentTrack, 
                  artists: [...payload.currentTrack.artists],
                  albumArtData: payload.currentTrack.albumArtData ?? null,
                }
              : null,
            colors: payload.colors ?? null,
          });
          return;
        }

        const queueResult = Effect.runSync(
          Effect.either(S.decodeUnknown(QueueUpdateMessageSchema)(raw))
        );
        if (queueResult._tag === "Right") {
          const payload = queueResult.right.payload;
          setQueue({
            current: payload.current
              ? { 
                  ...payload.current, 
                  artists: [...payload.current.artists],
                  albumArtData: payload.current.albumArtData ?? null,
                }
              : null,
            next: payload.next.map((t) => ({ 
              ...t, 
              artists: [...t.artists],
              albumArtData: t.albumArtData ?? null,
            })),
            prev: payload.prev.map((t) => ({ 
              ...t, 
              artists: [...t.artists],
              albumArtData: t.albumArtData ?? null,
            })),
          });
          return;
        }

        const lyricsResult = Effect.runSync(
          Effect.either(S.decodeUnknown(LyricsMessageSchema)(raw))
        );
        if (lyricsResult._tag === "Right") {
          const payload = lyricsResult.right.payload;
          setLyrics({
            trackId: payload.trackId,
            synced: payload.synced ? payload.synced.map((l) => ({ ...l })) : null,
            unsynced: payload.unsynced ? [...payload.unsynced] : null,
          });
          return;
        }

        const anyResult = Effect.runSync(
          Effect.either(S.decodeUnknown(AnyMessageSchema)(raw))
        );
        if (anyResult._tag === "Right") {
          console.log("Received message:", anyResult.right.kind);
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    },
    [setConnectionStatus, setSessionId, setPlayerState, setQueue, setLyrics]
  );

  const connect = useCallback(() => {
    if (!sessionId && !autoJoin) return;

    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    if (autoJoin) params.set("autoJoin", "true");
    
    const url = `${RELAY_URL}?${params.toString()}`;
    setConnectionStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          v: 1,
          sessionId: sessionId || "",
          kind: "hello",
          ts: Date.now(),
          payload: { role: "consumer" },
        })
      );
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;

      const delay =
        RECONNECT_DELAYS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
        ];
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [sessionId, handleMessage, setConnectionStatus]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus("disconnected");
  }, [setConnectionStatus]);

  const sendControl = useCallback(
    (command: { command: string; [key: string]: unknown }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && sessionId) {
        wsRef.current.send(
          JSON.stringify({
            v: 1,
            sessionId,
            kind: "control",
            ts: Date.now(),
            payload: command,
          })
        );
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (sessionId || autoJoin) {
      connect();
    }
    return () => disconnect();
  }, [sessionId, autoJoin, connect, disconnect]);

  return { sendControl, disconnect };
};
