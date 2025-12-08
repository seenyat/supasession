import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionValueEvent,
  animate,
} from "motion/react";
import { usePlayerStore } from "../stores/playerStore";
import { useDominantColor } from "../hooks/useDominantColor";
import type { Track } from "@supasession/shared";

const DRAG_THRESHOLD = 120;
const TRACK_OFFSET = 570;
const ALBUM_SIZE = "520px";

const parseRGB = (color: string): [number, number, number] => {
  // Handle hex format (#fff or #ffffff)
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  // Handle rgb(r, g, b) format
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
}

export const Player = ({ onSkipNext, onSkipPrev, onSeek }: Props) => {
  const playerState = usePlayerStore((s) => s.playerState);
  const queue = usePlayerStore((s) => s.queue);
  const dominantColor = usePlayerStore((s) => s.dominantColor);
  const setArtworkTop = usePlayerStore((s) => s.setArtworkTop);

  const { currentTrack, isPlaying, tempo, positionMs } = playerState;
  const { next, prev } = queue;

  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [isDragAnimating, setIsDragAnimating] = useState(false);
  const didCommitRef = useRef(false);
  const commitDirectionRef = useRef<"next" | "prev" | null>(null);

  type DragSnapshot = {
    prev0: Track | null;
    next0: Track | null;
  };
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot | null>(null);

  const currentImageSrc = currentTrack?.albumArtData || currentTrack?.albumArtUrl;
  
  const previewPrevTrack = isDragAnimating && dragSnapshot?.prev0
    ? dragSnapshot.prev0
    : prev[0] ?? null;
  
  const previewNextTrack = isDragAnimating && dragSnapshot?.next0
    ? dragSnapshot.next0
    : next[0] ?? null;

  const prevImageSrc = previewPrevTrack?.albumArtData || previewPrevTrack?.albumArtUrl;
  const nextImageSrc = previewNextTrack?.albumArtData || previewNextTrack?.albumArtUrl;

  useDominantColor();

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
  }, [setArtworkTop, currentTrack]);

  // === Glow colors derived from dominant color ===
  const rgb = useMemo(() => parseRGB(dominantColor), [dominantColor]);
  const rgbRef = useRef(rgb);
  rgbRef.current = rgb;
  
  const glowSoft = useMemo(() => makeRGBA(rgb, 0.4), [rgb]);
  const glowMid = useMemo(() => makeRGBA(rgb, 0.7), [rgb]);
  const bounceAnimate = useMemo(
    () => createBounceAnimate(glowSoft, glowMid),
    [glowSoft, glowMid]
  );

  // === Single source of truth: dragX ===
  const dragX = useMotionValue(0);
  const dragXSpring = useSpring(dragX, { stiffness: 650, damping: 40, mass: 0.35 });

  // Progress 0→1 as approaching threshold
  const dragProgress = useTransform(dragXSpring, (x) =>
    Math.min(1, Math.abs(x) / DRAG_THRESHOLD)
  );

  // Direction: -1 (next), 0 (idle), 1 (prev)
  const dragDirection = useTransform(dragXSpring, (x): number =>
    x === 0 ? 0 : x > 0 ? 1 : -1
  );

  // Commit state: springs to 1 when threshold crossed
  const commitRaw = useTransform(dragProgress, (p): number => (p >= 1 ? 1 : 0));
  const commit = useSpring(commitRaw, { stiffness: 700, damping: 35 });

  // === Pause state ===
  const pausedMultiplier = useMotionValue(isPlaying ? 0 : 1);
  const pausedMultiplierSpring = useSpring(pausedMultiplier, { damping: 25, stiffness: 700 });

  useEffect(() => {
    pausedMultiplier.set(isPlaying ? 0 : 1);
  }, [isPlaying, pausedMultiplier]);

  const saturate = useTransform(pausedMultiplierSpring, (v) => 1 - v);

  // === Drag-based effects for album art ===
  const hueRotateRaw = useTransform(
    dragXSpring,
    [-DRAG_THRESHOLD, 0, DRAG_THRESHOLD],
    [-25, 0, 25]
  );
  const hueRotate = useTransform(hueRotateRaw, (h) => 
    isDraggingRef.current ? h : 0
  );

  const coverBlurRaw = useTransform(dragProgress, [0, 1], [0, 6]);
  const coverBlur = useTransform(coverBlurRaw, (b) =>
    isDraggingRef.current ? b : 0
  );

  const coverFilter = useTransform(
    [saturate, hueRotate, coverBlur],
    (latest) => {
      const [s, h, b] = latest as [number, number, number];
      const [r, g, blu] = rgbRef.current;
      const glowRadius = 12 + b * 2;
      return `saturate(${s}) hue-rotate(${h}deg) blur(${b}px) drop-shadow(0 0 ${glowRadius}px rgba(${r},${g},${blu},0.45))`;
    }
  );

  // === Current track scale/opacity/shadow ===
  const baseScale = useTransform(dragProgress, [0, 1], [1, 1.03]);
  const commitScaleBoost = useTransform(commit, [0, 1], [0, 0.05]);
  const currentScale = useTransform(
    [baseScale, commitScaleBoost],
    (latest) => {
      const [b, c] = latest as [number, number];
      return b + c;
    }
  );

  const currentOpacity = useTransform(dragProgress, [0, 1], [1, 0.85]);
  const currentShadow = useTransform(
    commit,
    (c) => `0 18px 50px rgba(0,0,0,${0.22 + 0.25 * c})`
  );

  // Commit overlay (bright flash when threshold crossed)
  const commitOverlayOpacity = useTransform(commit, [0, 1], [0, 0.25]);



  // === Preview positions (snap to x=0 at threshold to align with current) ===
  const prevPreviewX = useTransform(
    dragXSpring,
    [0, DRAG_THRESHOLD],
    [-TRACK_OFFSET, 0]
  );

  const nextPreviewX = useTransform(
    dragXSpring,
    [-DRAG_THRESHOLD, 0],
    [0, TRACK_OFFSET]
  );

  const prevPreviewOpacity = useTransform(
    [dragProgress, dragDirection],
    (latest) => {
      const [p, dir] = latest as [number, number];
      return dir > 0 ? Math.min(1, p * 1.5) : 0;
    }
  );

  const nextPreviewOpacity = useTransform(
    [dragProgress, dragDirection],
    (latest) => {
      const [p, dir] = latest as [number, number];
      return dir < 0 ? Math.min(1, p * 1.5) : 0;
    }
  );

  // Preview scale pop on commit
  const prevPreviewScale = useTransform(
    [commit, dragDirection],
    (latest) => {
      const [c, dir] = latest as [number, number];
      return dir > 0 ? 1 + c * 0.05 : 1;
    }
  );
  const nextPreviewScale = useTransform(
    [commit, dragDirection],
    (latest) => {
      const [c, dir] = latest as [number, number];
      return dir < 0 ? 1 + c * 0.05 : 1;
    }
  );

  // === Label slide positions (slide into main label area from left/right) ===
  // Current label slides down rapidly and fades when dragging
  const currentLabelY = useTransform(dragProgress, [0, 0.3, 1], [0, 80, 150]);
  const currentLabelOpacity = useTransform(dragProgress, [0, 0.2, 0.5], [1, 0.3, 0]);
  
  // Prev/next labels slide to position 0 (aligned with current)
  const prevLabelX = useTransform(
    dragXSpring,
    [0, DRAG_THRESHOLD],
    [-300, 0]
  );
  
  const nextLabelX = useTransform(
    dragXSpring,
    [-DRAG_THRESHOLD, 0],
    [0, 300]
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
  const progressPercent = currentTrack?.durationMs 
    ? (positionMs / currentTrack.durationMs) * 100 
    : 0;
  const progressTarget = useMotionValue(progressPercent);
  const smoothProgress = useSpring(progressTarget, { stiffness: 100, damping: 30 });
  const smoothProgressWidth = useTransform(smoothProgress, (v) => `${v}%`);

  useEffect(() => {
    progressTarget.set(progressPercent);
  }, [progressPercent, progressTarget]);

  const handleDragStart = () => {
    setIsDragging(true);
    isDraggingRef.current = true;
    setIsDragAnimating(true);
    didCommitRef.current = false;
    commitDirectionRef.current = null;
    setDragSnapshot({
      prev0: prev[0] ?? null,
      next0: next[0] ?? null,
    });
  };

  useMotionValueEvent(dragXSpring, "change", (value) => {
    if (!isDragging && isDragAnimating && !didCommitRef.current && Math.abs(value) < 1) {
      setIsDragAnimating(false);
      setDragSnapshot(null);
    }
  });

  useEffect(() => {
    if (didCommitRef.current && isDragAnimating) {
      animate(dragX, 0, {
        type: "spring",
        stiffness: 400,
        damping: 30,
        onComplete: () => {
          setIsDragAnimating(false);
          setDragSnapshot(null);
          didCommitRef.current = false;
          commitDirectionRef.current = null;
        },
      });
    }
  }, [currentTrack?.id, dragX, isDragAnimating]);

  const handleDragEnd = () => {
    const finalX = dragX.get();
    const didSkip =
      (finalX > DRAG_THRESHOLD && prev[0]) ||
      (finalX < -DRAG_THRESHOLD && next[0]);

    if (finalX > DRAG_THRESHOLD && prev[0]) {
      didCommitRef.current = true;
      commitDirectionRef.current = "prev";
      onSkipPrev?.();
    } else if (finalX < -DRAG_THRESHOLD && next[0]) {
      didCommitRef.current = true;
      commitDirectionRef.current = "next";
      onSkipNext?.();
    }

    if (!didSkip) {
      animate(dragX, 0, {
        type: "spring",
        stiffness: 650,
        damping: 40,
      });
    }

    setIsDragging(false);
    isDraggingRef.current = false;
  };

  if (!currentTrack) {
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
            {/* Draggable Current Track */}
            <motion.div
              drag="x"
              dragConstraints={{ left: -300, right: 300 }}
              dragElastic={0.1}
              dragMomentum={false}
              className="cursor-grab active:cursor-grabbing relative album-floating-shadow"
              style={{ 
                x: dragX,
                // @ts-expect-error CSS custom property
                "--album-glow": glowMid,
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
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
                  animate={isDragging ? undefined : bounceAnimate}
                  transition={bounceTransition}
                  style={{
                    transformOrigin: "center center",
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                  }}
                >
                  {/* Progress bar - full height overlay, fills left to right */}
                  <div 
                    className="absolute top-0 left-0 z-30 cursor-pointer opacity-40 hover:opacity-70 transition-opacity"
                    style={{ width: ALBUM_SIZE, height: ALBUM_SIZE }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!currentTrack || !onSeek) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percent = x / rect.width;
                      onSeek(Math.floor(percent * currentTrack.durationMs));
                    }}
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
                    {/* Time indicator above handle */}
                    <motion.div
                      className="absolute top-0 pointer-events-none"
                      style={{ left: smoothProgressWidth }}
                    >
                      <span 
                        className="absolute left-1/2 -translate-x-1/2 -top-5 text-[10px] font-medium tabular-nums text-white/70"
                      >
                        {formatTime(positionMs)}
                      </span>
                    </motion.div>
                  </div>

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
                    style={{
                      width: ALBUM_SIZE,
                    }}
                    draggable={false}
                    className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30"
                    src={currentImageSrc || ""}
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Previous Track Preview - higher z-index to appear above current */}
            {prevImageSrc && (
              <motion.div
                className="absolute top-0 pointer-events-none z-20"
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

            {/* Next Track Preview - higher z-index to appear above current */}
            {nextImageSrc && (
              <motion.div
                className="absolute top-0 pointer-events-none z-20"
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
            {previewPrevTrack && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  x: prevLabelX,
                  opacity: prevPreviewOpacity,
                }}
              >
                <div className="flex flex-col justify-end gap-0.5">
                  <div className="flex items-end font-light text-current/70">
                    {previewPrevTrack.album}
                  </div>
                  <div className="text-3xl font-bold xl:text-5xl">
                    {previewPrevTrack.name}
                  </div>
                  <div className="flex items-end mt-2 font-light text-current/70">
                    {previewPrevTrack.artists?.join(", ")}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Next Track Label - slides in from right */}
            {previewNextTrack && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  x: nextLabelX,
                  opacity: nextPreviewOpacity,
                }}
              >
                <div className="flex flex-col justify-end gap-0.5">
                  <div className="flex items-end font-light text-current/70">
                    {previewNextTrack.album}
                  </div>
                  <div className="text-3xl font-bold xl:text-5xl">
                    {previewNextTrack.name}
                  </div>
                  <div className="flex items-end mt-2 font-light text-current/70">
                    {previewNextTrack.artists?.join(", ")}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Current Track Label - slides down when dragging */}
            <motion.div
              style={{
                perspective: "800px",
                opacity: currentLabelOpacity,
                y: currentLabelY,
              }}
              className="flex flex-col justify-end gap-0.5"
            >
              <div className="flex items-end font-light">
                {currentTrack.album}
              </div>
              <div className="text-3xl font-bold xl:text-5xl">
                {currentTrack.name}
              </div>
              <div className="flex items-end mt-2 font-light">
                {currentTrack.artists.join(", ")}
              </div>
            </motion.div>
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
