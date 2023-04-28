import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../../types/types';
import {
  motion,
  useAnimation,
  useAnimationControls,
  useAnimationFrame,
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

const addOpacityToRgbColour = (rgbColour: string, opacity: number) => {
  const matchedColors = rgbColour.match(/\d+/g);
  const [r, g, b] = matchedColors || [0, 0, 0];
  return `rgba(${r},${g},${b},${opacity})`;
};

const Player = () => {
  const { queue } = useQueue();
  const lyricsRef = useRef<HTMLDivElement>(null);
  const { current, next, prev } = queue;
  const transitionAnimation = usePlayerStore(
    (state) => state.transitionAnimation
  );
  const setQrColor = usePlayerStore((state) => state.setQrColor);
  const audioData = usePlayerStore((state) => state.audioData);
  const setAudioData = usePlayerStore((state) => state.setAudioData);
  const pausedMultiplier = useMotionValue(Spicetify.Player.isPlaying() ? 0 : 1);
  const pausedMultiplierSpring = useSpring(pausedMultiplier, springConfig);
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const nextTrackControls = useAnimationControls();
  const previousTrackControls = useAnimationControls();
  const currentTrackControls = useAnimationControls();

  const isNextOpacity = useMotionValue(0.6);
  const isPreviousOpacity = useMotionValue(0.4);
  const hueRotateSource = useMotionValue(0);
  const hueRotateValue = useTransform(hueRotateSource, [0, 1], [0, 30]);
  const blurAmount = useTransform(hueRotateSource, [0, 1], [0, 30]);

  const [qrColor, hexQrColor] = useQrColor({ imgRef }, queue);
  useLyricsPlus();

  useEffect(() => {
    const update: (data: any) => void = ({ data }) => {
      pausedMultiplier.set(data.is_paused ? 1 : 0);
      if (!data.is_paused) {
        // animate('div', {});
      } else {
      }
    };
    setTimeout(() => {
      isNextOpacity.set(0);
      isPreviousOpacity.set(0);
    }, 500);
    // @ts-ignore
    Spicetify.Player.addEventListener('onplaypause', update);
    // @ts-ignore
    return () => Spicetify.Player.removeEventListener('onplaypause', update);
  }, []);

  useEffect(() => {
    Spicetify.getAudioData().then((data) => {
      if (audioData.tempo !== data.track.tempo) {
        setAudioData({
          tempo: beatDurationInMilliseconds(
            data.track.tempo.toFixed(0),
            data.track.time_signature
          ),
          duration: +data.track.duration.toFixed(0),
        });
      }
    });
    return () => {};
  }, [Spicetify.Player.data.track, audioData]);

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
  return (
    <>
      <div className="w-full border ">
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
                  style={{
                    filter,
                  }}
                  layout
                  onDragStart={() => {
                    setIsDragging(true);
                  }}
                  whileDrag={{
                    scale: 1.05,
                  }}
                  onDrag={(e, info) => {
                    if (currentTrackControls) {
                      hueRotateSource.set(Math.abs(info.offset.x) / 100);
                      transitionAnimation?.set({
                        opacity: 1 - hueRotateSource.get(),
                      });
                      currentTrackControls.set({
                        opacity: Math.abs(+(50 / info.offset.x).toFixed(3)),
                        scale: hueRotateSource.get() * 0.2 + 1,
                        filter: `hue-rotate(0) blur(${Math.round(
                          hueRotateSource.get() * 5
                        )}px)`,
                        // x: info.offset.x,
                      });
                      console.log(Math.round(hueRotateSource.get() * 100));
                      360 - hueRotateValue.get();
                      if (Math.abs(info.offset.x) > 100) {
                        currentTrackControls.set({
                          filter: `hue-rotate(${
                            360 - hueRotateValue.get()
                          }deg) blur(${Math.round(
                            hueRotateSource.get() * 5
                          )}px)`,
                        });
                      }
                    }
                    if (info.offset.x) {
                      if (info.offset.x > 200) {
                        previousTrackControls.start(
                          { opacity: 1 },
                          {
                            type: 'spring',
                            duration: 0.15,
                          }
                        );
                      } else if (info.offset.x < -200) {
                        nextTrackControls.start(
                          { opacity: 1 },
                          {
                            type: 'spring',
                            duration: 0.15,
                          }
                        );
                      } else {
                        if (previousTrackControls) {
                          previousTrackControls.set({
                            opacity: 0.6,
                            x: info.offset.x - 440,
                          });
                        }
                        if (nextTrackControls) {
                          nextTrackControls.set({
                            opacity: 0.6,
                            x: 440 - Math.abs(Math.min(info.offset.x, 0)) * 1.5,
                          });
                        }
                      }
                    }
                  }}
                  onDragEnd={(e, info) => {
                    if (previousTrackControls) {
                      transitionAnimation?.set({
                        opacity: 1,
                      });
                      previousTrackControls.start(
                        {
                          opacity: 0,
                          x: -440,
                        },
                        {
                          type: 'tween',
                          duration: 0,
                        }
                      );
                    }
                    if (nextTrackControls) {
                      nextTrackControls.start(
                        {
                          opacity: 0,
                          x: 440,
                        },
                        {
                          type: 'tween',
                          duration: 0,
                        }
                      );
                    }
                    if (currentTrackControls) {
                      currentTrackControls.start(
                        {
                          opacity: 1,
                          x: 0,
                          scale: 1,
                          filter: 'hue-rotate(0) blur(0px)',
                        },
                        {
                          type: 'spring',
                          duration: 0.3,
                        }
                      );
                    }
                    if (info.offset.x > 0) {
                      if (info.offset.x > 200) {
                        Spicetify.Player.back();
                      }
                    } else {
                      if (info.offset.x < -200) {
                        Spicetify.Player.next();
                      }
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
                          {prev[0]?.contextTrack?.metadata.image_xlarge_url && (
                            <motion.div>
                              <motion.img
                                ref={imgRef}
                                style={{
                                  width: '400px',
                                  height: '400px',
                                  zIndex: 20,
                                  position: 'absolute',
                                  x: -440,
                                  boxShadow: `1px 2px 8px rgb(0,0,0,0.3)`,
                                  transformOrigin: 'bottom left',
                                }}
                                animate={previousTrackControls}
                                initial={{
                                  opacity: 0,
                                }}
                                transition={{
                                  duration: 0.2,
                                }}
                                draggable={false}
                                className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30 "
                                src={
                                  prev[0]
                                    ? prev[0]?.contextTrack?.metadata
                                        ?.image_xlarge_url
                                    : ''
                                }
                              />
                            </motion.div>
                          )}
                          {next[0]?.contextTrack?.metadata && (
                            <motion.div>
                              <motion.img
                                ref={imgRef}
                                style={{
                                  width: '400px',
                                  height: '400px',
                                  zIndex: 20,
                                  position: 'absolute',
                                  x: 440,
                                  originX: 0,
                                  boxShadow: `1px 2px 8px rgb(0,0,0,0.3)`,
                                  transformOrigin: 'bottom left',
                                }}
                                animate={nextTrackControls}
                                initial={{
                                  opacity: 0,
                                }}
                                transition={{
                                  duration: 0.2,
                                }}
                                draggable={false}
                                className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30 "
                                src={
                                  next[0]
                                    ? next[0]?.contextTrack?.metadata
                                        ?.image_xlarge_url
                                    : ''
                                }
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
                              originX: 0,
                              zIndex: 10,
                              originY: 1,
                              width: '400px',
                              boxShadow: `1px 2px 8px rgb(0,0,0,0.3)`,
                              transformOrigin: 'center center',
                            }}
                            draggable={false}
                            animate={{
                              transform: !isDragging
                                ? [
                                    'perspective(800px) translateY(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)',
                                    'perspective(800px) translateY(1px) rotateX(1deg) rotateY(1deg) rotateZ(1deg) scale(1.01)',
                                    'perspective(800px) translateY(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.01)',
                                    'perspective(800px) translateY(1px) rotateX(-1deg) rotateY(-1deg) rotateZ(-1deg) scale(1)',
                                  ]
                                : [
                                    'perspective(800px) translateY(0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.01)',
                                  ],

                              filter: [
                                `drop-shadow(rgba(0, 0, 0, 0.25) -5px -10px ${
                                  isDragging ? 4 : 4
                                }px)`,
                                `drop-shadow(rgba(0, 0, 0, 0.25) -5px -5px ${
                                  isDragging ? 5 : 2
                                }px)`,
                                `drop-shadow(rgba(0, 0, 0, 0.25) -5px -10px ${
                                  isDragging ? 5 : 4
                                }px)`,
                                `drop-shadow(rgba(0, 0, 0, 0.25) -5px -5px ${
                                  isDragging ? 5 : 4
                                }px)`,
                              ],
                            }}
                            transition={{
                              type: 'spring',
                              duration: +(audioData.tempo / 125).toFixed(2),
                              bounce: 0.3,
                              damping: 12,
                              repeatType: 'mirror',
                              stiffness: 50,
                              repeat: Infinity,
                            }}
                            className="overflow-hidden border border-gray-500 rounded-sm border-opacity-30 "
                            src={
                              current?.contextTrack?.metadata?.image_xlarge_url
                            }
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
              className={` flex flex-col max-w-[400px] xl:max-w-none justify-end gap-0.5`}
            >
              <div className="flex items-end font-light">
                {current.contextTrack?.metadata?.album_title}
              </div>
              <div className="text-3xl font-bold xl:text-5xl">
                {current.contextTrack?.metadata?.title}
              </div>
              <div className="flex items-end mt-2 font-light">
                {current.contextTrack?.metadata?.artist_name}
              </div>
            </motion.div>
          </div>
          <div
            style={{ scrollbarWidth: 'none' }}
            className="relative hide-scrollbar flex-col mx-4 my-[calc(14px+.5rem)] overflow-x-hidden overflow-y-auto border-white border  justify-start"
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
