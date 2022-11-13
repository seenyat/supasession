import styles from "./css/app.module.scss";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import FullScreen from "./components/FullScreen/FullScreen";

export const App = () => {
  const buildURL = (url: string, queryParams: any) => {
    const params = new URLSearchParams(queryParams).toString();
    return `${url}?${params}`;
  };

  const [state, setState] = useState(0);
  const [response, setResponse] = useState()

  const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

  const endpoint = buildURL(
    "https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new",
    { local_device_id: local_device_id, type: "REMOTE" }
  );
  useEffect(() => {
    Spicetify.CosmosAsync.get(endpoint).then((data) => setResponse(data));
  }, []);

  const onButtonClick = () => {
    setState(state + 1);
  };

  const fsHandler = () => {
    const container = document.querySelector(`.${styles.supersession}`);
    if (!container){
      console.log('no container')
      return
    }
    if (document.webkitIsFullScreen) {
      document.exitFullscreen();
      container.classList.add(styles.hidden);
    } else  {
      container.classList.remove(styles.hidden);
      document.documentElement.requestFullscreen();
    }
    ReactDOM.render(
      <>
        <button className={styles.butteon} onClick={fsHandler}>
          {"Full Screen"}
        </button>
        <FullScreen response={response} />
      </>,
      container
    );
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.title}>{"Supersession!"}</div>
        <button className={styles.button} onClick={fsHandler}>
          {"Full Screen"}
        </button>
        <div className={styles.counter}>{state}</div>
      </div>
    </>
  );
};

export default App;
