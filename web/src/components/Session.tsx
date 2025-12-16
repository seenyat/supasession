import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePlayerStore } from "../stores/playerStore";
import { usePlayerService } from "../state/PlayerServiceProvider";
import { ListMusic } from "lucide-react";
import type { Track } from "@supasession/shared";

const ScrollingText = ({ children, className }: { children: string; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      const isOverflowing = textRef.current.scrollWidth > containerRef.current.clientWidth;
      setShouldScroll(isOverflowing);
      if (isOverflowing) {
        setScrollDistance(textRef.current.scrollWidth - containerRef.current.clientWidth + 8);
      }
    }
  }, [children]);

  return (
    <div 
      ref={containerRef}
      className={`overflow-hidden ${className}`}
    >
      <motion.span
        ref={textRef}
        className="inline-block whitespace-nowrap"
        initial={{ x: 0 }}
        whileHover={shouldScroll ? { 
          x: -scrollDistance,
          transition: { 
            duration: scrollDistance / 30,
            ease: "linear",
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 0.5
          }
        } : {}}
      >
        {children}
      </motion.span>
    </div>
  );
};

const getContrastColor = (color: string): "white" | "black" => {
  let r: number, g: number, b: number;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const fullHex = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
    r = parseInt(fullHex.slice(0, 2), 16);
    g = parseInt(fullHex.slice(2, 4), 16);
    b = parseInt(fullHex.slice(4, 6), 16);
  } else {
    const colors = color.match(/\d+/g);
    if (!colors) return "white";
    [r, g, b] = colors.map(Number).slice(0, 3);
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance >= 0.5 ? "black" : "white";
};

export const Session = () => {
  const dominantColor = usePlayerStore((s) => s.dominantColor);
  const queue = usePlayerStore((s) => s.queue);
  const service = usePlayerService();
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const contrastColor = getContrastColor(dominantColor);
  const { next, prev } = queue;

  const textColor = contrastColor === "white" ? "text-white" : "text-black";

  const handleTrackClick = (track: Track) => {
    service.send({ type: "USER_SELECT", trackId: track.id });
  };

  return (
    <div className="relative h-full">
      {/* Placeholder to maintain grid */}
      <div
        style={{ color: contrastColor }}
        className="absolute bottom-12 left-4 z-20"
      >
      <AnimatePresence>
        {isQueueOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col gap-5 mb-6 max-h-[50vh] overflow-y-auto pb-2"
            style={{ scrollbarWidth: "none" }}
          >
            {prev.slice(-2).map((track, i) => (
              <motion.div
                key={track.id + "prev" + i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="flex items-center gap-3 group cursor-pointer"
                onClick={() => handleTrackClick(track)}
              >
                {(track.albumArtData || track.albumArtUrl) && (
                  <motion.img
                    src={track.albumArtData || track.albumArtUrl || ""}
                    className="w-10 h-10 rounded object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                  />
                )}
                <div className={`${textColor} max-w-[220px] opacity-30 group-hover:opacity-100 transition-opacity duration-300`}>
                  <ScrollingText className="text-[11px] font-bold max-w-[220px]">{track.name}</ScrollingText>
                  <div className={`text-[10px] truncate opacity-70 ${textColor}`}>{track.artists?.[0]}</div>
                </div>
              </motion.div>
            ))}

            {/* Current track indicator - connects visually to album art */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 0.5, scaleX: 1 }}
              transition={{ delay: prev.slice(-2).length * 0.05, duration: 0.5 }}
              className="flex items-center gap-2 py-1"
              style={{ originX: 0 }}
            >
              <motion.div
                className={`h-[2px] w-12 rounded-full ${contrastColor === "white" ? "bg-white" : "bg-black"}`}
              />
              <span 
                className={`text-[8px] uppercase tracking-widest font-medium ${textColor}`}
              >
                now
              </span>
            </motion.div>
            
            {next.slice(0, 6).map((track, i) => (
              <motion.div
                key={track.id + "next" + i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (prev.slice(-2).length + 1 + i) * 0.05, duration: 0.4 }}
                className="flex items-center gap-3 group cursor-pointer"
                onClick={() => handleTrackClick(track)}
              >
                {(track.albumArtData || track.albumArtUrl) && (
                  <motion.img
                    src={track.albumArtData || track.albumArtUrl || ""}
                    className="w-10 h-10 rounded object-cover opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                  />
                )}
                <div className={`${textColor} max-w-[220px] opacity-40 group-hover:opacity-100 transition-opacity duration-300`}>
                  <ScrollingText className="text-[11px] font-bold max-w-[220px]">{track.name}</ScrollingText>
                  <div className={`text-[10px] truncate opacity-70 ${textColor}`}>{track.artists?.[0]}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="cursor-pointer"
        animate={{ opacity: isQueueOpen ? 0.7 : 0.2 }}
        whileHover={{ opacity: 0.9 }}
        onClick={() => setIsQueueOpen(!isQueueOpen)}
      >
        <ListMusic size={18} />
      </motion.div>
      </div>
    </div>
  );
};
