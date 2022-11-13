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

Dayjs.extend(relativeTime);

interface TFullScreenProps {
  response: any;
}
const FullScreen = ({ response }: TFullScreenProps) => {
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [imageState, setImageState] = useState<any>();
  const [users, setUsers] = useState<Array<{}>>([]);

  useEffect(() => {
    setCurrentSong(Spicetify.Player.data.track);

    return () => {};
  }, []);

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
        {users.map((user: any) => (
          <div className={styles.user_card} key={user.user_id}>
            <span className={styles.username}>{user.display_name}</span>
            <span className={styles.seconds}>
              {user && dayjs(+user.joined_timestamp).fromNow()}
            </span>
          </div>
        ))}
      </div>
      <div>
        {/* {img && JSON.stringify(img)} */}
        <img className={styles.qr} src={imageState} alt="" srcset="" />

        {/* {imageState && imageState} */}
        <img
          className={styles.cover}
          src={currentSong?.metadata.image_large_url}
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
