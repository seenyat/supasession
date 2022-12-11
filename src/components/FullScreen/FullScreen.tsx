import styles from '../../css/app.module.scss';
import React, { useEffect, useRef, useState } from 'react';
import Dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  animate,
  LayoutGroup,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  useCursor,
  useLyricsPlus,
  useQRCode,
  useQrColor,
  useQueue,
  useSessionMembers,
} from '../../utils/hooks';
import UserCard from '../UserCard/UserCard';
import { Track } from '../../types/types';
import { getContrastColor, setColorOpacity } from '../../utils/functions';
import { rgba } from '@react-spring/shared';

interface update {
  data: {
    is_paused: boolean;
  };
}

interface Document {
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  mozFullScreenElement?: Element;
  msFullscreenElement?: Element;
  webkitFullscreenElement?: Element;
}

interface HTMLElement {
  msRequestFullscreen?: () => Promise<void>;
  mozRequestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
}
// Define an interface that extends the Document interface and adds the webkitIsFullScreen property
interface WebkitDocument extends Document {
  webkitIsFullScreen: boolean;
}

// Use the WebkitDocument interface as the type for the document object
export const doc: WebkitDocument = document as unknown as WebkitDocument;
Dayjs.extend(relativeTime);

interface TFullScreenProps {
  response: any;
}
const FullScreen = ({ response }: TFullScreenProps) => {
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [sessionUrl, setSessionUrl] = useState<any>('');
  const { cursorXSpring, cursorYSpring } = useCursor();
  const [audioData, setAudioData] = useState<any>(null);
  const [lyricsRef, setLyricsRef] = useState<any>(null);
  const pausedMultiplier = useMotionValue(Spicetify.Player.isPlaying() ? 0 : 1);
  const springConfig = { damping: 25, stiffness: 700 };
  const imgRef = useRef<HTMLImageElement>(null);
  const pausedMultiplierSpring = useSpring(pausedMultiplier, springConfig);
  const filter = useTransform(
    pausedMultiplierSpring,
    (v: number) => `saturate(${1 - v})`
  );
  const { queue } = useQueue();
  const [queuePrev, setQueuePrev] = useState<any>(queue.prev);
  const coverSelector = styles.cover || '';

  const [qrColor, hexQrColor] = useQrColor({ imgRef }, queue);

  useEffect(() => {
    const newSong = Spicetify.Player.data.track;
    if (
      !currentSong ||
      newSong?.metadata?.title !== currentSong?.metadata.title
    ) {
      Spicetify.getAudioData().then((data) => {
        setAudioData(data.track.tempo);
      });
      setCurrentSong(newSong);
      setQueuePrev(queue.prev);
    }
    return () => {};
  }, [Spicetify.Player.data.track]);

  // useEffect(() => {
  //   imgRef.current?.remove();
  //   React.createElement('img', {
  //     src: currentSong?.metadata?.image_url,
  //     ref: imgRef,
  //   });
  // }, [currentSong]);

  useLyricsPlus();

  useEffect(() => {
    const update: (data: update) => void = ({ data }) => {
      pausedMultiplier.set(data.is_paused ? 1 : 0);
    };
    // @ts-ignore
    Spicetify.Player.addEventListener('onplaypause', update);
    // @ts-ignore
    return () => Spicetify.Player.removeEventListener('onplaypause', update);
  }, []);

  const { qrCode } = useQRCode({ sessionUrl });

  const users = useSessionMembers({
    joinSessionToken: response?.join_session_token,
  });

  useEffect(() => {
    if (!response || !currentSong) {
      return;
    }

    setSessionUrl(
      `https://open.spotify.com/socialsession/${response?.join_session_token}`
    );
  }, [response, currentSong]);

  return (
    <div className={styles.container}>
      <div
        style={{ color: getContrastColor(qrColor) }}
        className={styles.queue}
      >
        {queue.next &&
          queue.next
            .filter((el: Track) => el.contextTrack?.metadata?.title)
            .slice(0, 4)
            .map((el: Track, i: number) => (
              <motion.div
                layoutId={
                  el.contextTrack?.metadata?.title &&
                  el.contextTrack.metadata.title
                    .replace(/\s/g, '')
                    .toLowerCase()
                    .slice(0, 5)
                }
                key={
                  el.contextTrack?.metadata?.title &&
                  el.contextTrack.metadata.title
                    .replace(/\s/g, '')
                    .toLowerCase()
                    .slice(0, 5)
                }
                onClick={() => {
                  queue.next = queue.next.filter(
                    (_: Track, ind: number) => ind !== i
                  );
                }}
                className={styles.queue_card}
              >
                <img
                  className={styles.queueCover}
                  src={el.contextTrack?.metadata.image_url}
                  alt=""
                />
                <div className={styles.indexNum}>
                  <div>{i + 1}</div>
                </div>
                <div className={styles.queue_meta}>
                  <div>{el.contextTrack?.metadata?.title}</div>
                  <div>{el.contextTrack?.metadata?.artist_name}</div>
                </div>
              </motion.div>
            ))}
      </div>
      <div
        style={{ color: getContrastColor(qrColor) }}
        className={styles.queue_prev}
      >
        {queuePrev &&
          [...queuePrev]
            .reverse()
            .filter((el) => el?.contextTrack?.metadata?.title)
            .slice(0, 4)
            .map((el: Track, i: number) => (
              <motion.div
                key={
                  el.contextTrack?.metadata?.title &&
                  el.contextTrack.metadata.title
                    .replace(/\s/g, '')
                    .toLowerCase()
                    .slice(0, 5)
                }
                // animate={{
                //   transform: [
                //     'translateY(0px) rotate(0deg) scale(1)',
                //     'translateY(4px) rotate(1deg) scale(1.02)',
                //     'translateY(0px) rotate(0deg) scale(1.02)',
                //     'translateY(4px) rotate(-1deg) scale(1)',
                //   ],
                // }}
                // transition={{
                //   type: 'spring',
                //   duration: +(60 / audioData).toFixed(1),
                //   bounce: 0.25,
                //   damping: 10,
                //   repeatType: 'mirror',
                //   stiffness: 25,
                //   repeat: Infinity,
                // }}
                layoutId={
                  el.contextTrack?.metadata?.title &&
                  el.contextTrack.metadata.title
                    .replace(/\s/g, '')
                    .toLowerCase()
                    .slice(0, 5)
                }
                className={styles.queue_card}
              >
                <img
                  className={styles.queueCover}
                  src={el.contextTrack?.metadata.image_url}
                  alt=""
                />
                <div className={styles.indexNum}>
                  <div>– {i + 1}</div>
                </div>
                <div className={styles.queue_meta}>
                  <div>{el.contextTrack?.metadata?.title}</div>
                  <div>{el.contextTrack?.metadata?.artist_name}</div>
                </div>
              </motion.div>
            ))}
      </div>
      <div className={styles.meta}>
        <div
          style={{ color: getContrastColor(qrColor) }}
          className={styles.session}
        >
          {response?.join_session_token && (
            <img
              className={styles.qrCode}
              src={`https://scannables.scdn.co/uri/plain/png/${hexQrColor.slice(
                1
              )}/${getContrastColor(
                qrColor
              )}/${600}/spotify%3Asocialsession%3A${
                response.join_session_token
              }`}
              alt=""
            />
          )}
          {users &&
            users.length > 0 &&
            users.map((user: any) => <UserCard user={user} />)}
        </div>
        <motion.div
          animate={{
            background: `linear-gradient(to bottom right, ${setColorOpacity(
              1,
              qrColor
            )}, ${setColorOpacity(1, qrColor)})`,
          }}
          className={styles.blurContainer}
        >
          <motion.div
            style={{
              // backgroundColor: qrColor,
              zIndex: 999999,
              position: 'absolute',
              inset: 0,
            }}
            className={styles.backgroundBlur}
          />
          <motion.img
            className={styles.backgroundImage}
            src={currentSong?.metadata.image_xlarge_url}
            alt=""
            style={{
              filter,
              backgroundImage: qrColor,
            }}
          />
        </motion.div>
        <motion.div
          key={
            currentSong?.metadata?.title &&
            currentSong.metadata.title
              .replace(/\s/g, '')
              .toLowerCase()
              .slice(0, 5)
          }
          layoutId={
            currentSong?.metadata?.title &&
            currentSong.metadata.title
              .replace(/\s/g, '')
              .toLowerCase()
              .slice(0, 5)
          }
          animate={{ opacity: 1, scale: [0.2, 1], top: [-500, 0] }}
          transition={{ duration: 0.2 }}
          style={{ zIndex: 99999999999, color: getContrastColor(qrColor) }}
        >
          <div className={styles.images}>
            <motion.img
              whileHover={{ scale: 1.1 }}
              style={{
                originX: 0,
                originY: 1,
                filter,
                transformOrigin: 'center center',
              }}
              animate={{
                transform: [
                  'translateY(0px) rotate(0deg) scale(1)',
                  'translateY(4px) rotate(1deg) scale(1.02)',
                  'translateY(0px) rotate(0deg) scale(1.02)',
                  'translateY(4px) rotate(-1deg) scale(1)',
                ],
              }}
              transition={{
                type: 'spring',
                duration: +(480 / audioData).toFixed(1),
                bounce: 0.25,
                damping: 10,
                repeatType: 'mirror',
                stiffness: 25,
                repeat: Infinity,
              }}
              whileTap={{ scale: 0.9 }}
              className={`${styles.cover} queue_cover`}
              ref={imgRef}
              src={currentSong?.metadata.image_xlarge_url}
            />
            {/* {qrCode && (
              <div style={{ backgroundColor: '`white `' }}>
                <motion.img
                  whileHover={{ scale: 1.2 }}
                  style={{
                    originX: 0,
                    originY: 1,
                    width: '100%',
                    backgroundColor: qrColor || 'white',
                  }}
                  src={qrCode}
                  className={styles.qrCode}
                  whileTap={{ scale: 0.9 }}
                />
              </div>
            )} */}
          </div>
          <div>{currentSong?.metadata.album_title}</div>
          <div className={styles.title}>{currentSong?.metadata.title}</div>
          <div>{currentSong?.metadata.album_artist_name}</div>
        </motion.div>
      </div>
      <motion.div
        className={styles.cursor}
        style={{
          translateX: cursorXSpring,
          translateY: cursorYSpring,
        }}
      />
      <div
        id="fad-lyrics-plus-container"
        style={{
          flexGrow: 0,
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0) 0, transparent 30%, rgba(0,0,0,0.15)  45%,  rgba(0,0,0,0.15) 55%, transparent 70%, rgba(0,0,0,0) 100% )',
          color: getContrastColor(qrColor),
          zIndex: 9999999999999,
        }}
        ref={lyricsRef}
      ></div>
    </div>
  );
};

export default FullScreen;
