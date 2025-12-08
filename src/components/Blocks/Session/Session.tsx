import React from 'react';
import { useSessionMembers } from '../../../utils/hooks';
import { usePlayerStore } from '../../../app';
import { getContrastColor } from '../../../utils/functions';
import { motion } from 'framer-motion';
import { RGBA } from '@skinnypete/color';
import { PlusIcon, Loader2 } from 'lucide-react';
import { ProgressBar } from '../ProgressBar.tsx/ProgressBar';

const QR_DISPLAY_TIMEOUT_MS = 30000;

const Session = ({ fullScreen }: { fullScreen?: boolean }) => {
  const qrColor = usePlayerStore((state) => state.qrColor);
  const joinSessionToken = usePlayerStore((state) => state.joinSessionToken);
  const users = useSessionMembers({ joinSessionToken });
  const [isQrToggled, setIsQrToggled] = React.useState(false);

  // Ensure qrColor is a valid hex color
  const safeQrColor = qrColor?.startsWith('#') ? qrColor : '#000000';
  const qrColorHex = safeQrColor.slice(1);
  const contrastColor = getContrastColor(RGBA.fromHex(safeQrColor).toString());

  // Don't render QR code until we have a session token
  const hasSession = joinSessionToken && qrColorHex.length === 6;

  return (
    <div
      style={{ color: contrastColor }}
      className="px-2 w-full pb-12"
    >
      <div className="flex flex-col items-center justify-start h-full gap-1 px-2 xl:justify-end">
        <div className="">
          <div className="absolute inset-0 w-full h-full">
            <div>
              {hasSession && (
                <motion.img
                  src={`https://scannables.scdn.co/uri/plain/png/${qrColorHex}/${contrastColor}/1200/spotify%3Asocialsession%3A${joinSessionToken}`}
                  alt=""
                  transition={{
                    type: 'spring',
                    duration: 0.2,
                    bounce: 0.3,
                    damping: 12,
                    stiffness: 50,
                  }}
                  animate={{ top: isQrToggled ? '80px' : '-300px' }}
                  initial={{ top: '-300px' }}
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
              )}
            </div>
            {isQrToggled && (
              <ProgressBar contrastColor={contrastColor} duration={30} />
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
                }, QR_DISPLAY_TIMEOUT_MS);
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
