import styles from "../../css/app.module.scss";
import React, { useEffect, useState } from "react";
import {
  Encoder,
  QRByte,
  QRKanji,
  ErrorCorrectionLevel,
} from "@nuintun/qrcode";
const qrCode = new Encoder();
import ArtQR from "art-qr";
import { getSessionMembers } from "../../app";
import Dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";
let MyQRInstance: any;
import { motion, Reorder } from "framer-motion";
import { useCursor } from "../../utils/hooks";

Dayjs.extend(relativeTime);

interface TFullScreenProps {
  response: any;
}
const FullScreen = ({ response }: TFullScreenProps) => {
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [imageState, setImageState] = useState<any>();
  const { cursorXSpring, cursorYSpring } = useCursor();
  const [users, setUsers] = useState<Array<{}>>([]);

  useEffect(() => {
    setCurrentSong(Spicetify.Player.data.track);

    return () => {};
  }, [Spicetify.Player.data.track]);

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
    console.log(123);
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
    setImageState(img);

    qrCode.clear();
    qrCode.write(
      `https://open.spotify.com/socialsession/${response.join_session_token}`
    );
    qrCode.make();
    setImageState(qrCode.toDataURL());
  }, [response, currentSong]);

  return (
    <div className={styles.container}>
      <div className={styles.session}>
        <Reorder.Group axis="y" values={users} onReorder={setUsers}>
          {users?.length > 0 &&
            users.map((user: any) => (
              <Reorder.Item key={user.user_id} value={user}>
                <div className={styles.user_card} key={user.user_id}>
                  <span className={styles.username}>{user.display_name}</span>
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
        <motion.img
          whileHover={{ scale: 1.1 }}
          style={{ originX: 1, originY: 1 }}
          className={styles.cover}
          src={currentSong?.metadata.image_xlarge_url}
          alt=""
        />
        <motion.div
          className={styles.cursor}
          style={{
            translateX: cursorXSpring,
            translateY: cursorYSpring,
          }}
        />
        <motion.img
          whileHover={{ opacity: 1, scale: 1.3 }}
          whileTap={{ transform: "rotate()" }}
          style={{ originX: 0, originY: 1 }}
          className={styles.qr}
          src={imageState}
          alt=""
          srcset=""
        />
        <div>{currentSong?.metadata.album_title}</div>
        <div>{currentSong?.metadata.title}</div>
        <div>{currentSong?.metadata.album_artist_name}</div>
      </div>
    </div>
  );
};

export default FullScreen;
