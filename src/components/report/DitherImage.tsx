"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo with an "image generation" style load: an animated dither pattern while it loads, then
 * the picture resolves through growing dots while it sharpens from a blur.
 */
export function DitherImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  // Track which src has loaded (not a boolean that gets reset), so a load event that fires
  // before effects run is never lost.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Already decoded (from the cache or before hydration).
    if (img.current && img.current.naturalWidth > 0) setLoadedSrc(src);
    // Never leave a photo hidden if the load event goes missing.
    const t = setTimeout(() => setLoadedSrc(src), 2500);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <div className={`dither-wrap ${loaded ? "loaded" : ""} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt={alt}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setLoadedSrc(src)}
        className={`dither-img h-full w-full object-cover ${loaded ? "loaded" : ""}`}
      />
    </div>
  );
}
