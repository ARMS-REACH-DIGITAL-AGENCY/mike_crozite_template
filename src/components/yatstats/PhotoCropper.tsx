'use client';

// Placement tool for a contributed photo: the photo behind a frame with the
// exact shape it will have on the site (5x7 for card fronts, headshots and
// timeline images; 4x5 for card backs). Drag to position it, slide to zoom.
// Reports the crop as fractions of the photo, which the server cuts out.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Crop } from '@/lib/contribute';

type Props = { src: string; aspect: number; onChange: (crop: Crop) => void };

export default function PhotoCropper({ src, aspect, onChange }: Props) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  // The latest callback, so a new function from the parent doesn't re-run
  // the effect below.
  const report = useRef(onChange);
  useEffect(() => { report.current = onChange; }, [onChange]);

  // Frame size follows the drawer width.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = natural && box.w ? Math.max(box.w / natural.w, box.h / natural.h) * zoom : 0;
  const dw = natural ? natural.w * scale : 0;
  const dh = natural ? natural.h * scale : 0;

  // Keep the photo covering the whole frame.
  const clamp = useCallback(
    (x: number, y: number) => ({ x: Math.min(0, Math.max(box.w - dw, x)), y: Math.min(0, Math.max(box.h - dh, y)) }),
    [box.w, box.h, dw, dh]
  );
  const pos = offset ? clamp(offset.x, offset.y) : { x: (box.w - dw) / 2, y: (box.h - dh) / 2 };

  useEffect(() => {
    if (!natural || !scale) return;
    report.current({
      x: Math.max(0, -pos.x / scale / natural.w),
      y: Math.max(0, -pos.y / scale / natural.h),
      w: Math.min(1, box.w / scale / natural.w),
      h: Math.min(1, box.h / scale / natural.h),
    });
  }, [natural, scale, pos.x, pos.y, box.w, box.h]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py));
  };
  const onPointerUp = () => { drag.current = null; };

  // Zoom around the middle of the frame.
  const setZoomCentered = (z: number) => {
    if (!natural || !scale) return setZoom(z);
    const cx = (box.w / 2 - pos.x) / scale;
    const cy = (box.h / 2 - pos.y) / scale;
    const next = (scale / zoom) * z;
    setZoom(z);
    setOffset({ x: box.w / 2 - cx * next, y: box.h / 2 - cy * next });
  };

  return (
    <div className="ypc">
      <div
        ref={frame}
        className="ypc-frame"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ width: dw || undefined, height: dh || undefined, transform: `translate(${pos.x}px, ${pos.y}px)`, visibility: scale ? 'visible' : 'hidden' }}
        />
        <div className="ypc-grid" aria-hidden="true" />
      </div>
      <label className="ypc-zoom">
        <i className="ri-zoom-out-line" aria-hidden="true" />
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomCentered(Number(e.target.value))} aria-label="Zoom" />
        <i className="ri-zoom-in-line" aria-hidden="true" />
      </label>
      <div className="ypc-hint">Drag the photo to position it. The frame is exactly what will show on the site.</div>
      <style jsx global>{`
        .ypc { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 280px; }
        .ypc-frame { position: relative; width: 100%; overflow: hidden; border-radius: 6px; background: #111; cursor: grab; touch-action: none; outline: 2px solid #FFD700; outline-offset: -2px; user-select: none; }
        .ypc-frame:active { cursor: grabbing; }
        .ypc-frame img { position: absolute; left: 0; top: 0; max-width: none; pointer-events: none; }
        .ypc-grid { position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px);
          background-size: 33.333% 33.333%; background-position: -1px -1px; }
        .ypc-zoom { display: flex; align-items: center; gap: 6px; }
        .ypc-zoom input { flex: 1; accent-color: #FFD700; }
        .ypc-hint { font-size: 11px; opacity: .6; line-height: 1.35; }
      `}</style>
    </div>
  );
}
