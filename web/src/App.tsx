import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BlurredBackground } from "./components/BlurredBackground";
import { Player } from "./components/Player";
import { Session } from "./components/Session";
import { Lyrics } from "./components/Lyrics";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { SessionConnect } from "./components/SessionConnect";
import { useWebSocket } from "./hooks/useWebSocket";
import { usePlayerStore } from "./stores/playerStore";
import { ShaderOverlay } from "./components/ShaderOverlay";
import { PlayerServiceProvider, usePlayerService, useSetSendControl } from "./state/PlayerServiceProvider";
import { DebugPanel } from "./components/DebugPanel";

function AppShell() {
  const [inputSessionId, setInputSessionId] = useState<string | null>(null);
  const [autoJoin, setAutoJoin] = useState(false);
  const [showFallbackDialog, setShowFallbackDialog] = useState(false);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const storeSessionId = usePlayerStore((s) => s.sessionId);
  const dominantColor = usePlayerStore((s) => s.dominantColor);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("session");
    if (urlSessionId) {
      setInputSessionId(urlSessionId);
    } else {
      setAutoJoin(true);
    }
  }, []);

  useEffect(() => {
    if (storeSessionId && !inputSessionId) {
      window.history.replaceState({}, "", `?session=${storeSessionId}`);
    }
  }, [storeSessionId, inputSessionId]);

  useEffect(() => {
    if (storeSessionId) {
      setShowFallbackDialog(false);
    }
  }, [storeSessionId]);

  const service = usePlayerService();
  const setSendControl = useSetSendControl();

  const { sendControl } = useWebSocket({
    sessionId: inputSessionId,
    autoJoin,
    onQueue: (snapshot) => service.send({ type: "SERVER_QUEUE", snapshot }),
    onPlayer: (state) => service.send({ type: "SERVER_PLAYER", state }),
    onSessionsDiscovered: (sessions) => {
      setAvailableSessions(sessions);
      setShowFallbackDialog(true);
    },
  });

  useEffect(() => {
    setSendControl(sendControl);
  }, [sendControl, setSendControl]);

  const handleConnect = (sessionId: string) => {
    setInputSessionId(sessionId);
    setAutoJoin(false);
    setShowFallbackDialog(false);
    window.history.replaceState({}, "", `?session=${sessionId}`);
  };

  const handleSkipNext = () => service.send({ type: "USER_NEXT" });
  const handleSkipPrev = () =>
    service.send({
      type: "USER_PREV",
      allowRewind: false,
      positionMs: usePlayerStore.getState().playerState.positionMs,
    });
  const handleSeek = (positionMs: number) => sendControl({ command: "seek", positionMs });
  const handleTogglePlay = () => sendControl({ command: "togglePlayPause" });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        sendControl({ command: "togglePlayPause" });
      }
      // Press 'D' to trigger debug output in Spotify console
      if (e.code === "KeyD" && e.shiftKey) {
        e.preventDefault();
        sendControl({ command: "debug" });
        console.log("Debug command sent - check Spotify DevTools console");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendControl]);

  const showConnectDialog = !inputSessionId && !storeSessionId && showFallbackDialog;

  const colorWithAlpha = dominantColor 
    ? `${dominantColor}80` // 50% opacity (hex alpha)
    : "transparent";

  return (
    <>
      <BlurredBackground />
      
      {/* Shader overlay (cosine + fbm) above blur, below UI */}
      <ShaderOverlay className="fixed inset-0 z-[2] mix-blend-screen opacity-90 pointer-events-none" />

      {/* Color overlay that blends with canvas */}
      <motion.div
        className="fixed inset-0 z-[1] pointer-events-none"
        animate={{ backgroundColor: colorWithAlpha }}
        transition={{ duration: 0.8 }}
      />

      <AnimatePresence>
        {showConnectDialog && <SessionConnect onConnect={handleConnect} availableSessions={availableSessions} />}
      </AnimatePresence>

      {/* Main container matching original aspect-video layout */}
      <div 
        className="relative z-10 w-full h-full p-4 overflow-hidden"
      >
        {/* Status indicator - minimal, top right */}
        <div className="absolute top-4 right-4 z-50">
          <ConnectionStatus />
        </div>

        {/* Main grid: Session | Player | Lyrics */}
        <div className="grid pt-24 xl:pt-0 pb-64 xl:pb-8 justify-items-center xl:justify-items-start h-full w-full grid-cols-1 xl:grid-cols-[2fr_5fr_3fr] gap-2">
          <Session />
          <Player onSkipNext={handleSkipNext} onSkipPrev={handleSkipPrev} onSeek={handleSeek} onTogglePlay={handleTogglePlay} />
          {/* Lyrics column */}
          <div className="hidden xl:flex items-center relative h-full w-full overflow-hidden">
            <Lyrics onSeek={handleSeek} />
          </div>
        </div>
      </div>

      <DebugPanel />
    </>
  );
}

export default function App() {
  return (
    <PlayerServiceProvider>
      <AppShell />
    </PlayerServiceProvider>
  );
}
