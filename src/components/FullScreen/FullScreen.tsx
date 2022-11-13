import styles from '../../css/app.module.scss'
import React, { useEffect, useState } from 'react'
import { Encoder, QRByte, QRKanji, ErrorCorrectionLevel } from '@nuintun/qrcode'
const qrCode = new Encoder()
import ArtQR from 'art-qr';
let MyQRInstance: any;

interface TFullScreenProps {
  response: any,
}
const FullScreen = ({response}: TFullScreenProps) => {
  const [currentSong, setCurrentSong] = useState(null)
  const [imageState, setImageState] = useState<any>()

  useEffect(() => {
    Spicetify.Platform.PlayerAPI._events.addListener("queue_update", (data:any) => {
      setCurrentSong(data.data.current)
    });
  
    return () => {
      
    }
  }, [])
  const img = new Image();
  useEffect(()=> {
    console.log(123)
    console.log({currentSong})
    if (!response || !currentSong) {
      return
    }
    img.crossOrigin = "Anonymous";
    img.src = currentSong.metadata.image_large_url;
    img.onload = () => {
      MyQRInstance = new ArtQR().create({
        text: `https://open.spotify.com/socialsession/${response.join_session_token}`,
        size: 300,
        margin: 10,
        backgroundImage: img,
        callback: function (dataUri:string) {
          console.log('123',dataUri)
        },
        bindElement: 'qr' // id of <img /> in real dom
      });
    }
    setImageState(img)

    qrCode.clear()
    qrCode.write(`https://open.spotify.com/socialsession/${response.join_session_token}`)
    qrCode.make()
    setImageState(qrCode.toDataURL())

  }, [response, currentSong])
  
  return (
    <div className={styles.container}>
      <pre>
      </pre>
      {/* {img && JSON.stringify(img)} */}
      <img src={imageState} alt="" srcset="" />

      {/* {imageState && imageState} */}
      <div>{currentSong?.name}</div>
      <img src={currentSong?.metadata.image_large_url} alt="" srcset="" />


      <div>{currentSong?.metadata.album_artist_name}</div>
    </div>
  )
}


export default FullScreen