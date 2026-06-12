"use client";

// Inline SVG pixel-art furniture sprites. Each component renders into a positioned
// container and is drawn on a small pixel grid (typically 16-32 units wide) using
// shape-rendering="crispEdges" for that authentic pixel look.

import type { SVGProps } from "react";

interface PxProps {
  /** Pixel width in screen px (height auto from viewBox) */
  width: number;
}

const px = { shapeRendering: "crispEdges" as const, style: { display: "block" } };

// ── Desk with monitor + keyboard (front-view, top-down-ish) ──
export function PxDesk({ width = 80, color = "#8b5a2b" }: PxProps & { color?: string }) {
  const dark = shade(color, -30);
  const darker = shade(color, -50);
  return (
    <svg width={width} viewBox="0 0 32 22" {...px}>
      {/* desk top */}
      <rect x="1" y="8" width="30" height="9" fill={color} />
      <rect x="1" y="8" width="30" height="1" fill={shade(color, 25)} />
      <rect x="1" y="16" width="30" height="1" fill={darker} />
      {/* desk legs */}
      <rect x="2" y="17" width="3" height="4" fill={dark} />
      <rect x="27" y="17" width="3" height="4" fill={dark} />
      {/* monitor */}
      <rect x="11" y="0" width="10" height="7" fill="#1a1a1a" />
      <rect x="12" y="1" width="8" height="5" fill="#3b6ea5" />
      <rect x="13" y="2" width="2" height="1" fill="#7ec0ee" />
      <rect x="16" y="3" width="3" height="1" fill="#7ec0ee" />
      {/* monitor stand */}
      <rect x="15" y="7" width="2" height="1" fill="#1a1a1a" />
      {/* keyboard */}
      <rect x="10" y="11" width="12" height="2" fill="#2d2d2d" />
      {/* mouse */}
      <rect x="23" y="11" width="2" height="2" fill="#2d2d2d" />
    </svg>
  );
}

// ── Office chair ──
export function PxChair({ width = 24, color = "#3d2410" }: PxProps & { color?: string }) {
  const dark = shade(color, -30);
  return (
    <svg width={width} viewBox="0 0 12 16" {...px}>
      {/* backrest */}
      <rect x="2" y="0" width="8" height="5" fill={color} />
      <rect x="2" y="0" width="8" height="1" fill={shade(color, 30)} />
      {/* seat */}
      <rect x="1" y="5" width="10" height="4" fill={color} />
      <rect x="1" y="8" width="10" height="1" fill={dark} />
      {/* stem */}
      <rect x="5" y="9" width="2" height="4" fill="#444" />
      {/* base */}
      <rect x="2" y="13" width="8" height="1" fill="#222" />
      <rect x="3" y="14" width="2" height="2" fill="#222" />
      <rect x="7" y="14" width="2" height="2" fill="#222" />
    </svg>
  );
}

// ── Round meeting table (top-down) ──
export function PxRoundTable({ width = 160 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 64 48" {...px}>
      {/* outer rim */}
      <ellipse cx="32" cy="24" rx="30" ry="22" fill="#3d2410" />
      {/* table top */}
      <ellipse cx="32" cy="22" rx="28" ry="20" fill="#8b5a2b" />
      {/* highlight */}
      <ellipse cx="24" cy="14" rx="14" ry="6" fill="#a3712f" opacity="0.6" />
      {/* shadow on lower half */}
      <path d="M 4 22 A 28 20 0 0 0 60 22 L 60 24 A 28 20 0 0 1 4 24 Z" fill="#5d3a1a" opacity="0.5" />
      {/* items on table */}
      <rect x="20" y="20" width="6" height="4" fill="#f5f5dc" /> {/* paper */}
      <rect x="20" y="20" width="6" height="1" fill="#cbcbb0" />
      <rect x="36" y="18" width="4" height="4" fill="#4b3621" /> {/* coffee mug */}
      <rect x="37" y="17" width="2" height="1" fill="#8b5a2b" />
      <rect x="28" y="26" width="8" height="2" fill="#2563eb" /> {/* laptop */}
    </svg>
  );
}

