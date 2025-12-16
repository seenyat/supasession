import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useLyricsPlus, useQrColor, useQueue } from '../../../utils/hooks';
import { usePlayerStore } from '../../../app';
import {
  beatDurationInMilliseconds,
  getContrastColor,
} from '../../../utils/functions';

const springConfig = { damping: 25, stiffness: 700 };
const DRAG_THRESHOLD = 200;
const TRACK_OFFSET = 440;

const BOUNCE_ANIMATE = {
  rotateX: [0, 1, 0, -1],
  rotateY: [0, 1, 0, -1],
  rotateZ: [0, 1, 0, -1],
  scale: [1, 1.01, 1.01, 1],
  y: [0, 1, 0, 1],
  boxShadow: [
    '-5px 10px 4px rgba(0,0,0,0.25)',
    '-5px 5px 2px rgba(0,0,0,0.25)',
    '-5px 10px 4px rgba(0,0,0,0.25)',
    '-5px 5px 4px rgba(0,0,0,0.25)',
  ],
} as const;

const DRAG_ANIMATE = {
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  scale: 1.01,
  y: 0,
  boxShadow: '-5px 5px 5px rgba(0,0,0,0.25)',
} as const;

const addOpacityToRgbColour = (rgbColour: string, opacity: number) => {
  const matchedColors = rgbColour.match(/\d+/g);
  const [r, g, b] = matchedColors || [0, 0, 0];
  return `rgba(${r},${g},${b},${opacity})`;
};

