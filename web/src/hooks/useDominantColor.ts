import { useEffect } from "react";
import { FastAverageColor } from "fast-average-color";
import { usePlayerStore } from "../stores/playerStore";

const fac = new FastAverageColor();

export const useDominantColor = () => {
  const currentTrack = usePlayerStore((s) => s.playerState.currentTrack);
  const colors = usePlayerStore((s) => s.playerState.colors);
  const setDominantColor = usePlayerStore((s) => s.setDominantColor);
  
  // Prefer base64 data (no CORS issues), fallback to URL
  const imageSource = currentTrack?.albumArtData || currentTrack?.albumArtUrl;
  
  // Prefer Spicetify's extracted colors (vibrant > prominent > fallback to image extraction)
  const spicetifyColor = colors?.vibrant || colors?.prominent || colors?.lightVibrant;

  useEffect(() => {
    // If Spicetify provided colors, use them directly
    if (spicetifyColor) {
      setDominantColor(spicetifyColor);
      return;
    }
    
    // Fallback to FastAverageColor extraction
    if (!imageSource) return;

    let cancelled = false;

    fac
      .getColorAsync(imageSource, { algorithm: "dominant" })
      .then((color) => {
        if (!cancelled) {
          setDominantColor(color.hex);
        }
      })
      .catch((e) => {
        console.warn("[useDominantColor] Failed to extract color:", e);
        if (!cancelled) {
          setDominantColor("#1a1a2e");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageSource, spicetifyColor, setDominantColor]);
};
