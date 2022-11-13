import styles from "./css/app.module.scss";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import FullScreen from "./components/FullScreen/FullScreen";

export const getSessionMembers = async (join_session_token: string) => {
  try {
    const response = await Spicetify.CosmosAsync.get(
      `https://spclient.wg.spotify.com/social-connect/v2/sessions/info/${join_session_token}`
    );
    return response["session_members"];
  } catch (ex) {
    return null;
  }
  return null;
};

export const App = () => {
  const buildURL = (url: string, queryParams: any) => {
    const params = new URLSearchParams(queryParams).toString();
    return `${url}?${params}`;
  };

  const [state, setState] = useState(0);
  const [response, setResponse] = useState();

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
    const container = document.querySelector(`.${styles.supersession}.overlay`);
    if (!container) {
      console.log("no container");
      return;
    }
    if (document.webkitIsFullScreen) {
      document.exitFullscreen();
      container.classList.add(styles.hidden);
    } else {
      container.classList.remove(styles.hidden);
      document.documentElement.requestFullscreen();
    }
    ReactDOM.render(
      <>
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
      </>,
      container
    );
  };

  return (
    <>
      <div className={styles.supersession}>
        <FullScreen response={response} />
        <button
          className={`${styles.button} ${styles.large}`}
          onClick={fsHandler}
        >
          {"Enter full Screen"}
        </button>
      </div>
    </>
  );
};

export default App;
