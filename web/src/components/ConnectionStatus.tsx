import { motion } from "motion/react";
import { usePlayerStore } from "../stores/playerStore";

export const ConnectionStatus = () => {
  const status = usePlayerStore((s) => s.connectionStatus);
  const sessionId = usePlayerStore((s) => s.sessionId);

  const statusConfig = {
    disconnected: { color: "bg-red-500", text: "Disconnected" },
    connecting: { color: "bg-yellow-500", text: "Connecting..." },
    connected: { color: "bg-green-500", text: "Connected" },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-3">
      <motion.div
        className={`w-2 h-2 rounded-full ${config.color}`}
        animate={{
          scale: status === "connecting" ? [1, 1.2, 1] : 1,
        }}
        transition={{
          duration: 0.8,
          repeat: status === "connecting" ? Infinity : 0,
        }}
      />
      <span className="text-xs text-white/40">{config.text}</span>
      {sessionId && status === "connected" && (
        <span className="text-xs text-white/20 font-mono">
          {sessionId.slice(0, 8)}...
        </span>
      )}
    </div>
  );
};
