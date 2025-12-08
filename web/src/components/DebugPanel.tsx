import { useEffect, useState } from "react";
import { usePlayerActor } from "../state/PlayerServiceProvider";
import { usePlayerStore } from "../stores/playerStore";

export const DebugPanel = () => {
  const [open, setOpen] = useState(false);
  const [state] = usePlayerActor();
  const storePlayer = usePlayerStore((s) => s.playerState);
  const storeQueue = usePlayerStore((s) => s.queue);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === "d") {
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed bottom-2 right-2 z-[9999] w-[360px] max-h-[70vh] overflow-y-auto rounded-lg bg-black/80 text-xs text-white p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-semibold">Debug</span>
        <button
          className="text-white/60 hover:text-white text-xs"
          onClick={() => setOpen(false)}
        >
          close
        </button>
      </div>
      <div className="space-y-1">
        <div className="font-semibold">Machine</div>
        <div>state: {state.value as string}</div>
        <div>pending: {state.context.pendingTrackId ?? "none"} ({state.context.pendingDir ?? "–"})</div>
        <div>queue v{state.context.queue.version ?? 0}</div>
        <div>prev[0]: {state.context.queue.prev[0]?.id ?? "none"}</div>
        <div>current: {state.context.queue.current?.id ?? "none"}</div>
        <div>next[0]: {state.context.queue.next[0]?.id ?? "none"}</div>
      </div>
      <div className="space-y-1">
        <div className="font-semibold">Store (raw)</div>
        <div>current: {storePlayer.currentTrack?.id ?? "none"}</div>
        <div>prev[0]: {storeQueue.prev[0]?.id ?? "none"}</div>
        <div>next[0]: {storeQueue.next[0]?.id ?? "none"}</div>
        <div>pos: {storePlayer.positionMs}ms playing:{storePlayer.isPlaying ? "yes" : "no"}</div>
      </div>
    </div>
  );
};
