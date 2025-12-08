import { useEffect, useState } from "react";

/**
 * Preload an image and report when decode/bitmap upload is finished.
 * Returns a boolean ready flag; tolerant to CORS by falling back to onload.
 */
export function useArtworkPreload(src?: string | null): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!src) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const img: HTMLImageElement = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;

    const finalize = () => {
      if (!cancelled) setReady(true);
    };

    if (img.complete) {
      finalize();
    }
    img.onload = finalize;
    img.onerror = finalize;
    if ("decode" in img) {
      // decode is best-effort; onload/onerror still handle fallback
      img.decode().then(finalize).catch(finalize);
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  return ready;
}
