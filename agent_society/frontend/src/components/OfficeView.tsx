"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { ROOMS, mainSeat, summonSeat, type Room } from "@/lib/officeLayout";

export function OfficeView() {
  const agents = useAgentStore((s) => s.agents);
  const positions = useAgentStore((s) => s.positions);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <div className="h-full w-full p-3" style={{ background: "#0b1220" }}>
      <div
        onClick={() => selectAgent(null)}
        className="relative h-full w-full"
        style={{ background: "#1e293b", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)" }}
      >
        {(Object.values(ROOMS) as Room[]).map((room) => <RoomFloor key={room.id} room={room} />)}
        {(Object.values(ROOMS) as Room[]).map((room) => <RoomFurniture key={`f-${room.id}`} room={room} />)}

        <Connectome />

        {agents.map((agent) => {
          const pos = positions[agent.id];
          if (!pos) return null;
          return <AgentSprite key={agent.id} agent={agent} room={pos.room} lx={pos.lx} ly={pos.ly} />;
        })}
      </div>
    </div>
  );
}

function RoomFloor({ room }: { room: Room }) {
  const b = room.bounds;
  return (
    <div
      className="absolute"
      style={{
        left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
        background: room.floor,
        border: "2px solid #0f172a",
        boxShadow: `inset 0 0 0 1px ${room.accent}33, inset 0 6px 24px rgba(15,23,42,0.18)`,
        borderRadius: 5,
      }}
    >
      <div className="absolute top-2 left-2 px-2 py-0.5 text-[8px] font-semibold rounded text-white z-30"
        style={{ background: "#0f172a", boxShadow: `0 0 0 1px ${room.accent}` }}>
        {room.label}
      </div>
    </div>
  );
}

// Group spans a room's bounds; children are positioned in room-local %.
function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div className="absolute z-[5] pointer-events-none"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
      {children}
    </div>
  );
}

