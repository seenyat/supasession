import styles from "../../css/app.module.scss";
import React, { ForwardedRef, useEffect, useState } from "react";
import {
  Encoder,
  QRByte,
  QRKanji,
  ErrorCorrectionLevel,
} from "@nuintun/qrcode";
const qrCode = new Encoder();
import ArtQR from "art-qr";
import qrcode from "easyqrcodejs";
import { getSessionMembers } from "../../app";
import Dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";
let MyQRInstance: any;
import {
  motion,
  Reorder,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useCursor } from "../../utils/hooks";
interface update {
  data: {
    is_paused: boolean;
  };
}
Dayjs.extend(relativeTime);

interface TFullScreenProps {
  response: any;
}
const FullScreen = ({ response }: TFullScreenProps) => {
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [imageState, setImageState] = useState<any>();
  const { cursorXSpring, cursorYSpring } = useCursor();
  const [qrCode, setQrCode] = useState<any>(null);
  const pausedMultiplier = useMotionValue(Spicetify.Player.isPlaying() ? 0 : 1);
  const springConfig = { damping: 25, stiffness: 700 };
  const code = React.createRef<HTMLDivElement>();
  const pausedMultiplierSpring = useSpring(pausedMultiplier, springConfig);
  const filter = useTransform(
    pausedMultiplierSpring,
    (v: number) => `saturate(${1 - v})`
  );
  const scale = useTransform(
    pausedMultiplierSpring,
    (v: number) => 1 - (1 + v) * 0.02
  );
  const [users, setUsers] = useState<Array<{}>>([]);

  useEffect(() => {
    setCurrentSong(Spicetify.Player.data.track);
    return () => {};
  }, [Spicetify.Player.data.track]);
  useEffect(() => {
    const update: (data: update) => void = ({ data }) => {
      pausedMultiplier.set(data.is_paused ? 1 : 0);
    };
    // @ts-ignore
    Spicetify.Player.addEventListener("onplaypause", update);
    // @ts-ignore
    return () => Spicetify.Player.removeEventListener("onplaypause", update);
  });

  useEffect(() => {
    // return;
    if (!response || !response["join_session_token"] || code.current === null) {
      return;
    }

    if (!qrCode) {
      const qr = new qrcode(code.current, {
        text: `https://open.spotify.com/socialsession/${imageState}`,
        width: 1000,
        height: 1000,
        dotScale: 1,
        dotScaleTiming: 0.5,
        dotScaleTiming_H: undefined,
        dotScaleTiming_V: undefined,
        dotScaleA: 0.5,
        dotScaleAO: undefined,
        dotScaleAI: undefined,
      });
      setQrCode(qr);
    } else {
      // qrCode.clear();
      qrCode.makeCode(`https://open.spotify.com/socialsession/${imageState}`);
    }
  }, [code]);

  useEffect(() => {
    const interval = setInterval(() => {
      getSessionMembers(response?.join_session_token).then((data) => {
        setUsers(data);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [response]);

  const img = new Image();
  useEffect(() => {
    console.log({ currentSong });
    if (!response || !currentSong) {
      return;
    }
    // img.crossOrigin = "Anonymous";
    // img.src = currentSong.metadata.image_large_url;
    // img.onload = () => {
    //   MyQRInstance = new ArtQR().create({
    //     text: `https://open.spotify.com/socialsession/${response.join_session_token}`,
    //     size: 300,
    //     margin: 10,
    //     backgroundImage: img,
    //     callback: function (dataUri:string) {
    //       console.log('123',dataUri)
    //     },
    //     bindElement: 'qr' // id of <img /> in real dom
    //   });
    // }

    setImageState(
      `https://open.spotify.com/socialsession/${response.join_session_token}`
    );
  }, [response, currentSong]);

  return (
    <div className={styles.container}>
      <div className={styles.session}>
        <Reorder.Group axis="y" values={users} onReorder={setUsers}>
          {users?.length > 0 &&
            users.map((user: any) => (
              <Reorder.Item key={user.user_id} value={user}>
                <div className={styles.user_card} key={user.user_id}>
                  <span className={styles.username}>
                    {user.display_name}
                    {(user.display_name as string)
                      .toLowerCase()
                      .includes("alex") && " С др!"}
                  </span>
                  <span className={styles.seconds}>
                    {user && dayjs(+user.joined_timestamp).fromNow()}
                  </span>
                </div>
              </Reorder.Item>
            ))}
        </Reorder.Group>
      </div>
      <div>
        {/* {img && JSON.stringify(img)} */}

        {/* {imageState && imageState} */}
        <div className={styles.images}>
          <motion.img
            whileHover={{ scale: 1.1 }}
            style={{
              originX: 1,
              originY: 1,
              scale,
              filter,
            }}
            className={styles.cover}
            src={currentSong?.metadata.image_xlarge_url}
            alt=""
          />
          <motion.div
            whileHover={{ opacity: 1, scale: 1.3 }}
            whileTap={{ transform: "rotate(90deg)" }}
            className={styles.qr}
            style={{ originX: 0, originY: 1 }}
          >
            <div alt="" ref={code} srcset="" />
          </motion.div>
        </div>
        <motion.div
          className={styles.cursor}
          style={{
            translateX: cursorXSpring,
            translateY: cursorYSpring,
          }}
        />
        <div>{currentSong?.metadata.album_title}</div>
        <div>{currentSong?.metadata.title}</div>
        <div>{currentSong?.metadata.album_artist_name}</div>
      </div>
    </div>
  );
};

export default FullScreen;
