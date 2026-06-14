"use client";

import React from "react";

// Each piece is a scalable SVG sprite sized as a % of the room, with a rim,
// highlight and drop-shadow so it reads as a little 3D object from the top-down
// view (instead of a flat colored rectangle).

function Sprite({
  x, y, w, h, viewBox, children,
}: {
  x: number; y: number; w: number; h: number; viewBox: string; children: React.ReactNode;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
        transform: "translate(-50%,-50%)",
        filter: "drop-shadow(0 3px 3px rgba(8,12,22,0.45))",
      }}
    >
      <svg viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {children}
      </svg>
    </div>
  );
}

export function ConfTable({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 240 168">
      <defs>
        <radialGradient id="ctTop" cx="42%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#d7e3f2" />
          <stop offset="55%" stopColor="#b3c2d6" />
          <stop offset="100%" stopColor="#8294ab" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="108" rx="112" ry="52" fill="rgba(8,12,22,0.28)" />
      <ellipse cx="120" cy="90" rx="112" ry="54" fill="#4f5d72" />
      <ellipse cx="120" cy="80" rx="112" ry="52" fill="url(#ctTop)" stroke="#41506680" strokeWidth="2" />
      <ellipse cx="100" cy="64" rx="66" ry="22" fill="rgba(255,255,255,0.22)" />
      <ellipse cx="120" cy="80" rx="84" ry="36" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2" />
    </Sprite>
  );
}

export function Chair({ x, y, w, h, deg = 0 }: { x: number; y: number; w: number; h: number; deg?: number }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
      transform: `translate(-50%,-50%) rotate(${deg}deg)`, filter: "drop-shadow(0 2px 2px rgba(8,12,22,0.5))" }}>
      <svg viewBox="0 0 48 52" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="chSeat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a7a90" /><stop offset="100%" stopColor="#3c4a5c" />
          </linearGradient>
        </defs>
        <ellipse cx="24" cy="44" rx="16" ry="6" fill="rgba(8,12,22,0.3)" />
        <g fill="#27313f">
          <circle cx="10" cy="40" r="3" /><circle cx="38" cy="40" r="3" />
          <circle cx="24" cy="44" r="3" /><circle cx="16" cy="34" r="3" /><circle cx="32" cy="34" r="3" />
        </g>
        <rect x="22" y="28" width="4" height="10" fill="#2b3543" />
        <rect x="9" y="14" width="30" height="22" rx="7" fill="url(#chSeat)" stroke="#222b38" strokeWidth="1.5" />
        <rect x="13" y="17" width="22" height="7" rx="3" fill="rgba(255,255,255,0.18)" />
        <rect x="8" y="5" width="32" height="11" rx="5" fill="#323d4d" stroke="#1f2733" strokeWidth="1.5" />
        <rect x="12" y="7" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.14)" />
      </svg>
    </div>
  );
}

export function Sofa({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 140 70">
      <defs>
        <linearGradient id="sofaC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7f8ea4" /><stop offset="100%" stopColor="#5a6878" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="132" height="56" rx="12" fill="#4a5667" />
      <rect x="6" y="12" width="128" height="16" rx="8" fill="#646f80" />
      <rect x="4" y="20" width="18" height="44" rx="9" fill="#5a6675" />
      <rect x="118" y="20" width="18" height="44" rx="9" fill="#5a6675" />
      <rect x="26" y="28" width="42" height="34" rx="8" fill="url(#sofaC)" stroke="#3d4756" strokeWidth="1.5" />
      <rect x="72" y="28" width="42" height="34" rx="8" fill="url(#sofaC)" stroke="#3d4756" strokeWidth="1.5" />
      <rect x="30" y="31" width="34" height="8" rx="4" fill="rgba(255,255,255,0.14)" />
      <rect x="76" y="31" width="34" height="8" rx="4" fill="rgba(255,255,255,0.14)" />
    </Sprite>
  );
}

