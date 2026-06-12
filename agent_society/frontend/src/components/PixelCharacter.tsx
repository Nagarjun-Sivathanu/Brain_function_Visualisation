"use client";

// Inline SVG pixel character — Stardew-ish proportions (12w × 18h pixel grid).
// Each agent gets a unique combination of hair color/style by deriving from agent id.

export type Direction = "south" | "north" | "east" | "west";

interface Props {
  /** Shirt color = agent.color */
  color: string;
  /** Used for deterministic hair/skin variation */
  seed: string;
  direction?: Direction;
  /** 0 or 1 — swap leg positions for walk cycle */
  step?: 0 | 1;
  /** Rendered size in pixels (sprite is 24×36 by default) */
  size?: number;
}

const HAIR_COLORS = ["#3d2410", "#5a3a1c", "#8b5a2b", "#1a0d05", "#a0522d", "#d4a017"];
const SKIN_COLORS = ["#fcd5b4", "#e8b890", "#c69076", "#8b5a3c"];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function PixelCharacter({
  color,
  seed,
  direction = "south",
  step = 0,
  size = 36,
}: Props) {
  const h = hashCode(seed);
  const hair = HAIR_COLORS[h % HAIR_COLORS.length];
  const skin = SKIN_COLORS[(h >> 3) % SKIN_COLORS.length];
  const hairStyle = h % 3; // 0=short, 1=spiky, 2=long

  // Shading: darker variants for outlines/shading
  const shirtDark = shade(color, -35);
  const pants = "#2c1810";
  const pantsDark = "#1a0d05";
  const boot = "#1a0d05";

  // Sprite is 12 wide × 18 tall pixel grid, drawn at "size" px tall.
  const w = (size * 12) / 18;

  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 12 18"
      shapeRendering="crispEdges"
      style={{
        display: "block",
        filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.4))",
        transform: direction === "west" ? "scaleX(-1)" : undefined,
      }}
    >
      {/* === HAIR (top) === */}
      {hairStyle === 0 && (
        <>
          <rect x="3" y="0" width="6" height="1" fill={hair} />
          <rect x="2" y="1" width="8" height="2" fill={hair} />
        </>
      )}
      {hairStyle === 1 && (
        <>
          <rect x="3" y="0" width="2" height="1" fill={hair} />
          <rect x="5" y="0" width="2" height="1" fill={hair} />
          <rect x="7" y="0" width="2" height="1" fill={hair} />
          <rect x="2" y="1" width="8" height="2" fill={hair} />
        </>
      )}
      {hairStyle === 2 && (
        <>
          <rect x="3" y="0" width="6" height="1" fill={hair} />
          <rect x="2" y="1" width="8" height="3" fill={hair} />
          <rect x="1" y="3" width="2" height="3" fill={hair} />
          <rect x="9" y="3" width="2" height="3" fill={hair} />
        </>
      )}

      {/* === HEAD === */}
      <rect x="3" y="3" width="6" height="3" fill={skin} />
      <rect x="2" y="4" width="8" height="2" fill={skin} />

      {/* Hair fringe over forehead */}
      <rect x="3" y="3" width="6" height="1" fill={hair} opacity="0.6" />

      {/* Eyes — orient by direction */}
      {direction === "south" && (
        <>
          <rect x="4" y="4" width="1" height="1" fill="#000" />
          <rect x="7" y="4" width="1" height="1" fill="#000" />
        </>
      )}
      {direction === "north" && (
        <rect x="3" y="3" width="6" height="1" fill={hair} />
      )}
      {(direction === "east" || direction === "west") && (
        <rect x="7" y="4" width="1" height="1" fill="#000" />
      )}

      {/* Neck shadow */}
      <rect x="5" y="6" width="2" height="1" fill={shade(skin, -25)} />

      {/* === SHIRT === */}
      <rect x="3" y="7" width="6" height="4" fill={color} />
      <rect x="2" y="7" width="1" height="3" fill={color} />
      <rect x="9" y="7" width="1" height="3" fill={color} />
      {/* Shirt shading */}
      <rect x="3" y="10" width="6" height="1" fill={shirtDark} />
      <rect x="2" y="9" width="1" height="1" fill={shirtDark} />
      <rect x="9" y="9" width="1" height="1" fill={shirtDark} />

      {/* Arms / hands */}
      <rect x="2" y="10" width="1" height="2" fill={skin} />
      <rect x="9" y="10" width="1" height="2" fill={skin} />

      {/* === LEGS (walk cycle: swap which leg is forward) === */}
      {step === 0 ? (
        <>
          <rect x="3" y="11" width="2" height="4" fill={pants} />
          <rect x="7" y="11" width="2" height="4" fill={pants} />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="2" height="3" fill={pants} />
          <rect x="3" y="14" width="3" height="1" fill={pants} />
          <rect x="7" y="11" width="2" height="3" fill={pants} />
          <rect x="6" y="14" width="3" height="1" fill={pants} />
        </>
      )}
      {/* Leg shading */}
      <rect x="4" y="11" width="1" height="4" fill={pantsDark} opacity="0.4" />
      <rect x="8" y="11" width="1" height="4" fill={pantsDark} opacity="0.4" />

      {/* === FEET === */}
      {step === 0 ? (
        <>
          <rect x="2" y="15" width="3" height="2" fill={boot} />
          <rect x="7" y="15" width="3" height="2" fill={boot} />
        </>
      ) : (
        <>
          <rect x="2" y="15" width="4" height="2" fill={boot} />
          <rect x="6" y="15" width="4" height="2" fill={boot} />
        </>
      )}
    </svg>
  );
}

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + percent));
  const b = Math.max(0, Math.min(255, (num & 0xff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
