import { createMachine, assign } from "xstate";
import type { Track, PlayerState, QueueState } from "@supasession/shared";

export type Direction = "next" | "prev";

export interface PlayerMachineContext {
  queue: QueueState;
  player: PlayerState;
  pendingTrackId: string | null;
  pendingDir: Direction | null;
  pendingStartedAt: number | null;
}

type ServerQueueEvent = { type: "SERVER_QUEUE"; snapshot: QueueState };
type ServerPlayerEvent = { type: "SERVER_PLAYER"; state: PlayerState };
type UserSelectEvent = { type: "USER_SELECT"; trackId: string };
type UserNextEvent = { type: "USER_NEXT" };
type UserPrevEvent = { type: "USER_PREV"; allowRewind: boolean; positionMs: number };
type UserRewindEvent = { type: "USER_REWIND" };
type CtrlAckEvent = { type: "CTRL_ACK"; trackId?: string };
type CtrlTimeoutEvent = { type: "CTRL_TIMEOUT" };

export type PlayerMachineEvent =
  | ServerQueueEvent
  | ServerPlayerEvent
  | UserSelectEvent
  | UserNextEvent
  | UserPrevEvent
  | UserRewindEvent
  | CtrlAckEvent
  | CtrlTimeoutEvent;

type SendControl = (command: { command: string; [k: string]: any }) => void;
type SendControlGetter = () => SendControl;

const emptyQueue: QueueState = { prev: [], current: null, next: [], version: 0 };

const withVersion = (incoming?: number | null, current?: number | null) =>
  incoming ?? current ?? 0;

const neighborPick = (queue: QueueState, dir: Direction): Track | null => {
  if (dir === "next") return queue.next[0] ?? null;
  // prev is chronological (oldest first), so last item is immediate previous
  return queue.prev[queue.prev.length - 1] ?? null;
};

export const createPlayerMachine = (getSendControl: SendControlGetter) =>
  createMachine<PlayerMachineContext, PlayerMachineEvent>(
    {
      id: "playerMachine",
      initial: "ready",
      context: {
        queue: emptyQueue,
        player: {
          currentTrack: null,
          isPlaying: false,
          positionMs: 0,
          tempo: null,
          volume: 100,
          shuffleEnabled: false,
          repeatMode: "off",
          colors: null,
        },
        pendingTrackId: null,
        pendingDir: null,
        pendingStartedAt: null,
      },
      states: {
        ready: {
          on: {
            SERVER_QUEUE: { actions: "applyQueue" },
            SERVER_PLAYER: { actions: "applyPlayer" },
            USER_SELECT: { target: "waitingAck", actions: "playTrack" },
            USER_NEXT: { target: "waitingAck", actions: "playNext" },
            USER_PREV: [
              {
                cond: "shouldRewind",
                target: "ready",
                actions: "rewind",
              },
              { target: "waitingAck", actions: "playPrev" },
            ],
            USER_REWIND: { target: "ready", actions: "rewind" },
          },
        },
        waitingAck: {
          after: {
            2000: { target: "ready", actions: "clearPending" },
          },
          on: {
            SERVER_QUEUE: { actions: "applyQueue" },
            SERVER_PLAYER: [
              {
                cond: "matchesPendingTrack",
                target: "ready",
                actions: ["applyPlayer", "clearPending"],
              },
              { actions: "applyPlayer" },
            ],
            CTRL_ACK: {
              target: "ready",
              actions: "clearPending",
            },
            CTRL_TIMEOUT: {
              target: "ready",
              actions: "clearPending",
            },
          },
        },
      },
    },
    {
      guards: {
        shouldRewind: (_, evt) =>
          evt.type === "USER_PREV" && evt.allowRewind && evt.positionMs > 3500,
        matchesPendingTrack: (ctx, evt) =>
          evt.type === "SERVER_PLAYER" &&
          !!ctx.pendingTrackId &&
          evt.state.currentTrack?.id === ctx.pendingTrackId,
      },
      actions: {
        applyQueue: assign((ctx, evt) => {
          if (evt.type !== "SERVER_QUEUE") return ctx;
          const incomingVersion = withVersion(evt.snapshot.version, ctx.queue.version);
          const currentVersion = withVersion(ctx.queue.version, null);
          if (incomingVersion < currentVersion) return ctx;
          return {
            ...ctx,
            queue: { ...evt.snapshot, version: incomingVersion },
          };
        }),
        applyPlayer: assign((ctx, evt) => {
          if (evt.type !== "SERVER_PLAYER") return ctx;
          const player = evt.state;
          // align queue current if provided
          const queue = ctx.queue;
          const currentTrack = player.currentTrack ?? queue.current ?? null;
          return { ...ctx, player, queue: { ...queue, current: currentTrack } };
        }),
        playTrack: assign((ctx, evt) => {
          if (evt.type !== "USER_SELECT") return ctx;
          getSendControl()({ command: "playTrack", trackId: evt.trackId });
          return {
            ...ctx,
            pendingTrackId: evt.trackId,
            pendingDir: null,
            pendingStartedAt: Date.now(),
          };
        }),
        playNext: assign((ctx) => {
          const target = neighborPick(ctx.queue, "next");
          const current = ctx.queue.current;
          console.log("[playNext] current:", current?.id, "target:", target?.id, "next.length:", ctx.queue.next.length);
          if (target) {
            if (target.id === current?.id) {
              console.warn("[playNext] target === current, skipping");
            } else {
              getSendControl()({ command: "skipTo", trackUri: target.id, trackUid: target.uid });
            }
          }
          return {
            ...ctx,
            pendingTrackId: target?.id ?? null,
            pendingDir: target ? "next" : null,
            pendingStartedAt: target ? Date.now() : null,
          };
        }),
        playPrev: assign((ctx) => {
          const target = neighborPick(ctx.queue, "prev");
          const current = ctx.queue.current;
          console.log("[playPrev] current:", current?.id, "target:", target?.id, "prev.length:", ctx.queue.prev.length);
          if (target) {
            if (target.id === current?.id) {
              console.warn("[playPrev] target === current, skipping");
            } else {
              getSendControl()({ command: "skipTo", trackUri: target.id, trackUid: target.uid });
            }
          }
          return {
            ...ctx,
            pendingTrackId: target?.id ?? null,
            pendingDir: target ? "prev" : null,
            pendingStartedAt: target ? Date.now() : null,
          };
        }),
        rewind: assign((ctx) => {
          getSendControl()({ command: "seek", positionMs: 0 });
          return { ...ctx, pendingTrackId: null, pendingDir: null, pendingStartedAt: null };
        }),
        clearPending: assign((ctx) => ({
          ...ctx,
          pendingTrackId: null,
          pendingDir: null,
          pendingStartedAt: null,
        })),
      },
    }
  );
