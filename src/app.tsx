import styles from './css/app.module.scss';
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { doc } from './components/FullScreen/FullScreen';
import { motion } from 'framer-motion';
import { useQrColor, useQueue } from './utils/hooks';
import FullScreenView from './pages/FullScreenView/FullScreenView';
import SupaSession from './components/SupaSession/SupaSession';
import { Expand } from 'lucide-react';

import { create } from 'zustand';
import { getContrastColor } from './utils/functions';

export interface PlayerStore {
  queue: any;
  setQueue: (queue: any) => void;
  audioData: {
    tempo: number;
    duration: number;
  };
  setAudioData: ({
    tempo,
    duration,
  }: {
    tempo: number;
    duration: number;
  }) => void;
  qrColor: string;
  setQrColor: (qrColor: string) => void;
  joinSessionToken: string;
  setJoinSessionToken: (joinSessionToken: string) => void;
}

export async function getAlbumData(uri: string) {
  const id = uri.split(':')[2];
  return Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/albums/${id}`);
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  queue: [],
  setQueue: (queue: any) => set({ queue }),
  qrColor: 'black',
  audioData: {
    tempo: 0,
    duration: 10000,
  },
  joinSessionToken: '',
  setJoinSessionToken: (joinSessionToken: string) => set({ joinSessionToken }),
  setAudioData: (audioData) => set({ audioData }),
  setQrColor: (qrColor: string) => set({ qrColor }),
}));

export const App = () => {
  const buildURL = (url: string, queryParams: any) => {
    const params = new URLSearchParams(queryParams).toString();
    return `${url}?${params}`;
  };
  const [isFullScreen, setIsFullScreen] = useState(false);
  const setJoinSessionToken = usePlayerStore(
    (state) => state.setJoinSessionToken
  );

  const [response, setResponse] = useState();

  const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

  const endpoint = buildURL(
    'https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new',
    { local_device_id: local_device_id, type: 'REMOTE' }
  );
  useEffect(() => {
    Spicetify.CosmosAsync.get(endpoint).then((data) =>
      setJoinSessionToken(data.join_session_token)
    );
  }, []);

  const { queue } = useQueue();
  const [qrColor] = usePlayerStore((state) => [state.qrColor]);

  const fsHandler = () => {
    const container = document.querySelector(
      `.${styles.supersession}.${styles.overlay}`
    );
    if (!container) {
      // console.log('no container');
      return;
    }
    if (doc.webkitIsFullScreen) {
      document.exitFullscreen();
      setIsFullScreen(false);
      container.classList.add(styles.hidden);
    } else {
      container.classList.remove(styles.hidden);
      setIsFullScreen(true);
      document.documentElement.requestFullscreen();
    }
    ReactDOM.render(
      <div className={styles.fullscreen_container}>
        <FullScreenView />
      </div>,
      container
    );
  };

  return (
    <>
      {!isFullScreen && (
        <div
          style={{ backgroundColor: qrColor }}
          className={styles.supersession + ' overflow-hidden pb-24'}
        >
          <motion.div className={styles.tab_container}>
            <SupaSession />
          </motion.div>
          {qrColor && (
            <button
              className={` overflow-hidden bg-[${getContrastColor(
                qrColor
              )}/0.5] absolute bottom-8  text-opacity-30 bg-opacity-0 hover:bg-opacity-100 rounded p-4 opacity-20 hover:opacity-30`}
              onClick={fsHandler}
              style={{
                color: getContrastColor(qrColor),
              }}
            >
              <Expand />
            </button>
          )}
        </div>
      )}
    </>
  );
};

const TailwindClasses = (
  <div className="bg-[black/0.5] ">
    <div className="bg-[white/0.5]"></div>
  </div>
);

export default App;
