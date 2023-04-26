import React, { useEffect } from 'react';
import { useSessionMembers } from '../../../utils/hooks';
import { usePlayerStore } from '../../../app';
import { getContrastColor } from '../../../utils/functions';
import { motion } from 'framer-motion';
import { RGBA } from '@skinnypete/color';
import { LoaderIcon, PlusIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { ProgressBar } from '../ProgressBar.tsx/ProgressBar';

const Session = ({ fullScreen }: { fullScreen?: boolean }) => {
  const qrColor = usePlayerStore((state) => state.qrColor);
  const joinSessionToken = usePlayerStore((state) => state.joinSessionToken);
  const users = useSessionMembers({ joinSessionToken });
  const [isQrToggled, setIsQrToggled] = React.useState(false);
  useEffect(() => {
    // console.log(users, joinSessionToken);
  }, [users]);
  return (
    <div
      style={{
        color: getContrastColor(RGBA.fromHex(qrColor).toString()),
      }}
      className="border px-2  w-full pb-12 border-[#4d6a6d]"
    >
      <div className="flex flex-col items-center justify-start h-full gap-1 px-2 xl:justify-end">
        <div className="">
          <div className="absolute inset-0 w-full h-full ">
            <div>
              <motion.img
                src={`https://scannables.scdn.co/uri/plain/png/${qrColor.slice(
                  1
                )}/${getContrastColor(
                  RGBA.fromHex(qrColor).toString()
                )}/${1200}/spotify%3Asocialsession%3A${joinSessionToken}`}
                alt=""
                transition={{
                  type: 'spring',
                  duration: 0.2,
                  bounce: 0.3,
                  damping: 12,

                  stiffness: 50,
                }}
                animate={{
                  top: isQrToggled ? '80px' : '-300px',
                }}
                initial={{
                  top: '-300px',
                }}
                style={{
                  boxShadow: '0px 0px 20px 0px rgba(0,0,0,0.75)',
                  borderRadius: '8px',
                  width: '40%',
                  margin: '0 auto',
                  position: 'relative',
                  zIndex: 100,
                  cursor: 'zoom-out',
                }}
                onClick={() => setIsQrToggled(false)}
              />
            </div>
            {isQrToggled && (
              <ProgressBar
                contrastColor={getContrastColor(
                  RGBA.fromHex(qrColor).toString()
                )}
                duration={30}
              />
            )}
          </div>
          {!isQrToggled ? (
            <motion.div
              animate={{ opacity: 0.1 }}
              initial={{ opacity: 0 }}
              transition={{
                type: 'spring',
                duration: 0.2,
                bounce: 0.3,
                damping: 12,

                stiffness: 50,
              }}
              onClick={() => {
                setIsQrToggled(true);
                setTimeout(() => {
                  setIsQrToggled(false);
                }, 30000);
              }}
              style={{
                cursor: 'pointer',
              }}
              whileHover={{ opacity: 1 }}
            >
              <PlusIcon />
            </motion.div>
          ) : (
            <div>
              <Loader2 className="animate-spin opacity-[0.05]" />
            </div>
          )}
        </div>
        {users?.map((el) => {
          return (
            <div key={el.user_id} className="font-light opacity-30 ">
              {el.display_name}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Session;
