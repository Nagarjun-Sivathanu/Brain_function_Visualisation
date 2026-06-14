"use client";

import { useAgentStore } from "@/lib/agentStore";
import { useMeetingStore } from "@/lib/meetingStore";
import { ROOMS, type RoomId } from "@/lib/officeLayout";

const EDGE_COLOR: Record<string, string> = {
  excitatory: "#38d39f",
  inhibitory: "#ef4444",
  modulatory: "#f59e0b",
  gating: "#5b8cff",
};

function toOffice(room: RoomId, lx: number, ly: number) {
  const b = ROOMS[room].bounds;
  return { x: b.x + (lx / 100) * b.w, y: b.y + (ly / 100) * b.h };
}

/** Live functional-connectome overlay: typed interaction edges between the
 *  active regions (only drawn when both endpoints are placed agents). */
export function Connectome() {
  const positions = useAgentStore((s) => s.positions);
  const edges = useMeetingStore((s) => s.view.edges);

  // Only draw an interaction edge when BOTH regions are currently seated in the
  // meeting room — otherwise edges to waiting/implementation regions sprawl
  // across the whole office as stray lines. Dedupe repeated pairs.
  const seen = new Set<string>();
  const drawn = edges.filter((e) => {
    const a = positions[e.from], b = positions[e.to];
    if (!a || !b || a.room !== "meeting" || b.room !== "meeting") return false;
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (drawn.length === 0) return null;

  return (
    <svg className="absolute inset-0 z-[6] pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        {Object.entries(EDGE_COLOR).map(([k, c]) => (
          <marker key={k} id={`arrow-${k}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={c} />
          </marker>
        ))}
      </defs>
      {drawn.map((e, i) => {
        const a = positions[e.from], b = positions[e.to];
        const pa = toOffice(a.room, a.lx, a.ly);
        const pb = toOffice(b.room, b.lx, b.ly);
        const color = EDGE_COLOR[e.kind] ?? "#9ca3af";
        const dash = e.kind === "inhibitory" || e.kind === "gating" ? "1.6 1.2" : undefined;
        // gentle curve so reciprocal edges separate slightly
        const mx = (pa.x + pb.x) / 2 + (pb.y - pa.y) * 0.05;
        const my = (pa.y + pb.y) / 2 - (pb.x - pa.x) * 0.05;
        return (
          <path
            key={i}
            d={`M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`}
            fill="none"
            stroke={color}
            strokeWidth={0.28}
            strokeDasharray={dash}
            markerEnd={`url(#arrow-${e.kind})`}
            opacity={0.55}
          />
        );
      })}
    </svg>
  );
}
