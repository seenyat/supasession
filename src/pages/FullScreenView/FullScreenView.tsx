import React from 'react';
import SupaSession from '../../components/SupaSession/SupaSession';
import './../../../dist/output.css';

const FullScreenView = () => {
  return (
    <div className="z-20 h-full bg-[#6c969d] inset-0 absolute">
      <div className="relative h-full view">
        <SupaSession fullScreen />
      </div>
    </div>
  );
};

export default FullScreenView;
