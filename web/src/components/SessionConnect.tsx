import { useState } from "react";
import { motion } from "motion/react";

interface Props {
  onConnect: (sessionId: string) => void;
}

export const SessionConnect = ({ onConnect }: Props) => {
  const [sessionId, setSessionId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionId.trim()) {
      onConnect(sessionId.trim());
    }
  };

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-black/90 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white/5 backdrop-blur-xl rounded-3xl p-10 max-w-md w-full mx-4 border border-white/10"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">SupaSession</h1>
        <p className="text-white/50 mb-8">
          Connect to a Spotify session to see what's playing
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="Enter session ID"
            className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors font-mono text-sm"
            autoFocus
          />
          <motion.button
            type="submit"
            disabled={!sessionId.trim()}
            className="w-full py-4 bg-white text-black font-semibold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Connect
          </motion.button>
        </form>

        <p className="text-xs text-white/20 mt-6 text-center">
          The session ID is displayed in the Spotify extension
        </p>
      </motion.div>
    </motion.div>
  );
};
