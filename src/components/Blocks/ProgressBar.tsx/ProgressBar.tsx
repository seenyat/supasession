import { motion } from 'framer-motion';
import React, { useState, useEffect } from 'react';

export const ProgressBar = ({
  duration,
  contrastColor,
}: {
  duration: number;
  contrastColor: string;
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (progress < 100) {
      const timer = setTimeout(() => {
        const newProgress = progress + 100 / duration;
        setProgress(newProgress);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [progress, duration]);

  return (
    <motion.div
      style={{
        width: '100%',
        margin: '0 auto',
        position: 'absolute',
        zIndex: 100,
        backgroundColor: 'tranparent',
      }}
      animate={{
        opacity: 0.5,
        top: 90,
      }}
      initial={{
        opacity: 0,
        top: -300,
      }}
      transition={{
        type: 'spring',
        duration: 0.2,
        bounce: 0.3,
        damping: 12,

        stiffness: 50,
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          borderRadius: 12,
          width: 'calc(40% - 16px)',
          margin: '0 auto',
        }}
      >
        <motion.div
          style={{
            height: 4,
            opacity: 0.75,
            backgroundColor: contrastColor,
          }}
          animate={{
            width: `${100 - progress}%`,
          }}
          transition={{
            type: 'spring',
            duration: 0.2,
            bounce: 0.3,
            damping: 12,

            stiffness: 30,
          }}
          initial={{
            width: '100%',
          }}
        ></motion.div>
      </div>
    </motion.div>
  );
};
