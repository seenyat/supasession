import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
} from "motion/react";
import { usePlayerStore } from "../stores/playerStore";
import { useDominantColor } from "../hooks/useDominantColor";
import { useArtworkPreload } from "../hooks/useArtworkPreload";
import { usePlayerActor, usePlayerService } from "../state/PlayerServiceProvider";


const REWIND_THRESHOLD = 50;
const SKIP_THRESHOLD = 120;
const TRACK_OFFSET = 570;
const ALBUM_SIZE = "520px";

const parseRGB = (color: string): [number, number, number] => {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const match = color.match(/\d+/g);
  if (!match) return [120, 120, 120];
  const [r, g, b] = match.map(Number).slice(0, 3);
  return [r, g, b];
};

const makeRGBA = (rgb: [number, number, number], alpha: number) =>
  `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

const createBounceAnimate = (glowSoft: string, glowMid: string) => ({
  rotateX: [0, 0.6, 0, -0.6],
  rotateY: [0, 0.8, 0, -0.8],
  rotateZ: [0, 0.3, 0, -0.3],
  scale: [1, 1.006, 1.003, 1.006],
  y: [0, -1.5, 0, -1],
  boxShadow: [
    `0 20px 40px rgba(0,0,0,0.25),
     0 35px 70px rgba(0,0,0,0.15),
     0 0 0 1px rgba(255,255,255,0.06),
     0 0 50px 0 ${glowSoft},
     0 0 90px 0 ${glowMid}`,
    `0 20px 40px rgba(0,0,0,0.25),
     -3px 34px 70px rgba(0,0,0,0.15),
     0 0 0 1px rgba(255,255,255,0.06),
     -2px 0 52px 0 ${glowSoft},
     -4px 0 95px 0 ${glowMid}`,
    `0 21px 42px rgba(0,0,0,0.25),
     0 36px 72px rgba(0,0,0,0.16),
     0 0 0 1px rgba(255,255,255,0.06),
     0 0 55px 0 ${glowSoft},
     0 0 100px 0 ${glowMid}`,
    `0 20px 40px rgba(0,0,0,0.25),
     3px 34px 70px rgba(0,0,0,0.15),
     0 0 0 1px rgba(255,255,255,0.06),
     2px 0 52px 0 ${glowSoft},
     4px 0 95px 0 ${glowMid}`,
  ],
});

const getContrastColor = (color: string): "white" | "black" => {
  let r: number, g: number, b: number;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const fullHex =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
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

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface Props {
  onSkipNext?: () => void;
  onSkipPrev?: () => void;
  onSeek?: (positionMs: number) => void;
  onTogglePlay?: () => void;
}

export const Player = ({ onSkipNext, onSkipPrev, onSeek, onTogglePlay }: Props) => {
  const [machineState] = usePlayerActor();
  const playerService = usePlayerService();
  const queue = machineState.context.queue;
  const playerState = machineState.context.player;
  const dominantColor = usePlayerStore((s) => s.dominantColor);
  const setArtworkTop = usePlayerStore((s) => s.setArtworkTop);

  const { currentTrack, isPlaying, tempo, positionMs } = playerState;

  // Simple: derive display tracks directly from queue
  // prev is chronological (oldest first), so last item is immediate previous
  const displayCurrent = currentTrack ?? queue.current ?? null;
  const displayPrev = queue.prev[queue.prev.length - 1] ?? null;
  const displayNext = queue.next[0] ?? null;

  const currentImageSrc = displayCurrent?.albumArtData || displayCurrent?.albumArtUrl;
  const prevImageSrc = displayPrev?.albumArtData || displayPrev?.albumArtUrl;
  const nextImageSrc = displayNext?.albumArtData || displayNext?.albumArtUrl;

  // Preload incoming artwork
  useArtworkPreload(displayNext?.albumArtData || displayNext?.albumArtUrl);
  useArtworkPreload(displayPrev?.albumArtData || displayPrev?.albumArtUrl);

  useDominantColor();

  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const lastDirectionRef = useRef<"next" | "prev" | null>(null);

  // Track artwork container position for lyrics alignment
  useEffect(() => {
    if (!imgContainerRef.current) return;
    const updatePosition = () => {
      if (imgContainerRef.current) {
        setArtworkTop(imgContainerRef.current.getBoundingClientRect().top);
      }
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(imgContainerRef.current);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [setArtworkTop, displayCurrent]);

  // Glow colors derived from dominant color
  const rgb = useMemo(() => parseRGB(dominantColor), [dominantColor]);
  const rgbRef = useRef(rgb);
  rgbRef.current = rgb;

  const glowSoft = useMemo(() => makeRGBA(rgb, 0.4), [rgb]);
  const glowMid = useMemo(() => makeRGBA(rgb, 0.7), [rgb]);
  const bounceAnimate = useMemo(() => createBounceAnimate(glowSoft, glowMid), [glowSoft, glowMid]);

  // === Single source of truth: dragX ===
  const dragX = useMotionValue(0);
  const dragXSpring = useSpring(dragX, { stiffness: 650, damping: 40, mass: 0.35 });

  // Progress 0→1 as approaching threshold
  // Progress for skip (strong drag)
  const dragProgress = useTransform(dragXSpring, (x) => Math.min(1, Math.abs(x) / SKIP_THRESHOLD));
  // Progress for rewind (slight drag right)
  const rewindProgress = useTransform(dragXSpring, (x) => x > 0 ? Math.min(1, x / REWIND_THRESHOLD) : 0);

  // Direction: -1 (next), 0 (idle), 1 (prev)
  const dragDirection = useTransform(dragXSpring, (x): number => (x === 0 ? 0 : x > 0 ? 1 : -1));

  // Commit state: springs to 1 when threshold crossed
  const commitRaw = useTransform(dragProgress, (p): number => (p >= 1 ? 1 : 0));
  const commit = useSpring(commitRaw, { stiffness: 700, damping: 35 });

  // Pause state
  const pausedMultiplier = useMotionValue(isPlaying ? 0 : 1);
  const pausedMultiplierSpring = useSpring(pausedMultiplier, { damping: 25, stiffness: 700 });

  useEffect(() => {
    pausedMultiplier.set(isPlaying ? 0 : 1);
  }, [isPlaying, pausedMultiplier]);

  const saturate = useTransform(pausedMultiplierSpring, (v) => 1 - v);

  // Drag-based effects for album art
  const hueRotateRaw = useTransform(dragXSpring, [-SKIP_THRESHOLD, 0, SKIP_THRESHOLD], [-25, 0, 25]);
  const hueRotate = useTransform(hueRotateRaw, (h) => (isDraggingRef.current ? h : 0));

  const coverBlurRaw = useTransform(dragProgress, [0, 1], [0, 6]);
  const coverBlur = useTransform(coverBlurRaw, (b) => (isDraggingRef.current ? b : 0));

  const coverFilter = useTransform([saturate, hueRotate, coverBlur], (latest) => {
    const [s, h, b] = latest as [number, number, number];
    const [r, g, blu] = rgbRef.current;
    const glowRadius = 12 + b * 2;
    return `saturate(${s}) hue-rotate(${h}deg) blur(${b}px) drop-shadow(0 0 ${glowRadius}px rgba(${r},${g},${blu},0.45))`;
  });

  // Current track scale/opacity/shadow
  const baseScale = useTransform(dragProgress, [0, 1], [1, 1.03]);
  const commitScaleBoost = useTransform(commit, [0, 1], [0, 0.05]);
  const currentScale = useTransform([baseScale, commitScaleBoost], (latest) => {
    const [b, c] = latest as [number, number];
    return b + c;
  });

  const currentOpacity = useTransform(dragProgress, [0, 1], [1, 0.85]);
  const currentShadow = useTransform(commit, (c) => `0 18px 50px rgba(0,0,0,${0.22 + 0.25 * c})`);

  // Commit overlay (bright flash when threshold crossed)
  const commitOverlayOpacity = useTransform(commit, [0, 1], [0, 0.25]);

  // Preview positions
  // Drag RIGHT (x > 0) → show PREV on LEFT sliding in from left
  const prevPreviewX = useTransform(dragXSpring, [0, SKIP_THRESHOLD], [-TRACK_OFFSET, 0]);

  // Drag LEFT (x < 0) → show NEXT on RIGHT sliding in from right
  const nextPreviewX = useTransform(dragXSpring, [-SKIP_THRESHOLD, 0], [0, TRACK_OFFSET]);

  const prevPreviewOpacity = useTransform([dragProgress, dragDirection], (latest) => {
    const [p, dir] = latest as [number, number];
    return dir > 0 ? Math.min(1, p * 1.5) : 0;
  });

  const nextPreviewOpacity = useTransform([dragProgress, dragDirection], (latest) => {
    const [p, dir] = latest as [number, number];
    return dir < 0 ? Math.min(1, p * 1.5) : 0;
  });

  const prevPreviewScale = useTransform([commit, dragDirection], (latest) => {
    const [c, dir] = latest as [number, number];
    return dir > 0 ? 1 + c * 0.05 : 1;
  });

  const nextPreviewScale = useTransform([commit, dragDirection], (latest) => {
    const [c, dir] = latest as [number, number];
    return dir < 0 ? 1 + c * 0.05 : 1;
  });

  // Label slide positions
  const currentLabelY = useTransform(dragProgress, [0, 0.3, 1], [0, 80, 150]);
  const currentLabelOpacity = useTransform(dragProgress, [0, 0.2, 0.5], [1, 0.3, 0]);

  const prevLabelX = useTransform(dragXSpring, [0, SKIP_THRESHOLD], [-300, 0]);
  const nextLabelX = useTransform(dragXSpring, [-SKIP_THRESHOLD, 0], [0, 300]);

  // Indicator opacity - show when respective threshold reached
  // Rewind: slight drag right (passes REWIND_THRESHOLD but not SKIP_THRESHOLD)
  const rewindIndicatorOpacity = useTransform([rewindProgress, dragProgress, dragDirection], ([rp, sp, dir]) => 
    (dir as number) > 0 && (rp as number) >= 1 && (sp as number) < 1 ? 1 : 0
  );
  // Prev: strong drag right (passes SKIP_THRESHOLD)
  const prevIndicatorOpacity = useTransform([dragProgress, dragDirection], ([p, dir]) => 
    (dir as number) > 0 && (p as number) >= 1 ? 1 : 0
  );
  // Next: strong drag left (passes SKIP_THRESHOLD)
  const nextIndicatorOpacity = useTransform([dragProgress, dragDirection], ([p, dir]) => 
    (dir as number) < 0 && (p as number) >= 1 ? 1 : 0
  );

  const bounceTransition = useMemo(
    () => ({
      duration: tempo ? Math.max(0.5, 480 / tempo) : 0.8,
      ease: "easeInOut" as const,
      repeat: Infinity,
      repeatType: "mirror" as const,
    }),
    [tempo]
  );

  const contrastColor = getContrastColor(dominantColor);

  // Smooth progress interpolation
  const progressPercent = displayCurrent?.durationMs ? (positionMs / displayCurrent.durationMs) * 100 : 0;
  const progressTarget = useMotionValue(progressPercent);
  const smoothProgress = useSpring(progressTarget, { stiffness: 100, damping: 30 });
  const smoothProgressWidth = useTransform(smoothProgress, (v) => `${v}%`);

  useEffect(() => {
    progressTarget.set(progressPercent);
  }, [progressPercent, progressTarget]);

  const wasDraggingRef = useRef(false);

  const handleDragStart = () => {
    setIsDragging(true);
    isDraggingRef.current = true;
    wasDraggingRef.current = true;
  };

  const handleDragEnd = () => {
    const x = dragX.get();

    if (x < -SKIP_THRESHOLD && displayNext) {
      // Strong drag LEFT → next track
      lastDirectionRef.current = "next";
      playerService.send({ type: "USER_NEXT" });
      onSkipNext?.();
    } else if (x > SKIP_THRESHOLD && displayPrev) {
      // Strong drag RIGHT → previous track
      lastDirectionRef.current = "prev";
      playerService.send({ type: "USER_PREV", allowRewind: false, positionMs });
      onSkipPrev?.();
    } else if (x > REWIND_THRESHOLD) {
      // Slight drag RIGHT → rewind current track
      onSeek?.(0);
    }

    // Animate card back to center
    animate(dragX, 0, { type: "spring", stiffness: 400, damping: 40 });

    setIsDragging(false);
    isDraggingRef.current = false;
    
    // Reset drag flag after a short delay to allow click detection
    setTimeout(() => {
      wasDraggingRef.current = false;
    }, 50);
  };

  const handleAlbumClick = (e: React.MouseEvent) => {
    // Ignore if we just finished dragging
    if (wasDraggingRef.current) return;
    
    // Ignore clicks in the seek zone (top 20px)
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientY - rect.top < 20) return;
    
    onTogglePlay?.();
  };

  if (!displayCurrent) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-white/30 text-xl">Waiting for music...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="grid h-full pb-12 xl:grid-cols-[4fr_3fr]">
        <div className="relative flex h-full w-full flex-col justify-end gap-4 px-4">
          {/* Album Art with Drag */}
          <div className="relative" ref={imgContainerRef} style={{ width: ALBUM_SIZE }}>
            {/* Action indicators - fixed position, horizontally centered, upper area */}
            <div className="fixed top-[30px] left-1/2 -translate-x-1/2 pointer-events-none z-50 w-12 h-12">
              {/* Rewind indicator (slight drag right) */}
              <motion.div className="absolute inset-0" style={{ opacity: rewindIndicatorOpacity }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill={contrastColor}>
                  <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                </svg>
              </motion.div>
              
              {/* Previous indicator (strong drag right) */}
              <motion.div className="absolute inset-0" style={{ opacity: prevIndicatorOpacity }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill={contrastColor}>
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </motion.div>
              
              {/* Next indicator (strong drag left) */}
              <motion.div className="absolute inset-0" style={{ opacity: nextIndicatorOpacity }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill={contrastColor}>
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </motion.div>
            </div>
            
            {/* Draggable Current Track */}
            <motion.div
              drag="x"
              dragConstraints={{ left: -300, right: 300 }}
              dragElastic={0.1}
              dragMomentum={false}
              className="cursor-pointer relative album-floating-shadow z-30"
              style={{
                x: dragX,
                // @ts-expect-error CSS custom property
                "--album-glow": glowMid,
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onClick={handleAlbumClick}
            >
              <motion.div
                style={{
                  scale: currentScale,
                  opacity: currentOpacity,
                  boxShadow: currentShadow,
                  filter: coverFilter,
                }}
              >
                {/* Wrapper for bounce animation - includes progress bar */}
                <motion.div
                  className="relative"
                  animate={
                    !isDragging
                      ? bounceAnimate
                      : {
                          rotateX: 0,
                          rotateY: 0,
                          rotateZ: 0,
                          scale: 1,
                          y: 0,
                          boxShadow: bounceAnimate.boxShadow[0],
                        }
                  }
                  transition={bounceTransition}
                  style={{
                    transformOrigin: "center center",
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                  }}
                >
                  {/* Progress bar visual - full height, non-interactive */}
                  <div
                    className="absolute top-0 left-0 z-20 pointer-events-none opacity-40"
                    style={{ width: ALBUM_SIZE, height: ALBUM_SIZE }}
                  >
                    <motion.div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: smoothProgressWidth,
                        background: `linear-gradient(90deg, ${dominantColor}, ${dominantColor})`,
                        mixBlendMode: "color",
                        opacity: 0.6,
                      }}
                    />
                    {/* Time indicator */}
                    <motion.div className="absolute top-0" style={{ left: smoothProgressWidth }}>
                      <span
                        className="absolute left-1/2 -translate-x-1/2 -top-5 text-[10px] font-medium tabular-nums"
                        style={{
                          color: contrastColor,
                          textShadow: "0 0 6px rgba(0,0,0,0.45), 0 0 2px rgba(0,0,0,0.35)",
                        }}
                      >
                        {formatTime(positionMs)}
                      </span>
                    </motion.div>
                  </div>

                  {/* Seek zone - top 20px only */}
                  <div
                    className="absolute top-0 left-0 z-30 cursor-pointer hover:bg-white/10 transition-colors"
                    style={{ width: ALBUM_SIZE, height: "20px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!displayCurrent || !onSeek) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percent = x / rect.width;
                      onSeek(Math.floor(percent * displayCurrent.durationMs));
                    }}
                  />

                  {/* Commit overlay */}
                  <motion.div
                    className="absolute inset-0 rounded-sm bg-white mix-blend-screen pointer-events-none z-20"
                    style={{ opacity: commitOverlayOpacity }}
                  />

                  {/* Pause overlay */}
                  <motion.div
                    className="absolute inset-0 rounded-sm flex items-center justify-center pointer-events-none z-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isPlaying ? 0 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex gap-3">
                      <div className="w-4 h-12 bg-white/80 rounded-sm" />
                      <div className="w-4 h-12 bg-white/80 rounded-sm" />
                    </div>
                  </motion.div>

                  <img
                    ref={imgRef}
                    style={{ width: ALBUM_SIZE }}
                    draggable={false}
                    className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30"
                    src={currentImageSrc || ""}
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Previous Track Preview (appears when dragging RIGHT) */}
            {prevImageSrc && (
              <motion.div
                className="absolute top-0 pointer-events-none z-10"
                style={{
                  width: ALBUM_SIZE,
                  height: ALBUM_SIZE,
                  x: prevPreviewX,
                  opacity: prevPreviewOpacity,
                  scale: prevPreviewScale,
                  transformOrigin: "center right",
                }}
              >
                <img
                  src={prevImageSrc}
                  draggable={false}
                  className="w-full h-full overflow-hidden border border-gray-500 rounded-sm border-opacity-30 object-cover"
                  style={{ boxShadow: "1px 2px 12px rgba(0,0,0,0.4)" }}
                />
              </motion.div>
            )}

            {/* Next Track Preview (appears when dragging LEFT) */}
            {nextImageSrc && (
              <motion.div
                className="absolute top-0 pointer-events-none z-10"
                style={{
                  width: ALBUM_SIZE,
                  height: ALBUM_SIZE,
                  x: nextPreviewX,
                  opacity: nextPreviewOpacity,
                  scale: nextPreviewScale,
                  transformOrigin: "center left",
                }}
              >
                <img
                  src={nextImageSrc}
                  draggable={false}
                  className="w-full h-full overflow-hidden border border-gray-500 rounded-sm border-opacity-30 object-cover"
                  style={{ boxShadow: "1px 2px 12px rgba(0,0,0,0.4)" }}
                />
              </motion.div>
            )}
          </div>

          {/* Track Info - with sliding labels */}
          <div
            className="relative max-w-[520px] xl:max-w-none"
            style={{
              color: contrastColor === "white" ? "rgb(255,255,255)" : "rgb(0,0,0)",
            }}
          >
            {/* Previous Track Label - slides in from left */}
            {displayPrev && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  x: prevLabelX,
                  opacity: prevPreviewOpacity,
                }}
              >
                <div className="flex flex-col justify-end gap-0.5">
                  <div className="flex items-end font-light text-current/70">{displayPrev.album}</div>
                  <div className="text-3xl font-bold xl:text-5xl">{displayPrev.name}</div>
                  <div className="flex items-end mt-2 font-light text-current/70">
                    {displayPrev.artists?.join(", ")}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Next Track Label - slides in from right */}
            {displayNext && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  x: nextLabelX,
                  opacity: nextPreviewOpacity,
                }}
              >
                <div className="flex flex-col justify-end gap-0.5">
                  <div className="flex items-end font-light text-current/70">{displayNext.album}</div>
                  <div className="text-3xl font-bold xl:text-5xl">{displayNext.name}</div>
                  <div className="flex items-end mt-2 font-light text-current/70">
                    {displayNext.artists?.join(", ")}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Current Track Label */}
            <AnimatePresence mode="wait" initial={false}>
              {displayCurrent && (
                <motion.div
                  key={displayCurrent.id}
                  initial={{
                    opacity: 0,
                    x: lastDirectionRef.current === "next" ? 22 : lastDirectionRef.current === "prev" ? -22 : 0,
                  }}
                  animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 520, damping: 38 } }}
                  exit={{
                    opacity: 0,
                    x: lastDirectionRef.current === "next" ? -18 : lastDirectionRef.current === "prev" ? 18 : 0,
                    transition: { duration: 0.18 },
                  }}
                  style={{
                    perspective: "800px",
                    opacity: currentLabelOpacity,
                    y: currentLabelY,
                  }}
                  className="flex flex-col justify-end gap-0.5"
                >
                  <div className="flex items-end font-light">{displayCurrent.album}</div>
                  <div className="text-3xl font-bold xl:text-5xl">{displayCurrent.name}</div>
                  <div className="flex items-end mt-2 font-light">{displayCurrent.artists.join(", ")}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Lyrics placeholder */}
        <div
          style={{ scrollbarWidth: "none" }}
          className="relative hide-scrollbar flex-col mx-4 my-[calc(14px+.5rem)] overflow-x-hidden overflow-y-auto justify-start"
        />
      </div>
    </div>
  );
};
