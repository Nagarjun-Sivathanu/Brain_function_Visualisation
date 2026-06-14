"use client";

import { useEffect, useState } from "react";
import { PIXEL_SCALE } from "@/lib/sprites";

// LimeZu interiors atlas (free): 256×1424, 16×16 tiles (16 cols × 89 rows).
export const INTERIOR_SHEET = "/office/Modern%20tiles_Free/Interiors_free/16x16/Interiors_free_16x16.png";
const ATLAS_W = 256;
const ATLAS_H = 1424;

/** Loads the interiors atlas once; tells callers whether to use tiles or the
 *  procedural fallback (assets are optional / gitignored). */
export function useAtlasReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setReady(true);
    img.onerror = () => setReady(false);
    img.src = INTERIOR_SHEET;
  }, []);
  return ready;
}

/** A furniture piece cropped from the atlas (col,row in tiles; w,h in tiles),
 *  rendered at the shared PIXEL_SCALE so it matches the character sprites.
 *  Positioned (centered) at room-local lx/ly %. */
export function Tile({
  col, row, w, h, lx, ly, z = 5, mul = 1, interactive, selected, onPointerDown,
}: {
  col: number; row: number; w: number; h: number; lx: number; ly: number; z?: number; mul?: number;
  interactive?: boolean; selected?: boolean; onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const s = PIXEL_SCALE * mul;
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute"
      style={{
        left: `${lx}%`, top: `${ly}%`,
        width: w * 16 * s, height: h * 16 * s,
        transform: "translate(-50%,-50%)",
        backgroundImage: `url("${INTERIOR_SHEET}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${ATLAS_W * s}px ${ATLAS_H * s}px`,
        backgroundPosition: `${-col * 16 * s}px ${-row * 16 * s}px`,
        imageRendering: "pixelated",
        zIndex: selected ? 19 : z,
        filter: "drop-shadow(0 3px 2px rgba(8,12,22,0.4))",
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "move" : undefined,
        outline: selected ? "2px dashed #fbbf24" : undefined,
        outlineOffset: 2,
      }}
    />
  );
}
