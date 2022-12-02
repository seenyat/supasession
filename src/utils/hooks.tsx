import { useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { checkLyricsPlus, getSessionMembers } from './functions';
import { doc } from '../components/FullScreen/FullScreen';
import { generateQRCode } from './api';

type UseQRCodeParams = {
  sessionUrl: string;
};

type UseQRCodeReturn = {
  qrCode: string;
};

// Define the type for the hook's parameters
type UseSessionMembersParams = {
  joinSessionToken: string;
};

type User = {
  user_id: string;
  display_name: string;
  joined_timestamp: number;
};

export const useQueue = () => {
  const [queue, setQueue] = useState<any>({
    next: Spicetify.Queue.nextTracks,
    prev: Spicetify.Queue.prevTracks,
  });
  useEffect(() => {
    Spicetify.Platform.PlayerAPI._events.addListener(
      'queue_update',
      (data: any) => {
        setQueue({
          next: Spicetify.Queue.nextTracks,
          prev: Spicetify.Queue.prevTracks,
        });
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

export const useCursor = () => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springConfig = { damping: 25, stiffness: 700 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);
  useEffect(() => {
    const moveCursor = (e: any) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);
    };

    window.addEventListener('mousemove', moveCursor);

    return () => {
      window.removeEventListener('mousemove', moveCursor);
    };
  }, []);
  return { cursorXSpring, cursorYSpring };
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
      console.log({ sessionState: sessionState.current, sessionUrl, qrCode });
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