// ── Couch (long, top-down) ──
export function PxCouch({ width = 180 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 60 24" {...px}>
      {/* back cushion */}
      <rect x="0" y="0" width="60" height="9" fill="#8b3a4a" />
      <rect x="0" y="0" width="60" height="1" fill="#a85666" />
      <rect x="0" y="8" width="60" height="1" fill="#6e2c3a" />
      {/* armrests */}
      <rect x="0" y="0" width="4" height="22" fill="#7a2f3e" />
      <rect x="56" y="0" width="4" height="22" fill="#7a2f3e" />
      <rect x="0" y="0" width="4" height="1" fill="#a85666" />
      <rect x="56" y="0" width="4" height="1" fill="#a85666" />
      {/* seat cushions */}
      <rect x="4" y="9" width="17" height="11" fill="#a35062" />
      <rect x="22" y="9" width="16" height="11" fill="#a35062" />
      <rect x="39" y="9" width="17" height="11" fill="#a35062" />
      <rect x="4" y="9" width="17" height="1" fill="#b86d7e" />
      <rect x="22" y="9" width="16" height="1" fill="#b86d7e" />
      <rect x="39" y="9" width="17" height="1" fill="#b86d7e" />
      {/* cushion seams */}
      <rect x="21" y="9" width="1" height="11" fill="#6e2c3a" />
      <rect x="38" y="9" width="1" height="11" fill="#6e2c3a" />
      {/* floor shadow / base */}
      <rect x="2" y="20" width="56" height="2" fill="#6e2c3a" />
      <rect x="2" y="22" width="56" height="2" fill="#3d1a23" />
    </svg>
  );
}

// ── Plant in pot ──
export function PxPlant({ width = 22 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 14 18" {...px}>
      {/* leaves */}
      <rect x="6" y="0" width="2" height="3" fill="#2d5a2d" />
      <rect x="4" y="2" width="2" height="4" fill="#3d7a3d" />
      <rect x="8" y="2" width="2" height="4" fill="#3d7a3d" />
      <rect x="2" y="3" width="2" height="5" fill="#2d5a2d" />
      <rect x="10" y="3" width="2" height="5" fill="#2d5a2d" />
      <rect x="5" y="3" width="4" height="6" fill="#4a8b4a" />
      <rect x="3" y="5" width="2" height="3" fill="#4a8b4a" />
      <rect x="9" y="5" width="2" height="3" fill="#4a8b4a" />
      {/* leaf highlights */}
      <rect x="6" y="4" width="1" height="2" fill="#6cb56c" />
      {/* pot */}
      <rect x="3" y="10" width="8" height="6" fill="#a0522d" />
      <rect x="3" y="10" width="8" height="1" fill="#c87b50" />
      <rect x="3" y="15" width="8" height="1" fill="#6b3818" />
      <rect x="4" y="16" width="6" height="2" fill="#6b3818" />
    </svg>
  );
}

// ── Small plant ──
export function PxSmallPlant({ width = 16 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 10 12" {...px}>
      <rect x="4" y="0" width="2" height="2" fill="#3d7a3d" />
      <rect x="2" y="1" width="2" height="3" fill="#4a8b4a" />
      <rect x="6" y="1" width="2" height="3" fill="#4a8b4a" />
      <rect x="3" y="3" width="4" height="3" fill="#5db05d" />
      <rect x="2" y="6" width="6" height="3" fill="#8b4513" />
      <rect x="3" y="9" width="4" height="2" fill="#6b3408" />
    </svg>
  );
}

// ── Fridge ──
export function PxFridge({ width = 56 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 20 36" {...px}>
      {/* body */}
      <rect x="0" y="0" width="20" height="36" fill="#e2e8f0" />
      <rect x="0" y="0" width="20" height="1" fill="#f8fafc" />
      <rect x="0" y="35" width="20" height="1" fill="#94a3b8" />
      <rect x="0" y="0" width="1" height="36" fill="#f8fafc" />
      <rect x="19" y="0" width="1" height="36" fill="#94a3b8" />
      {/* door divider */}
      <rect x="0" y="14" width="20" height="1" fill="#94a3b8" />
      {/* upper handle */}
      <rect x="15" y="4" width="1" height="8" fill="#475569" />
      {/* lower handle */}
      <rect x="15" y="18" width="1" height="14" fill="#475569" />
      {/* magnets */}
      <rect x="3" y="3" width="2" height="2" fill="#ef4444" />
      <rect x="6" y="3" width="2" height="2" fill="#facc15" />
      <rect x="3" y="6" width="2" height="2" fill="#10b981" />
    </svg>
  );
}

