import styles from '../../css/app.module.scss';
import React, { useEffect, useState } from 'react';
import Dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  useCursor,
  useLyricsPlus,
  useQRCode,
  useQueue,
  useSessionMembers,
} from '../../utils/hooks';
import UserCard from '../UserCard/UserCard';
import { FastAverageColor } from 'fast-average-color';

const fac = new FastAverageColor();
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
  const [lyricsRef, setLyricsRef] = useState<any>(null);
  const pausedMultiplier = useMotionValue(Spicetify.Player.isPlaying() ? 0 : 1);
  const springConfig = { damping: 25, stiffness: 700 };
  const pausedMultiplierSpring = useSpring(pausedMultiplier, springConfig);
  const filter = useTransform(
    pausedMultiplierSpring,
    (v: number) => `saturate(${1 - v})`
  );
  const { queue } = useQueue();
  const [qrColor, setQrColor] = useState<string>('');
  const coverSelector = styles.cover || '';

  useEffect(() => {
    fac
      .getColorAsync(document.querySelector('img'))
      .then((color) => {
        setQrColor(color.hex);
        console.log({ color: color.hex });
      })
      .catch((e) => {
        console.log(e);
      });
  }, [queue]);

  useEffect(() => {
    const newSong = Spicetify.Player.data.track;
    if (
      !currentSong ||
      newSong?.metadata?.title !== currentSong?.metadata.title
    ) {
      setCurrentSong(newSong);
    }
    return () => {};
  }, [Spicetify.Player.data.track]);

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
    console.log({ currentSong });
    if (!response || !currentSong) {
      return;
    }

    setSessionUrl(
      `https://open.spotify.com/socialsession/${response.join_session_token}`
    );
  }, [response, currentSong]);
  console.log(queue);

  return (
    <div className={styles.container}>
      <div className={styles.queue}>
        {queue.next &&
          queue.next.map((el, i) => (
            <div className={styles.queue_card}>
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
            </div>
          ))}
      </div>
      <div className={styles.meta}>
        <div className={styles.session}>
          {users &&
            users.length > 0 &&
            users.map((user: any) => <UserCard user={user} />)}
        </div>
        <div className={styles.blurContainer}>
          <motion.img
            className={styles.backgroundImage}
            src={currentSong?.metadata.image_xlarge_url}
            alt=""
            style={{
              filter,
            }}
          />
        </div>
        <div>
          <div className={styles.images}>
            <motion.img
              whileHover={{ scale: 1.1 }}
              style={{
                originX: 0,
                originY: 1,
                filter,
              }}
              whileTap={{ scale: 0.9 }}
              className={styles.cover}
              src={currentSong?.metadata.image_xlarge_url}
            />
            {qrCode && (
              <motion.img
                whileHover={{ scale: 1.2 }}
                style={{
                  originX: 0,
                  originY: 1,
                  backgroundColor: qrColor || 'white',
                }}
                src={qrCode}
                className={styles.qrCode}
                whileTap={{ scale: 0.9 }}
              />
            )}
          </div>
          <motion.div
            className={styles.cursor}
            style={{
              translateX: cursorXSpring,
              translateY: cursorYSpring,
            }}
          />
          <div>{currentSong?.metadata.album_title}</div>
          <div className={styles.title}>{currentSong?.metadata.title}</div>
          <div>{currentSong?.metadata.album_artist_name}</div>
        </div>
      </div>
      <div id="fad-lyrics-plus-container" ref={lyricsRef}></div>
    </div>
  );
};

export default FullScreen;
