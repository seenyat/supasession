import { useEffect, useRef, useState } from 'react';
import { checkLyricsPlus, getSessionMembers } from './functions';
import { doc } from '../components/FullScreen/FullScreen';
import { generateQRCode } from './api';
import { FastAverageColor } from 'fast-average-color';
import { Track } from '../types/types';

const fac = new FastAverageColor();

// Helper to safely stringify objects with BigInt
const safeStringify = (obj: any): string => {
  return JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
};

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

type supaQueue = {
  next: Track[];
  prev: Track[];
  current: Track | null;
};

let queueRenderCount = 0;
export const useQueue = (): {
  queue: {
    next: Track[];
    prev: Track[];
    current: Track | null;
  };
} => {
  console.log('[useQueue] hook called, render #', ++queueRenderCount);
  const [queue, setQueue] = useState<supaQueue>({
    next: [],
    prev: [],
    current: null,
  });
  const callbackRef = useRef<((data: any) => void) | null>(null);

  useEffect(() => {
    // Initialize queue once Spicetify is ready
    if (Spicetify?.Queue) {
      setQueue({
        next: [...(Spicetify.Queue.nextTracks || [])],
        prev: [...(Spicetify.Queue.prevTracks || [])],
        current: Spicetify.Queue.track ? { ...Spicetify.Queue.track } : null,
      });
    }

    // Create callback and store ref for proper cleanup
    const callback = () => {
      if (!Spicetify?.Queue) return;
      const q = JSON.parse(safeStringify(Spicetify.Queue));
      setQueue((state) => ({
        current: q.track ? { ...q.track } : null,
        next: [...(q.nextTracks || [])],
        prev: state.current ? [state.current] : [],
      }));
    };
    callbackRef.current = callback;

    Spicetify?.Platform?.PlayerAPI?._events?.addListener('queue_update', callback);

    return () => {
      if (callbackRef.current) {
        Spicetify?.Platform?.PlayerAPI?._events?.removeListener(
          'queue_update',
          callbackRef.current
        );
      }
    };
  }, []);

  return { queue };
};

let sessionMembersRenderCount = 0;
export const useSessionMembers = ({
  joinSessionToken,
}: UseSessionMembersParams): User[] => {
  console.log('[useSessionMembers] hook called, render #', ++sessionMembersRenderCount);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!joinSessionToken) return;
    console.log('[useSessionMembers] effect running, fetching members...');

    const fetchMembers = () => {
      console.log('[useSessionMembers] polling members');
      getSessionMembers(joinSessionToken).then((data) => {
        if (data) setUsers(data);
      });
    };

    fetchMembers();
    const interval = setInterval(fetchMembers, 5000);
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
      Spicetify?.Config?.custom_apps?.includes('lyrics-plus') &&
      checkLyricsPlus()
    ) {
      if (doc.webkitIsFullScreen) {
        Spicetify?.Platform?.History?.push('/lyrics-plus');
      }
    }
    window.dispatchEvent(new Event('fad-request'));
  }, [Spicetify?.Player?.data?.track, doc.webkitIsFullScreen]);
};

let qrColorRenderCount = 0;
export const useQrColor = ({
  imgRef,
  src,
}: {
  imgRef: React.RefObject<HTMLImageElement>;
  src?: string | null;
}): UseQrColorResult => {
  console.log('[useQrColor] hook called, render #', ++qrColorRenderCount, 'src:', src?.slice(-20));
  const [qrColor, setQrColor] = useState<string>('');
  const [hexColor, setHexColor] = useState<string>('');

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!imgRef.current) return;
      fac
        .getColorAsync(imgRef.current)
        .then((color: Color) => {
          if (cancelled) return;
          setQrColor(color.rgba);
          setHexColor(color.hex);
        })
        .catch(() => {
          if (!cancelled) {
            console.warn('Error extracting color from image');
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [src, imgRef]);

  return [qrColor, hexColor];
};