// ── Vending machine ──
export function PxVending({ width = 56 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 20 36" {...px}>
      <rect x="0" y="0" width="20" height="36" fill="#1e3a8a" />
      <rect x="0" y="0" width="20" height="1" fill="#3b82f6" />
      <rect x="0" y="35" width="20" height="1" fill="#172554" />
      {/* glass front */}
      <rect x="2" y="3" width="16" height="22" fill="#1e293b" />
      <rect x="2" y="3" width="16" height="1" fill="#475569" />
      {/* snacks */}
      <rect x="3" y="5" width="3" height="3" fill="#ef4444" />
      <rect x="7" y="5" width="3" height="3" fill="#facc15" />
      <rect x="11" y="5" width="3" height="3" fill="#10b981" />
      <rect x="15" y="5" width="2" height="3" fill="#ec4899" />
      <rect x="3" y="9" width="3" height="3" fill="#facc15" />
      <rect x="7" y="9" width="3" height="3" fill="#a855f7" />
      <rect x="11" y="9" width="3" height="3" fill="#ef4444" />
      <rect x="15" y="9" width="2" height="3" fill="#10b981" />
      <rect x="3" y="13" width="3" height="3" fill="#10b981" />
      <rect x="7" y="13" width="3" height="3" fill="#facc15" />
      <rect x="11" y="13" width="3" height="3" fill="#3b82f6" />
      <rect x="15" y="13" width="2" height="3" fill="#facc15" />
      <rect x="3" y="17" width="3" height="3" fill="#ec4899" />
      <rect x="7" y="17" width="3" height="3" fill="#10b981" />
      <rect x="11" y="17" width="3" height="3" fill="#facc15" />
      <rect x="15" y="17" width="2" height="3" fill="#ef4444" />
      {/* number pad */}
      <rect x="14" y="26" width="4" height="5" fill="#0f172a" />
      <rect x="14" y="26" width="2" height="1" fill="#facc15" />
      {/* coin slot */}
      <rect x="3" y="27" width="6" height="1" fill="#0f172a" />
      {/* dispense */}
      <rect x="3" y="30" width="14" height="3" fill="#0f172a" />
    </svg>
  );
}

// ── Bookshelf ──
export function PxBookshelf({ width = 36 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 12 28" {...px}>
      <rect x="0" y="0" width="12" height="28" fill="#5d3a1a" />
      <rect x="0" y="0" width="12" height="1" fill="#8b5a2b" />
      <rect x="0" y="27" width="12" height="1" fill="#3d2410" />
      {/* shelves */}
      <rect x="1" y="8" width="10" height="1" fill="#3d2410" />
      <rect x="1" y="17" width="10" height="1" fill="#3d2410" />
      {/* books row 1 */}
      <rect x="1" y="2" width="2" height="6" fill="#ef4444" />
      <rect x="3" y="2" width="1" height="6" fill="#facc15" />
      <rect x="4" y="3" width="2" height="5" fill="#10b981" />
      <rect x="6" y="2" width="1" height="6" fill="#3b82f6" />
      <rect x="7" y="2" width="2" height="6" fill="#a855f7" />
      <rect x="9" y="3" width="2" height="5" fill="#ec4899" />
      {/* books row 2 */}
      <rect x="1" y="10" width="1" height="7" fill="#facc15" />
      <rect x="2" y="11" width="2" height="6" fill="#ef4444" />
      <rect x="4" y="10" width="1" height="7" fill="#10b981" />
      <rect x="5" y="11" width="2" height="6" fill="#3b82f6" />
      <rect x="7" y="10" width="2" height="7" fill="#a855f7" />
      <rect x="9" y="11" width="2" height="6" fill="#facc15" />
      {/* books row 3 */}
      <rect x="1" y="19" width="3" height="8" fill="#5d3a1a" />
      <rect x="4" y="19" width="2" height="8" fill="#3b82f6" />
      <rect x="6" y="20" width="2" height="7" fill="#ef4444" />
      <rect x="8" y="19" width="3" height="8" fill="#10b981" />
    </svg>
  );
}

// ── Coffee machine ──
export function PxCoffeeMachine({ width = 28 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 14 18" {...px}>
      <rect x="0" y="0" width="14" height="18" fill="#1f2937" />
      <rect x="0" y="0" width="14" height="1" fill="#374151" />
      <rect x="2" y="2" width="10" height="4" fill="#0f172a" />
      <rect x="3" y="3" width="2" height="2" fill="#facc15" />
      <rect x="9" y="3" width="2" height="2" fill="#10b981" />
      {/* nozzle */}
      <rect x="6" y="6" width="2" height="2" fill="#9ca3af" />
      {/* cup */}
      <rect x="4" y="10" width="6" height="6" fill="#f5f5dc" />
      <rect x="4" y="10" width="6" height="1" fill="#cbcbb0" />
      <rect x="5" y="11" width="4" height="3" fill="#4b3621" />
      <rect x="10" y="11" width="1" height="3" fill="#cbcbb0" />
      {/* base */}
      <rect x="2" y="16" width="10" height="2" fill="#111827" />
    </svg>
  );
}

