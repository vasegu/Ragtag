"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo with an "image generation" style load: an animated dither pattern while it loads, then
 * the picture resolves through growing dots while it sharpens from a blur.
 */
export function DitherImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    // Already in the browser cache: no load event will fire after hydration.
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className={`dither-wrap ${loaded ? "loaded" : ""} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={src} alt={alt} decoding="async" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} className={`dither-img h-full w-full object-cover ${loaded ? "loaded" : ""}`} />
    </div>
  );
}
