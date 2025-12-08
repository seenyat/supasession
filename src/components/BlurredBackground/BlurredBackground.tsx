import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useQueue } from '../../utils/hooks';

interface BlurredBackgroundProps {
  className?: string;
}

const BlurredBackground: React.FC<BlurredBackgroundProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { queue } = useQueue();
  const currentImageUrl = queue?.current?.contextTrack?.metadata?.image_xlarge_url;
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!currentImageUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsLoaded(false);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const size = Math.max(window.innerWidth, window.innerHeight) * 2;
      canvas.width = size;
      canvas.height = size;

      const scale = Math.max(size / img.width, size / img.height) * 1.2;
      const x = (size - img.width * scale) / 2;
      const y = (size - img.height * scale) / 2;

      ctx.filter = 'blur(60px) saturate(1.3)';
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      
      setIsLoaded(true);
    };

    img.src = currentImageUrl;
  }, [currentImageUrl]);

  return (
    <motion.div
      className={`absolute inset-0 overflow-hidden ${className || ''}`}
      style={{ zIndex: -1 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: isLoaded ? 1 : 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.canvas
        ref={canvasRef}
        className="absolute"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 180,
          ease: 'linear',
          repeat: Infinity,
        }}
      />
      <div className="absolute inset-0 bg-black/30" />
    </motion.div>
  );
};

export default BlurredBackground;
