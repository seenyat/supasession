import React from 'react';
import SupaSession from '../../components/SupaSession/SupaSession';
import { usePlayerStore } from '../../app';
import './../../../dist/output.css';

const FullScreenView = () => {
  const qrColor = usePlayerStore((state) => state.qrColor);

  return (
    <div 
      className="z-20 h-full inset-0 absolute"
      style={{ backgroundColor: qrColor || '#000' }}
    >
      <div className="relative h-full view">
        <SupaSession fullScreen />
      </div>
    </div>
  );
};

export default FullScreenView;