// ── TV ──
export function PxTV({ width = 60 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 32 22" {...px}>
      <rect x="0" y="0" width="32" height="18" fill="#1f2937" />
      <rect x="0" y="0" width="32" height="1" fill="#374151" />
      <rect x="2" y="2" width="28" height="14" fill="#0f172a" />
      {/* "show" on screen */}
      <rect x="4" y="4" width="24" height="6" fill="#1e40af" />
      <rect x="12" y="6" width="8" height="2" fill="#facc15" />
      <rect x="4" y="10" width="24" height="4" fill="#0c4a6e" />
      {/* stand */}
      <rect x="14" y="18" width="4" height="2" fill="#1f2937" />
      <rect x="10" y="20" width="12" height="2" fill="#111827" />
    </svg>
  );
}

// ── Window with sunlight ──
export function PxWindow({ width = 48 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 24 18" {...px}>
      {/* frame */}
      <rect x="0" y="0" width="24" height="18" fill="#5d3a1a" />
      <rect x="2" y="2" width="20" height="14" fill="#7ec0ee" />
      {/* sky gradient look via two rects */}
      <rect x="2" y="2" width="20" height="6" fill="#a5d8f5" />
      {/* sun */}
      <rect x="16" y="3" width="3" height="3" fill="#fef3c7" />
      <rect x="15" y="4" width="1" height="1" fill="#fef3c7" />
      <rect x="19" y="4" width="1" height="1" fill="#fef3c7" />
      {/* clouds */}
      <rect x="4" y="5" width="3" height="1" fill="#ffffff" />
      <rect x="3" y="6" width="5" height="1" fill="#ffffff" />
      {/* cross bars */}
      <rect x="11" y="2" width="2" height="14" fill="#5d3a1a" />
      <rect x="2" y="8" width="20" height="2" fill="#5d3a1a" />
    </svg>
  );
}

// ── Painting on wall ──
export function PxPainting({ width = 38 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 20 14" {...px}>
      <rect x="0" y="0" width="20" height="14" fill="#facc15" />
      <rect x="1" y="1" width="18" height="12" fill="#5d3a1a" />
      <rect x="2" y="2" width="16" height="10" fill="#1e3a8a" />
      {/* "art" — abstract shapes */}
      <rect x="4" y="4" width="4" height="3" fill="#ef4444" />
      <rect x="10" y="6" width="6" height="4" fill="#10b981" />
      <rect x="4" y="9" width="3" height="2" fill="#facc15" />
    </svg>
  );
}

// ── Reception desk (front-view) ──
export function PxReceptionDesk({ width = 140 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 64 22" {...px}>
      {/* base */}
      <rect x="0" y="6" width="64" height="14" fill="#6b4226" />
      <rect x="0" y="6" width="64" height="1" fill="#8b5a2b" />
      <rect x="0" y="19" width="64" height="1" fill="#3d2410" />
      {/* counter top */}
      <rect x="0" y="4" width="64" height="3" fill="#a3712f" />
      <rect x="0" y="4" width="64" height="1" fill="#c89058" />
      {/* sign */}
      <rect x="24" y="0" width="16" height="4" fill="#f5f5dc" />
      <rect x="25" y="1" width="14" height="2" fill="#5d3a1a" />
      {/* computer on desk */}
      <rect x="4" y="0" width="8" height="6" fill="#1a1a1a" />
      <rect x="5" y="1" width="6" height="4" fill="#3b6ea5" />
      {/* small plant */}
      <rect x="52" y="2" width="2" height="3" fill="#3d7a3d" />
      <rect x="51" y="3" width="4" height="2" fill="#4a8b4a" />
      <rect x="52" y="5" width="2" height="1" fill="#a0522d" />
      {/* base shadow */}
      <rect x="0" y="20" width="64" height="2" fill="#3d2410" opacity="0.5" />
    </svg>
  );
}

// ── Coffee table ──
export function PxCoffeeTable({ width = 100 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 40 16" {...px}>
      <rect x="0" y="0" width="40" height="10" fill="#8b5a2b" />
      <rect x="0" y="0" width="40" height="1" fill="#a3712f" />
      <rect x="0" y="9" width="40" height="1" fill="#5d3a1a" />
      <rect x="2" y="10" width="3" height="5" fill="#5d3a1a" />
      <rect x="35" y="10" width="3" height="5" fill="#5d3a1a" />
      {/* items on table */}
      <rect x="10" y="2" width="5" height="5" fill="#4b3621" /> {/* mug */}
      <rect x="11" y="1" width="3" height="1" fill="#8b5a2b" />
      <rect x="22" y="3" width="4" height="3" fill="#f5f5dc" /> {/* donut */}
      <rect x="23" y="4" width="2" height="1" fill="#a0522d" />
      <rect x="29" y="2" width="6" height="4" fill="#1e3a8a" /> {/* book */}
      <rect x="29" y="2" width="6" height="1" fill="#3b82f6" />
    </svg>
  );
}