export function Plant({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 56 64">
      <ellipse cx="28" cy="58" rx="16" ry="5" fill="rgba(8,12,22,0.3)" />
      <path d="M16 44 L40 44 L36 60 Q28 63 20 60 Z" fill="#8a96a6" stroke="#5b6778" strokeWidth="1.5" />
      <rect x="15" y="42" width="26" height="4" rx="2" fill="#b3bec9" />
      <g stroke="#0f5132" strokeWidth="1">
        <ellipse cx="28" cy="26" rx="15" ry="18" fill="#15803d" />
        <ellipse cx="19" cy="30" rx="10" ry="13" fill="#16a34a" />
        <ellipse cx="37" cy="30" rx="10" ry="13" fill="#16a34a" />
        <ellipse cx="28" cy="20" rx="11" ry="13" fill="#22c55e" />
        <ellipse cx="24" cy="16" rx="6" ry="8" fill="#4ade80" />
      </g>
    </Sprite>
  );
}

export function Screen({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 140 84">
      <defs>
        <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" /><stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="62" y="64" width="16" height="14" rx="2" fill="#334155" />
      <rect x="50" y="76" width="40" height="6" rx="3" fill="#475569" />
      <rect x="6" y="4" width="128" height="62" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="3" />
      <rect x="14" y="11" width="112" height="48" rx="3" fill="url(#scr)" />
      <g fill="rgba(255,255,255,0.85)">
        <rect x="26" y="40" width="10" height="14" /><rect x="44" y="32" width="10" height="22" />
        <rect x="62" y="24" width="10" height="30" /><rect x="80" y="36" width="10" height="18" />
        <rect x="98" y="28" width="10" height="26" />
      </g>
    </Sprite>
  );
}

export function Podium({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 60 60">
      <ellipse cx="30" cy="52" rx="20" ry="6" fill="rgba(8,12,22,0.3)" />
      <path d="M14 50 L46 50 L42 24 L18 24 Z" fill="#74808f" stroke="#485463" strokeWidth="1.5" />
      <path d="M16 26 L44 26 L43 33 L17 33 Z" fill="#8c97a6" />
      <rect x="19" y="14" width="22" height="12" rx="2" fill="#9fabbb" stroke="#566372" strokeWidth="1.5" />
    </Sprite>
  );
}

export function Cabinet({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 140 44">
      <rect x="2" y="6" width="136" height="36" rx="4" fill="#5f6c7d" />
      <rect x="2" y="4" width="136" height="11" rx="4" fill="#828f9f" />
      <g fill="#4a5667" stroke="#394250" strokeWidth="1">
        <rect x="8" y="18" width="38" height="20" rx="2" />
        <rect x="51" y="18" width="38" height="20" rx="2" />
        <rect x="94" y="18" width="38" height="20" rx="2" />
      </g>
      <g fill="#aab4c2">
        <rect x="22" y="26" width="10" height="3" rx="1.5" />
        <rect x="65" y="26" width="10" height="3" rx="1.5" />
        <rect x="108" y="26" width="10" height="3" rx="1.5" />
      </g>
    </Sprite>
  );
}

export function Cooler({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 32 54">
      <ellipse cx="16" cy="50" rx="11" ry="3.5" fill="rgba(8,12,22,0.3)" />
      <rect x="6" y="20" width="20" height="30" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="9" y="34" width="14" height="8" rx="2" fill="#93c5fd" />
      <path d="M9 20 Q16 2 23 20 Z" fill="#7dd3fc" stroke="#38bdf8" strokeWidth="1.5" />
    </Sprite>
  );
}

export function CoffeeTable({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Sprite x={x} y={y} w={w} h={h} viewBox="0 0 70 44">
      <ellipse cx="35" cy="34" rx="30" ry="9" fill="rgba(8,12,22,0.28)" />
      <ellipse cx="35" cy="22" rx="30" ry="11" fill="#6b7888" />
      <ellipse cx="35" cy="20" rx="30" ry="11" fill="#8493a6" />
      <ellipse cx="28" cy="16" rx="14" ry="4" fill="rgba(255,255,255,0.2)" />
    </Sprite>
  );
}

export function Rug({ x, y, w, h, color = "#aebccd" }: { x: number; y: number; w: number; h: number; color?: string }) {
  return (
    <div className="absolute" style={{
      left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, transform: "translate(-50%,-50%)",
      borderRadius: 14, background: color, opacity: 0.55,
      boxShadow: "inset 0 0 0 4px rgba(148,163,184,0.55), inset 0 0 0 8px rgba(226,232,240,0.35)",
      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 8px, transparent 8px 16px)",
    }} />
  );
}
