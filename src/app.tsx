import styles from './css/app.module.scss';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { doc } from './components/FullScreen/FullScreen';
import { AnimationControls, motion } from 'framer-motion';
import { useQueue } from './utils/hooks';
import { useSpicetifyReady } from './utils/useSpicetifyReady';
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
  transitionAnimation?: AnimationControls;
  setTransitionAnimation: (transitionAnimation: AnimationControls) => void;
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
  qrColor: '#000000',
  audioData: {
    tempo: 0,
    duration: 10000,
  },
  transitionAnimation: undefined,
  setTransitionAnimation: (transitionAnimation: AnimationControls) =>
    set({ transitionAnimation }),
  joinSessionToken: '',
  setJoinSessionToken: (joinSessionToken: string) => set({ joinSessionToken }),
  setAudioData: (audioData) => set({ audioData }),
  setQrColor: (qrColor: string) => set({ qrColor }),
}));

let appRenderCount = 0;
export const App = () => {
  console.log('[App] component render #', ++appRenderCount);
  const isReady = useSpicetifyReady();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const setJoinSessionToken = usePlayerStore(
    (state) => state.setJoinSessionToken,
  );

  useEffect(() => {
    if (!isReady) return;

    const localDeviceId = Spicetify.Player.data?.play_origin?.device_identifier;
    if (!localDeviceId) return;

    const params = new URLSearchParams({
      local_device_id: localDeviceId,
      type: 'REMOTE',
    }).toString();
    const endpoint = `https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new?${params}`;

    Spicetify.CosmosAsync.get(endpoint).then((data) =>
      setJoinSessionToken(data?.join_session_token || ''),
    );
  }, [isReady]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullScreen(false);
        const container = document.querySelector(
          `.${styles.supersession}.${styles.overlay}`,
        );
        if (container) {
          container.classList.add(styles.hidden);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const { queue } = useQueue();
  const [qrColor] = usePlayerStore((state) => [state.qrColor]);

  if (!isReady) {
    return <div className={styles.supersession}>Loading...</div>;
  }

  const fsHandler = () => {
    const container = document.querySelector(
      `.${styles.supersession}.${styles.overlay}`,
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
      container,
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
                qrColor,
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

export default App;
