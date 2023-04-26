import React from 'react';
import { useQueue } from '../../utils/hooks';
import Player from '../Blocks/Player/Player';
import { motion } from 'framer-motion';
import Queue from '../Blocks/Queue.tsx/Queue';
import Session from '../Blocks/Session/Session';
import { usePlayerStore } from '../../app';

// export const useSpringyValue = (value: string) => {
//   // const [springyValue, setSpringyValue] = useSpring(0)
//   React.useEffect(() => {
//     setSpringyValue(value);
//   }, [value]);
//   return {
//     value: springyValue,
//     setValue: setSpringyValue,
//   };
// };

const SupaSession = ({ fullScreen }: { fullScreen?: boolean }) => {
  const { queue } = useQueue();
  const audioData = usePlayerStore((state) => state.audioData);
  const qrColor = usePlayerStore((state) => state.qrColor);
  // const { value, setValue } = useSpringyValue(qrColor);

  return (
    <div className="w-full h-full p-4 overflow-hidden aspect-video">
      <div className="absolute inset-0 -z-10">
        <div
          style={{
            backgroundColor: `${qrColor} / 0.1`,
            backdropFilter: 'blur(100px) brightness(0.83) hue-rotate(330deg)',
          }}
          className="absolute inset-0 -z-20"
        ></div>
        <div className="relative w-full h-full overflow-hidden">
          {audioData.duration && (
            <motion.img
              className="absolute w-full h-full -z-30"
              style={{
                rotate: '130deg',
              }}
              exit={{
                opacity: 0,
              }}
              animate={{
                transform: [
                  'scale(2.1) rotate(0deg)',
                  'scale(2.2) rotate(180deg)',
                ],
                opacity: [0.9, 1],
              }}
              transition={{
                type: 'tween',
                duration: Math.max(50, +audioData.duration / 3),
                repeatType: 'mirror',
                repeat: Infinity,
              }}
              src={queue.current?.contextTrack?.metadata.image_xlarge_url}
            />
          )}
        </div>
      </div>

      <div className="grid pt-24 xl:pt-0 pb-64 xl:pb-8 justify-items-center xl:justify-items-start h-full w-full grid-cols-1 xl:grid-cols-[1fr_7fr_1fr] gap-2">
        <Session fullScreen={fullScreen} />
        <Player />
        <Queue />
      </div>
    </div>
  );
};

export default SupaSession;
