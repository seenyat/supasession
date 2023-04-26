import { useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { checkLyricsPlus, getSessionMembers } from './functions';
import { doc } from '../components/FullScreen/FullScreen';
import { generateQRCode } from './api';
import { FastAverageColor } from 'fast-average-color';
import Queue from '../components/Blocks/Queue.tsx/Queue';

const fac = new FastAverageColor();

type UseQRCodeParams = {
  sessionUrl: string;
};

type UseQRCodeReturn = {
  qrCode: string;
};

type Color = {
  hex: string;
  rgba: string;
};

type UseQrColorParams = {
  qrCode: string;
};

type UseQrColorResult = [string, string];
// Define the type for the hook's parameters
type UseSessionMembersParams = {
  joinSessionToken: string;
};

type User = {
  user_id: string;
  display_name: string;
  joined_timestamp: number;
};

export const useQueue = (): {
  queue: {
    next: any[];
    prev: any[];
    current: any;
  };
} => {
  // console.log(Queue);
  const [queue, setQueue] = useState<any>({
    next: [...Spicetify.Queue.nextTracks],
    prev: [...Spicetify.Queue.prevTracks],
    current: { ...Spicetify.Queue?.track },
  });
  useEffect(() => {
    Spicetify.Platform.PlayerAPI._events.addListener(
      'queue_update',
      (data: any) => {
        const queue = JSON.parse(JSON.stringify(Spicetify.Queue));
        setQueue((state) => ({
          current: { ...queue.track },
          next: [...queue.nextTracks],
          prev: [state.current],
        }));
      }
    );
    return () => {
      Spicetify.Platform.PlayerAPI._events.removeListener(
        'queue_update',
        setQueue
      );
    };
  }, []);
  return { queue };
};

// Define the useSessionMembers hook
export const useSessionMembers = ({
  joinSessionToken,
}: UseSessionMembersParams): User[] => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      getSessionMembers(joinSessionToken).then((data: User[]) => {
        setUsers(data);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [joinSessionToken]);

  return users;
};

// Define the type for the hook's return value

export const useQRCode = ({ sessionUrl }: UseQRCodeParams): UseQRCodeReturn => {
  const [qrCode, setQrCode] = useState<string>();
  const sessionState = useRef<string>();

  useEffect(() => {
    if (sessionUrl) {
      const link = generateQRCode(sessionUrl, 500);
      setQrCode(link);
      // console.log({ sessionState: sessionState.current, sessionUrl, qrCode });
    }
  }, [sessionUrl]);

  return { qrCode: qrCode || '' };
};

export const useLyricsPlus = () => {
  useEffect(() => {
    if (
      Spicetify?.Config.custom_apps.includes('lyrics-plus') &&
      checkLyricsPlus()
    ) {
      if (doc.webkitIsFullScreen) {
        Spicetify.Platform.History.push('/lyrics-plus');
      }
    }
    window.dispatchEvent(new Event('fad-request'));
  }, [Spicetify.Player.data.track, doc.webkitIsFullScreen]);
};

export const useQrColor = (
  {
    imgRef,
  }: {
    imgRef: React.RefObject<HTMLImageElement>;
  },
  queue: object
): UseQrColorResult => {
  const [qrColor, setQrColor] = useState<string>('');
  const [hexColor, setHexColor] = useState<string>('');

  useEffect(() => {
    setTimeout(() => {
      if (!imgRef.current) {
        return;
      }
      fac
        .getColorAsync(imgRef.current)
        .then((color: Color) => {
          setQrColor(color.rgba);
          setHexColor(color.hex);
        })
        .catch(() => {
          throw 'Error parsing QR code';
        });
    }, 200);
  }, [fac, imgRef, queue]);

  return [qrColor, hexColor];
};
