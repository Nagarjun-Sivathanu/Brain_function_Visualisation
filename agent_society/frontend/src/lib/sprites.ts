// LimeZu "Modern Interiors" (free) character sprites.
//
// The free pack ships 4 base characters; we give each region a unique look by
// pairing a base body with a function-derived outfit hue (rotated from the
// region's own colour), so e.g. motor regions read warm, sensory cool, etc.

const ENC = "/office/Modern%20tiles_Free/Characters_free";

// Shared pixels-per-source-pixel scale for characters AND furniture, so sprites
// and tiles look consistent next to each other.
export const PIXEL_SCALE = 2.5;

export const CHAR_BASES = ["Adam", "Alex", "Amelia", "Bob"] as const;
export type CharBase = (typeof CHAR_BASES)[number];

export function runSheet(base: string) { return `${ENC}/${base}_run_16x16.png`; }
export function idleSheet(base: string) { return `${ENC}/${base}_idle_16x16.png`; }
export function sitSheet(base: string) { return `${ENC}/${base}_sit_16x16.png`; }

// Sit sheet is 384×32 (24 frames); frame 0 is the front-facing seated pose.
export const SIT_COLS = 24;
export const SIT_DOWN = 0;

// Frame geometry (each frame is 16×32).
export const FRAME_W = 16;
export const FRAME_H = 32;
export const RUN_FRAMES = 6; // per direction

// Run sheet (384×32) block order: left, up, down, right (6 frames each).
export const RUN_BLOCK: Record<string, number> = { west: 0, north: 1, south: 2, east: 3 };
// Idle sheet (64×32) frame order: left, up, right, down.
export const IDLE_FRAME: Record<string, number> = { west: 0, north: 1, east: 2, south: 3 };

// Stable per-region base body: hash the id so it's deterministic.
export function baseFor(agentId: string): CharBase {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) | 0;
  return CHAR_BASES[Math.abs(h) % CHAR_BASES.length];
}

function hueOf(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length < 6) return 270;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// The base sprite's shirt sits around purple (~270°); rotate it toward the
// region's function colour so each outfit reads differently.
export function outfitHueRotate(regionColor: string): number {
  const target = hueOf(regionColor || "#8b5cf6");
  return Math.round(((target - 270) % 360 + 360) % 360);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// A full CSS filter that makes each region distinct even when two share a base
// body: hue from the function colour, plus per-id brightness/saturation jitter
// (and a small hue nudge) so no two outfits read the same.
export function outfitFilter(agentId: string, regionColor: string): string {
  const h = hash(agentId);
  const hue = (outfitHueRotate(regionColor) + (h % 24) - 12 + 360) % 360;
  const sat = (1.0 + (h % 6) * 0.09).toFixed(2);       // 1.00 – 1.45
  const bright = (0.82 + ((h >> 3) % 8) * 0.045).toFixed(2); // 0.82 – 1.13
  return `hue-rotate(${hue}deg) saturate(${sat}) brightness(${bright})`;
}
