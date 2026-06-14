"use client";

import { useState } from "react";
import {
  runSheet, idleSheet, FRAME_W, FRAME_H, RUN_FRAMES, RUN_BLOCK, IDLE_FRAME,
} from "@/lib/sprites";

type Dir = "south" | "north" | "east" | "west";

interface Props {
  base: string;
  dir: Dir;
  walking: boolean;
  frame: number;   // 0..RUN_FRAMES-1 while walking
  hue: number;     // outfit hue-rotate degrees
  width?: number;  // displayed sprite width in px (height = 2×)
}

/**
 * Renders one 16×32 frame from a LimeZu character sheet, scaled up with
 * pixelated rendering. Walking uses the run sheet (6-frame cycle per
 * direction); standing uses the idle sheet. Falls back to a simple blob if the
 * art isn't present (assets are gitignored / optional).
 */
export function CharacterSprite({ base, dir, walking, frame, hue, width = 24 }: Props) {
  const [broken, setBroken] = useState(false);
  const scale = width / FRAME_W;
  const h = FRAME_H * scale;

  if (broken) {
    return <div style={{ width, height: h, borderRadius: 4, background: `hsl(${(hue + 270) % 360} 45% 55%)`, boxShadow: "inset 0 -4px 6px rgba(0,0,0,.3)" }} />;
  }

  const sheet = walking ? runSheet(base) : idleSheet(base);
  const sheetCols = walking ? 24 : 4;
  const col = walking ? RUN_BLOCK[dir] * RUN_FRAMES + (frame % RUN_FRAMES) : IDLE_FRAME[dir];

  return (
    <>
      {/* preload to detect missing asset → fallback */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sheet} alt="" style={{ display: "none" }} onError={() => setBroken(true)} />
      <div
        style={{
          width, height: h,
          backgroundImage: `url("${sheet}")`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sheetCols * FRAME_W * scale}px ${FRAME_H * scale}px`,
          backgroundPosition: `${-col * FRAME_W * scale}px 0px`,
          imageRendering: "pixelated",
          filter: `hue-rotate(${hue}deg) saturate(1.15)`,
        }}
      />
    </>
  );
}