let playerRenderCount = 0;
const Player = () => {
  console.log('[Player] component render #', ++playerRenderCount);
  const { queue } = useQueue();
  const lyricsRef = useRef<HTMLDivElement>(null);
  const { current, next, prev } = queue;
  const transitionAnimation = usePlayerStore(
    (state) => state.transitionAnimation
  );
  const setQrColor = usePlayerStore((state) => state.setQrColor);
  const audioData = usePlayerStore((state) => state.audioData);
  const setAudioData = usePlayerStore((state) => state.setAudioData);
  const pausedMultiplier = useMotionValue(Spicetify?.Player?.isPlaying?.() ? 0 : 1);
  const pausedMultiplierSpring = useSpring(pausedMultiplier, springConfig);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const nextTrackControls = useAnimationControls();
  const previousTrackControls = useAnimationControls();
  const currentTrackControls = useAnimationControls();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const isNextOpacity = useMotionValue(0.6);
  const isPreviousOpacity = useMotionValue(0.4);
  const hueRotateSource = useMotionValue(0);
  const hueRotateValue = useTransform(hueRotateSource, [0, 1], [0, 30]);
  const blurAmount = useTransform(hueRotateSource, [0, 1], [0, 30]);

  const currentImageUrl = current?.contextTrack?.metadata?.image_xlarge_url;
  const [qrColor, hexQrColor] = useQrColor({ imgRef, src: currentImageUrl });
  useLyricsPlus();

  useEffect(() => {
    const update = ({ data }: { data: { is_paused: boolean } }) => {
      pausedMultiplier.set(data.is_paused ? 1 : 0);
    };
    setTimeout(() => {
      isNextOpacity.set(0);
      isPreviousOpacity.set(0);
    }, 500);

    Spicetify?.Player?.addEventListener?.('onplaypause', update);
    return () => Spicetify?.Player?.removeEventListener?.('onplaypause', update);
  }, []);

  useEffect(() => {
    if (!current) return;
    Spicetify?.getAudioData?.()?.then((data) => {
      if (data?.track) {
        setAudioData({
          tempo: beatDurationInMilliseconds(
            data.track.tempo.toFixed(0),
            data.track.time_signature
          ),
          duration: +data.track.duration.toFixed(0),
        });
      }
    });
  }, [current?.contextTrack?.uri]); // Only fetch when track URI changes

  useEffect(() => {
    const x = setInterval(() => {
      if (
        lyricsRef.current &&
        lyricsRef.current.textContent
          ?.toLocaleLowerCase()
          .includes('instrumental')
      ) {
        lyricsRef.current.style.display = 'none';
      } else if (
        lyricsRef.current &&
        lyricsRef.current.style.display === 'none'
      ) {
        lyricsRef.current.style.display = 'block';
      }
    }, 5000);

    return () => {
      clearInterval(x);
    };
  }, []);

  useEffect(() => {
    setQrColor(hexQrColor);
    lyricsRef.current?.style.setProperty(
      '--contrast',
      getContrastColor(qrColor)
    );
  }, [hexQrColor]);

  const filter = useTransform(
    pausedMultiplierSpring,
    (v: number) => `saturate(${1 - v})`
  );

  const bounceTransition = useMemo(
    () => ({
      duration: Math.max(0.5, audioData.tempo / 125),
      ease: 'easeInOut' as const,
      repeat: Infinity,
      repeatType: 'mirror' as const,
    }),
    [audioData.tempo]
  );

  return (
    <>
      <div className="w-full">
        <div className="grid h-full pb-12 xl:grid-cols-[4fr_3fr]">
          <div
            id="view"
            className="relative flex h-full w-full flex-col justify-end gap-4 px-4 pb-12]"
          >
            {audioData.tempo && (
              <div className="relative w-max" ref={imgContainerRef}>
                <motion.div
                  drag="x"
                  className="cursor-grab"
                  style={{ filter }}
                  onDragStart={() => setIsDragging(true)}
                  whileDrag={{ scale: 1.05 }}
                  onDrag={(e, info) => {
                    if (!isMounted) return;
                    hueRotateSource.set(Math.abs(info.offset.x) / 100);
                    transitionAnimation?.set({
                      opacity: 1 - hueRotateSource.get(),
                    });
                    currentTrackControls.set({
                      opacity: Math.abs(+(50 / info.offset.x).toFixed(3)),
                      scale: hueRotateSource.get() * 0.2 + 1,
                      filter: `hue-rotate(0) blur(${Math.round(hueRotateSource.get() * 5)}px)`,
                    });
                    if (Math.abs(info.offset.x) > 100) {
                      currentTrackControls.set({
                        filter: `hue-rotate(${360 - hueRotateValue.get()}deg) blur(${Math.round(hueRotateSource.get() * 5)}px)`,
                      });
                    }
                    if (info.offset.x) {
                      if (info.offset.x > DRAG_THRESHOLD) {
                        previousTrackControls.start({ opacity: 1 }, { type: 'spring', duration: 0.15 });
                      } else if (info.offset.x < -DRAG_THRESHOLD) {
                        nextTrackControls.start({ opacity: 1 }, { type: 'spring', duration: 0.15 });
                      } else {
                        previousTrackControls.set({ opacity: 0.6, x: info.offset.x - TRACK_OFFSET });
                        nextTrackControls.set({ opacity: 0.6, x: TRACK_OFFSET - Math.abs(Math.min(info.offset.x, 0)) * 1.5 });
                      }
                    }
                  }}
                  onDragEnd={(e, info) => {
                    if (!isMounted) return;
                    transitionAnimation?.set({ opacity: 1 });
                    previousTrackControls.start({ opacity: 0, x: -TRACK_OFFSET }, { type: 'tween', duration: 0 });
                    nextTrackControls.start({ opacity: 0, x: TRACK_OFFSET }, { type: 'tween', duration: 0 });
                    currentTrackControls.start(
                      { opacity: 1, x: 0, scale: 1, filter: 'hue-rotate(0) blur(0px)' },
                      { type: 'spring', duration: 0.3 }
                    );
                    if (info.offset.x > DRAG_THRESHOLD) {
                      Spicetify?.Player?.back?.();
                    } else if (info.offset.x < -DRAG_THRESHOLD) {
                      Spicetify?.Player?.next?.();
                    }
                    hueRotateSource.set(0);
                    setIsDragging(false);
                    setTimeout(() => {
                      isNextOpacity.set(0);
                      isPreviousOpacity.set(0);
                    }, 500);
                  }}
                  dragConstraints={imgContainerRef}
                >
                  {
                    <>
                      {
                        <>
                          {prev[0]?.contextTrack?.metadata?.image_xlarge_url && (
                            <motion.div>
                              <motion.img
                                style={{
                                  width: '400px',
                                  height: '400px',
                                  zIndex: 20,
                                  position: 'absolute',
                                  x: -TRACK_OFFSET,
                                  boxShadow: '1px 2px 8px rgb(0,0,0,0.3)',
                                  transformOrigin: 'bottom left',
                                }}
                                animate={previousTrackControls}
                                initial={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                draggable={false}
                                className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30"
                                src={prev[0]?.contextTrack?.metadata?.image_xlarge_url || ''}
                              />
                            </motion.div>
                          )}
                          {next[0]?.contextTrack?.metadata?.image_xlarge_url && (
                            <motion.div>
                              <motion.img
                                style={{
                                  width: '400px',
                                  height: '400px',
                                  zIndex: 20,
                                  position: 'absolute',
                                  x: TRACK_OFFSET,
                                  originX: 0,
                                  boxShadow: '1px 2px 8px rgb(0,0,0,0.3)',
                                  transformOrigin: 'bottom left',
                                }}
                                animate={nextTrackControls}
                                initial={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                draggable={false}
                                className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30"
                                src={next[0]?.contextTrack?.metadata?.image_xlarge_url || ''}
                              />
                            </motion.div>
                          )}
                        </>
                      }
                      {current?.contextTrack?.metadata?.image_xlarge_url && (
                        <motion.div animate={currentTrackControls}>
                          <motion.img
                            ref={imgRef}
                            style={{
                              zIndex: 10,
                              width: '400px',
                              transformOrigin: 'center center',
                              transformStyle: 'preserve-3d',
                              willChange: 'transform, box-shadow',
                              perspective: 800,
                            }}
                            draggable={false}
                            animate={isDragging ? DRAG_ANIMATE : BOUNCE_ANIMATE}
                            transition={bounceTransition}
                            className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30"
                            src={current?.contextTrack?.metadata?.image_xlarge_url}
                          />
                        </motion.div>
                      )}
                    </>
                  }
                </motion.div>
              </div>
            )}
            <motion.div
              style={{
                perspective: '800px',
                filter: 'drop-shadow(rgba(0, 0, 0, 0.25) -1px -10px 6px)',
              }}
              animate={{
                opacity: qrColor ? 1 : 0,
                filter: `drop-shadow(rgba(0, 0, 0, 0.25) -1px -10px 6px) blur(${blurAmount.get()}px)`,
                color:
                  getContrastColor(qrColor) === 'white'
                    ? 'rgb(255,255,255)'
                    : 'rgb(0,0,0)',
              }}
              className="flex flex-col max-w-[400px] xl:max-w-none justify-end gap-0.5"
            >
              <div className="flex items-end font-light">
                {current?.contextTrack?.metadata?.album_title}
              </div>
              <div className="text-3xl font-bold xl:text-5xl">
                {current?.contextTrack?.metadata?.title}
              </div>
              <div className="flex items-end mt-2 font-light">
                {current?.contextTrack?.metadata?.artist_name}
              </div>
            </motion.div>
          </div>
          <div
            style={{ scrollbarWidth: 'none' }}
            className="relative hide-scrollbar flex-col mx-4 my-[calc(14px+.5rem)] overflow-x-hidden overflow-y-auto justify-start"
          >
            <div
              ref={lyricsRef}
              id="fad-lyrics-plus-container"
              className="absolute inset-0 w-full h-full max-h-full"
            ></div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Player;