// ── Whiteboard on wall ──
export function PxWhiteboard({ width = 120 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 60 14" {...px}>
      <rect x="0" y="0" width="60" height="14" fill="#5d3a1a" />
      <rect x="1" y="1" width="58" height="12" fill="#f5f5dc" />
      <rect x="1" y="1" width="58" height="1" fill="#ffffff" />
      {/* scribbles */}
      <rect x="4" y="3" width="3" height="1" fill="#000" />
      <rect x="8" y="3" width="5" height="1" fill="#000" />
      <rect x="14" y="3" width="2" height="1" fill="#000" />
      <rect x="4" y="5" width="8" height="1" fill="#ef4444" />
      <rect x="14" y="5" width="6" height="1" fill="#ef4444" />
      <rect x="4" y="7" width="10" height="1" fill="#000" />
      <rect x="20" y="7" width="6" height="1" fill="#10b981" />
      <rect x="4" y="9" width="14" height="1" fill="#000" />
      {/* tray */}
      <rect x="22" y="11" width="6" height="1" fill="#5d3a1a" />
      <rect x="23" y="11" width="2" height="1" fill="#ef4444" />
      <rect x="25" y="11" width="2" height="1" fill="#3b82f6" />
    </svg>
  );
}

// ── Coat rack ──
export function PxCoatRack({ width = 26 }: PxProps) {
  return (
    <svg width={width} viewBox="0 0 14 26" {...px}>
      {/* pole */}
      <rect x="6" y="0" width="2" height="22" fill="#5d3a1a" />
      {/* hooks */}
      <rect x="3" y="3" width="2" height="1" fill="#5d3a1a" />
      <rect x="9" y="3" width="2" height="1" fill="#5d3a1a" />
      {/* coats */}
      <rect x="0" y="6" width="6" height="10" fill="#1e3a8a" />
      <rect x="0" y="6" width="6" height="1" fill="#3b82f6" />
      <rect x="8" y="6" width="6" height="9" fill="#dc2626" />
      <rect x="8" y="6" width="6" height="1" fill="#ef4444" />
      {/* base */}
      <rect x="2" y="22" width="10" height="2" fill="#5d3a1a" />
      <rect x="1" y="24" width="12" height="2" fill="#3d2410" />
    </svg>
  );
}

// ── Rug ──
export function PxRug({ width = 200, color = "#a83a3a" }: PxProps & { color?: string }) {
  const dark = shade(color, -20);
  const cream = "#f5f5dc";
  return (
    <svg width={width} viewBox="0 0 80 40" {...px}>
      <rect x="0" y="0" width="80" height="40" fill={color} />
      <rect x="2" y="2" width="76" height="2" fill={cream} />
      <rect x="2" y="36" width="76" height="2" fill={cream} />
      <rect x="2" y="2" width="2" height="36" fill={cream} />
      <rect x="76" y="2" width="2" height="36" fill={cream} />
      {/* diamond pattern in middle */}
      <rect x="36" y="14" width="8" height="2" fill={cream} />
      <rect x="34" y="16" width="12" height="2" fill={cream} />
      <rect x="36" y="18" width="8" height="2" fill={dark} />
      <rect x="38" y="20" width="4" height="2" fill={cream} />
      <rect x="34" y="22" width="12" height="2" fill={cream} />
      <rect x="36" y="24" width="8" height="2" fill={cream} />
      {/* repeats */}
      <rect x="16" y="18" width="4" height="4" fill={dark} />
      <rect x="60" y="18" width="4" height="4" fill={dark} />
      <rect x="8" y="18" width="4" height="4" fill={cream} />
      <rect x="68" y="18" width="4" height="4" fill={cream} />
    </svg>
  );
}

// ── Helpers ──
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent));
  const b = Math.max(0, Math.min(255, (num & 0xff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Wrapper that positions a sprite at room-local % and scales to fit
export function FurnitureSlot({
  lx, ly, width, children, z = 5,
}: { lx: number; ly: number; width: number; children: React.ReactNode; z?: number }) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${lx}%`,
        top: `${ly}%`,
        width,
        zIndex: z,
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.4))",
      }}
    >
      {children}
    </div>
  );
}
