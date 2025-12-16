import React, { useEffect, useMemo, useState } from 'react';
import { useQueue } from '../../utils/hooks';
import Player from '../Blocks/Player/Player';
import { useAnimationControls } from 'framer-motion';
import Queue from '../Blocks/Queue.tsx/Queue';
import Session from '../Blocks/Session/Session';
import { usePlayerStore } from '../../app';
import BlurredBackground from '../BlurredBackground/BlurredBackground';

let supaSessionRenderCount = 0;
const SupaSession = ({ fullScreen }: { fullScreen?: boolean }) => {
  console.log('[SupaSession] component render #', ++supaSessionRenderCount);
  const { queue } = useQueue();
  const audioData = usePlayerStore((state) => state.audioData);
  const transitionCurrentAnimation = useAnimationControls();
  const setTransitionAnimation = usePlayerStore(
    (state) => state.setTransitionAnimation
  );
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setTransitionAnimation(transitionCurrentAnimation);
    return () => setIsMounted(false);
  }, []);

  // Calculate animation duration based on track
  const animDuration = useMemo(
    () => Math.max(50, (audioData.duration || 10000) / 3),
    [audioData.duration]
  );

  return (
    <div className="w-full h-full p-4 overflow-hidden aspect-video">
      <BlurredBackground />

      <div className="grid pt-24 xl:pt-0 pb-64 xl:pb-8 justify-items-center xl:justify-items-start h-full w-full grid-cols-1 xl:grid-cols-[1fr_7fr_1fr] gap-2">
        <Session fullScreen={fullScreen} />
        <Player />
        <Queue />
      </div>
    </div>
  );
};

export default SupaSession;
