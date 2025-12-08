import { useState, useEffect } from 'react';

export const useSpicetifyReady = (): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      while (
        !Spicetify?.Player?.data ||
        !Spicetify?.Queue ||
        !Spicetify?.Platform?.PlayerAPI ||
        !Spicetify?.CosmosAsync
      ) {
        await new Promise((r) => setTimeout(r, 100));
      }
      setReady(true);
    };
    check();
  }, []);

  return ready;
};
