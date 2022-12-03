import styles from "./css/app.module.scss";
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import FullScreen, { doc } from './components/FullScreen/FullScreen';
import { motion } from 'framer-motion';
import { useCursor, useQrColor, useQueue } from './utils/hooks';

export const App = () => {
  const buildURL = (url: string, queryParams: any) => {
    const params = new URLSearchParams(queryParams).toString();
    return `${url}?${params}`;
  };

  const [state, setState] = useState(0);
  const [response, setResponse] = useState();

  const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

  const endpoint = buildURL(
    'https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new',
    { local_device_id: local_device_id, type: 'REMOTE' }
  );
  useEffect(() => {
    Spicetify.CosmosAsync.get(endpoint).then((data) => setResponse(data));
  }, []);

  const onButtonClick = () => {
    setState(state + 1);
  };

  const { queue } = useQueue();
  const imgRef = useRef<HTMLImageElement>(null);
  const [qrColor] = useQrColor({ imgRef }, queue);

  const fsHandler = () => {
    const container = document.querySelector(
      `.${styles.supersession}.${styles.overlay}`
    );
    if (!container) {
      console.log('no container');
      return;
    }
    if (doc.webkitIsFullScreen) {
      document.exitFullscreen();
      container.classList.add(styles.hidden);
    } else {
      container.classList.remove(styles.hidden);
      document.documentElement.requestFullscreen();
    }
    ReactDOM.render(
      <div className={styles.fullscreen_container}>
        <div className={styles.close} onClick={fsHandler}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <FullScreen response={response} />
      </div>,
      container
    );
  };

  return (
    <>
      <div style={{ backgroundColor: qrColor }} className={styles.supersession}>
        <motion.div
          whileHover={{ opacity: 1 }}
          className={styles.tab_container}
        >
          <FullScreen response={response} />
        </motion.div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          className={`${styles.button} ${styles.large}`}
          onClick={fsHandler}
        >
          {'Enter full Screen'}
        </motion.button>
      </div>
    </>
  );
};

export default App;
