"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { ROOMS, mainSeat, type Room } from "@/lib/officeLayout";
import { FurnitureSlot, PxPlant, PxSmallPlant } from "@/components/PixelFurniture";

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
        boxShadow: `inset 0 0 0 1px ${room.accent}33, inset 0 6px 20px rgba(15,23,42,0.18)`,
        borderRadius: 5,
      }}
    >
      <div
        className="absolute top-2 left-2 px-2 py-0.5 text-[8px] font-semibold rounded text-white z-30"
        style={{ background: "#0f172a", boxShadow: `0 0 0 1px ${room.accent}` }}
      >
        {room.label}
      </div>
    </div>
  );
}

function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div className="absolute z-[5] pointer-events-none"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
      {children}
    </div>
  );
}

// ── Modern furniture (simple styled shapes, no wooden sprites) ───────────────
function ModernTable({ w }: { w: number }) {
  return <div style={{ width: w, height: w * 0.62, borderRadius: w * 0.18,
    background: "linear-gradient(160deg,#9fb0c4,#7e8ea4)", boxShadow: "0 4px 10px rgba(0,0,0,0.35), inset 0 1px 0 #c9d6e6" }} />;
}
function OfficeChair({ w }: { w: number }) {
  return <div style={{ width: w, height: w, borderRadius: w * 0.3,
    background: "#334155", boxShadow: "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 #475569" }} />;
}
function GlassBoard({ w }: { w: number }) {
  return <div style={{ width: w, height: w * 0.22, borderRadius: 4,
    background: "linear-gradient(180deg,rgba(226,242,255,0.9),rgba(186,214,236,0.7))",
    border: "2px solid #64748b", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />;
}
function Screen({ w }: { w: number }) {
  return <div style={{ width: w, height: w * 0.4, borderRadius: 4, background: "#0f172a",
    border: "3px solid #334155", boxShadow: "0 0 14px rgba(91,140,255,0.5), inset 0 0 12px rgba(91,140,255,0.4)" }}>
    <div style={{ margin: "22%", height: "40%", borderRadius: 2, background: "linear-gradient(90deg,#1e3a8a,#3b82f6)" }} />
  </div>;
}
function Bench({ w }: { w: number }) {
  return <div style={{ width: w, height: w * 0.45, borderRadius: w * 0.22,
    background: "linear-gradient(180deg,#64748b,#475569)", boxShadow: "0 2px 5px rgba(0,0,0,0.35)" }} />;
}

function RoomFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    const chairs = [0, 1, 2].map((i) => mainSeat(i));
    return (
      <Group room={room}>
        <FurnitureSlot lx={50} ly={4} width={150}><GlassBoard w={150} /></FurnitureSlot>
        <FurnitureSlot lx={50} ly={55} width={200}><ModernTable w={200} /></FurnitureSlot>
        {chairs.map((c, i) => (
          <FurnitureSlot key={i} lx={c.lx} ly={c.ly + 7} width={16} z={4}><OfficeChair w={16} /></FurnitureSlot>
        ))}
        <FurnitureSlot lx={9} ly={95} width={24}><PxPlant width={24} /></FurnitureSlot>
        <FurnitureSlot lx={91} ly={95} width={22}><PxSmallPlant width={22} /></FurnitureSlot>
      </Group>
    );
  }
  if (room.id === "implementation") {
    return (
      <Group room={room}>
        <FurnitureSlot lx={50} ly={5} width={120}><Screen w={120} /></FurnitureSlot>
        <FurnitureSlot lx={15} ly={96} width={22}><PxSmallPlant width={22} /></FurnitureSlot>
        <FurnitureSlot lx={85} ly={96} width={24}><PxPlant width={24} /></FurnitureSlot>
      </Group>
    );
  }
  // waiting corridor
  return (
    <Group room={room}>
      <FurnitureSlot lx={50} ly={30} width={42}><Bench w={42} /></FurnitureSlot>
      <FurnitureSlot lx={50} ly={70} width={42}><Bench w={42} /></FurnitureSlot>
      <FurnitureSlot lx={50} ly={96} width={22}><PxSmallPlant width={22} /></FurnitureSlot>
    </Group>
  );
}
