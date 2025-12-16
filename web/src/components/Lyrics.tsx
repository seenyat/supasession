import { useEffect, useRef, useMemo } from "react";
import { motion, useSpring } from "motion/react";
import { usePlayerStore } from "../stores/playerStore";

const LYRICS_HEIGHT = 520; // Match album art size

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

interface LyricLineProps {
  text: string;
  isActive: boolean;
  isPast: boolean;
  contrastColor: "white" | "black";
  onClick?: () => void;
}

const LyricLine = ({ text, isActive, isPast, contrastColor, onClick }: LyricLineProps) => {
  const scale = useSpring(isActive ? 1 : 0.85, { stiffness: 300, damping: 30 });
  const opacity = useSpring(isActive ? 1 : isPast ? 0.3 : 0.5, { stiffness: 200, damping: 25 });

  useEffect(() => {
    scale.set(isActive ? 1 : 0.85);
    opacity.set(isActive ? 1 : isPast ? 0.3 : 0.5);
  }, [isActive, isPast, scale, opacity]);

  const textColor = contrastColor === "white" ? "rgb(255,255,255)" : "rgb(0,0,0)";
  const glowColor = contrastColor === "white" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)";

  return (
    <motion.div
      className="py-3 cursor-pointer origin-left"
      style={{ scale, opacity }}
      onClick={onClick}
      whileHover={{ opacity: 0.8 }}
    >
      <span
        className="text-2xl md:text-3xl lg:text-4xl font-bold transition-all duration-300"
        style={{
          color: textColor,
          textShadow: isActive ? `0 0 40px ${glowColor}` : "none",
        }}
      >
        {text || "♪"}
      </span>
    </motion.div>
  );
};

interface LyricsProps {
  onSeek?: (positionMs: number) => void;
}

export const Lyrics = ({ onSeek }: LyricsProps) => {
  const lyrics = usePlayerStore((s) => s.lyrics);
  const positionMs = usePlayerStore((s) => s.playerState.positionMs);
  const dominantColor = usePlayerStore((s) => s.dominantColor);
  const artworkTop = usePlayerStore((s) => s.artworkTop);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  const syncedLines = lyrics?.synced;
  const contrastColor = getContrastColor(dominantColor);

  // Find the active line index
  const activeIndex = useMemo(() => {
    if (!syncedLines?.length) return -1;

    // Binary search for active line
    let active = 0;
    for (let i = syncedLines.length - 1; i >= 0; i--) {
      if (positionMs >= syncedLines[i].startTime) {
        active = i;
        break;
      }
    }
    return active;
  }, [syncedLines, positionMs]);

  // Auto-scroll to active line using getBoundingClientRect for accurate positioning
  useEffect(() => {
    if (!activeLineRef.current || !containerRef.current) return;

    const now = Date.now();
    if (now - lastScrollTime.current < 100) return; // Debounce
    lastScrollTime.current = now;

    const container = containerRef.current;
    const activeLine = activeLineRef.current;

    // Use rects for accurate positioning (accounts for transforms, multi-line, etc.)
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeLine.getBoundingClientRect();

    // Position of active line's top within scrollable content
    const offsetWithinContainer = activeRect.top - containerRect.top + container.scrollTop;

    // Center the active line within the container
    const targetScroll = offsetWithinContainer - (containerRect.height - activeRect.height) / 2;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [activeIndex]);

  // No lyrics - render nothing
  if (!lyrics || !syncedLines?.length) {
    return null;
  }

  const handleLineClick = (startTime: number) => {
    if (onSeek) {
      onSeek(startTime);
    }
  };

  const halfHeight = LYRICS_HEIGHT / 2;

  return (
    <div
      ref={containerRef}
      className="absolute overflow-y-auto overflow-x-hidden lyrics-scrollbar px-8"
      style={{
        top: artworkTop - 15,
        height: LYRICS_HEIGHT,
        maskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
      }}
    >
      <div style={{ height: halfHeight }} aria-hidden="true" />
      {syncedLines.map((line, index) => (
        <div
          key={`${line.startTime}-${index}`}
          ref={index === activeIndex ? activeLineRef : undefined}
        >
          <LyricLine
            text={line.text}
            isActive={index === activeIndex}
            isPast={index < activeIndex}
            contrastColor={contrastColor}
            onClick={() => handleLineClick(line.startTime)}
          />
        </div>
      ))}
      <div style={{ height: halfHeight }} aria-hidden="true" />
    </div>
  );
};