// ── Furniture primitives (sizes are % of the room, so they fill the space) ──
function Box({ x, y, w, h, style, children }: { x: number; y: number; w: number; h: number; style?: React.CSSProperties; children?: React.ReactNode }) {
  return <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, ...style }}>{children}</div>;
}
function Rug({ x, y, w, h, color = "#cbd5e1" }: { x: number; y: number; w: number; h: number; color?: string }) {
  return <Box x={x} y={y} w={w} h={h} style={{ background: color, opacity: 0.5, borderRadius: 10, boxShadow: "inset 0 0 0 3px rgba(148,163,184,0.5)" }} />;
}
function OvalTable({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <Box x={x} y={y} w={w} h={h} style={{
    borderRadius: "50%",
    background: "radial-gradient(ellipse at 42% 32%, #c2cfe0, #8e9fb4 68%, #76879d)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.4), inset 0 3px 0 #d7e1ee, inset 0 -6px 14px rgba(15,23,42,0.25)",
  }} />;
}
function Board({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <Box x={x} y={y} w={w} h={h} style={{
    borderRadius: 4, background: "linear-gradient(180deg,rgba(232,245,255,0.95),rgba(196,220,240,0.8))",
    border: "2px solid #64748b", boxShadow: "0 3px 8px rgba(0,0,0,0.3)",
  }} />;
}
function Screen({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Box x={x} y={y} w={w} h={h} style={{
      borderRadius: 5, background: "#0f172a", border: "3px solid #334155",
      boxShadow: "0 0 18px rgba(91,140,255,0.45), inset 0 0 16px rgba(91,140,255,0.35)",
    }}>
      <div style={{ position: "absolute", inset: "26%", borderRadius: 3, background: "linear-gradient(90deg,#1e3a8a,#3b82f6)" }} />
    </Box>
  );
}
function Cabinet({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <Box x={x} y={y} w={w} h={h} style={{
    borderRadius: 3, background: "linear-gradient(180deg,#9aa6b6,#74808f)",
    boxShadow: "inset 0 0 0 2px rgba(15,23,42,0.25), 0 3px 6px rgba(0,0,0,0.3)",
    backgroundImage: "repeating-linear-gradient(90deg, transparent 0 18px, rgba(15,23,42,0.25) 18px 19px)",
  }} />;
}
function Sofa({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <Box x={x} y={y} w={w} h={h} style={{
    borderRadius: 8, background: "linear-gradient(180deg,#6b7a8f,#566375)",
    boxShadow: "inset 0 3px 0 #7d8ca0, inset 0 -3px 6px rgba(15,23,42,0.3), 0 3px 6px rgba(0,0,0,0.3)",
  }} />;
}
function Plant({ cx, cy, size = 26 }: { cx: number; cy: number; size?: number }) {
  return (
    <div style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)", width: size, height: size }}>
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: size * 0.5, height: size * 0.4, background: "#9a6b4a", borderRadius: 2 }} />
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: size * 0.85, height: size * 0.7, background: "radial-gradient(circle at 40% 35%, #4ade80, #16a34a)", borderRadius: "50% 50% 45% 45%" }} />
    </div>
  );
}
function Cooler({ cx, cy }: { cx: number; cy: number }) {
  return (
    <div style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: "translate(-50%,-50%)", width: 16, height: 30 }}>
      <div style={{ position: "absolute", inset: 0, background: "#e2e8f0", borderRadius: 3, boxShadow: "0 2px 4px rgba(0,0,0,.3)" }} />
      <div style={{ position: "absolute", top: -6, left: 3, right: 3, height: 10, background: "#7dd3fc", borderRadius: 3 }} />
    </div>
  );
}
function Chair({ cx, cy, deg = 0 }: { cx: number; cy: number; deg?: number }) {
  const s = 16;
  return (
    <div style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`, transform: `translate(-50%,-50%) rotate(${deg}deg)`, width: s, height: s }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 5, background: "#3b4757", boxShadow: "inset 0 1px 0 #4b5563, 0 2px 3px rgba(0,0,0,0.45)" }} />
      <div style={{ position: "absolute", top: -3, left: 3, right: 3, height: 5, borderRadius: 3, background: "#1f2937" }} />
    </div>
  );
}

function RoomFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    // chairs around the table = the summon-seat ring (so agents sit on them) + 3 head seats
    const ring = Array.from({ length: 12 }, (_, i) => summonSeat(i, 12));
    const heads = [0, 1, 2].map((i) => mainSeat(i));
    return (
      <Group room={room}>
        <Rug x={14} y={26} w={72} h={62} color="#b9c6d8" />
        <Board x={26} y={3} w={48} h={7} />
        <Cabinet x={3} y={40} w={5} h={26} />
        <Cabinet x={92} y={40} w={5} h={26} />
        <OvalTable x={26} y={33} w={48} h={46} />
        {ring.map((c, i) => <Chair key={`r${i}`} cx={c.lx} cy={c.ly} deg={(i / 12) * 360} />)}
        {heads.map((c, i) => <Chair key={`h${i}`} cx={c.lx} cy={c.ly + 6} />)}
        <Cooler cx={6} cy={88} />
        <Plant cx={94} cy={10} size={26} />
        <Plant cx={6} cy={12} size={22} />
        <Plant cx={94} cy={92} size={28} />
        <Plant cx={50} cy={95} size={22} />
      </Group>
    );
  }
  if (room.id === "implementation") {
    // a presentation stage at the top; the regions line up centre to speak
    const sideChairs = [30, 45, 60, 75].flatMap((y) => [{ x: 16, y }, { x: 84, y }]);
    return (
      <Group room={room}>
        <Screen x={14} y={3} w={72} h={14} />
        <Box x={38} y={20} w={24} h={9} style={{ borderRadius: 3, background: "linear-gradient(180deg,#94a3b8,#64748b)", boxShadow: "0 3px 6px rgba(0,0,0,0.35)" }} />
        <Rug x={20} y={30} w={60} h={62} color="#aebccd" />
        {sideChairs.map((c, i) => <Chair key={i} cx={c.x} cy={c.y} deg={c.x < 50 ? 90 : -90} />)}
        <Cabinet x={6} y={84} w={88} h={5} />
        <Plant cx={10} cy={24} size={22} />
        <Plant cx={90} cy={24} size={22} />
        <Plant cx={50} cy={95} size={24} />
      </Group>
    );
  }
  // waiting lounge — a tall thin corridor
  return (
    <Group room={room}>
      <Rug x={28} y={4} w={44} h={92} color="#aeb9c9" />
      <Cooler cx={78} cy={8} />
      <Sofa x={6} y={16} w={26} h={9} />
      <Sofa x={68} y={30} w={26} h={9} />
      <Sofa x={6} y={50} w={26} h={9} />
      <Sofa x={68} y={66} w={26} h={9} />
      <Sofa x={6} y={84} w={26} h={9} />
      <Box x={40} y={46} w={20} h={6} style={{ borderRadius: 4, background: "#8b97a8", boxShadow: "0 2px 4px rgba(0,0,0,.3)" }} />
      <Plant cx={88} cy={20} size={22} />
      <Plant cx={12} cy={40} size={20} />
      <Plant cx={88} cy={56} size={22} />
      <Plant cx={12} cy={74} size={20} />
      <Plant cx={50} cy={97} size={22} />
    </Group>
  );
}
