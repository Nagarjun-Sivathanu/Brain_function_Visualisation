"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { ROOMS, mainSeat, summonSeat, type Room } from "@/lib/officeLayout";
import {
  ConfTable, Chair, Sofa, Plant, Screen, Podium, Cabinet, Cooler, CoffeeTable, Rug,
} from "@/components/Furniture";

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

// Group spans a room's bounds; furniture positions are room-local % (centered).
function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div className="absolute z-[5] pointer-events-none"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
      {children}
    </div>
  );
}

function Whiteboard({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: "8%", transform: "translate(-50%,-50%)" }}>
      <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(180deg,#f2f8ff,#cfe0f0)",
        border: "2px solid #5f6c7d", boxShadow: "0 3px 6px rgba(8,12,22,0.4)" }}>
        <div style={{ margin: "16% 8%", height: 3, borderRadius: 2, background: "#93a3b8" }} />
        <div style={{ margin: "0 8% 14%", height: 3, width: "55%", borderRadius: 2, background: "#b7c2d2" }} />
      </div>
    </div>
  );
}

function RoomFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    const ring = Array.from({ length: 12 }, (_, i) => summonSeat(i, 12));
    const heads = [0, 1, 2].map((i) => mainSeat(i));
    return (
      <Group room={room}>
        <Rug x={50} y={57} w={78} h={64} color="#b9c6d8" />
        <Whiteboard x={50} y={5} w={46} />
        <ConfTable x={50} y={56} w={54} h={50} />
        {ring.map((c, i) => <Chair key={`r${i}`} x={c.lx} y={c.ly} w={7} h={9} deg={(i / 12) * 360} />)}
        {heads.map((c, i) => <Chair key={`h${i}`} x={c.lx} y={c.ly + 7} w={7} h={9} deg={180} />)}
        <Cabinet x={50} y={95} w={34} h={9} />
        <Cooler x={6} y={88} w={4} h={11} />
        <Plant x={6} y={12} w={7} h={11} />
        <Plant x={94} y={11} w={8} h={12} />
        <Plant x={94} y={93} w={8} h={12} />
      </Group>
    );
  }
  if (room.id === "implementation") {
    const sideChairs = [34, 50, 66, 82].flatMap((y) => [{ x: 15, y }, { x: 85, y }]);
    return (
      <Group room={room}>
        <Screen x={50} y={9} w={74} h={18} />
        <Podium x={50} y={25} w={20} h={13} />
        <Rug x={50} y={58} w={62} h={62} color="#aebccd" />
        {sideChairs.map((c, i) => <Chair key={i} x={c.x} y={c.y} w={14} h={16} deg={c.x < 50 ? 90 : -90} />)}
        <Cabinet x={50} y={93} w={80} h={9} />
        <Plant x={10} y={24} w={12} h={13} />
        <Plant x={90} y={24} w={12} h={13} />
      </Group>
    );
  }
  // waiting lounge — tall thin corridor
  return (
    <Group room={room}>
      <Rug x={50} y={50} w={48} h={94} color="#aeb9c9" />
      <Cooler x={80} y={8} w={10} h={9} />
      <Sofa x={26} y={17} w={34} h={9} />
      <Sofa x={74} y={33} w={34} h={9} />
      <Sofa x={26} y={52} w={34} h={9} />
      <Sofa x={74} y={68} w={34} h={9} />
      <Sofa x={26} y={86} w={34} h={9} />
      <CoffeeTable x={50} y={46} w={26} h={7} />
      <Plant x={86} y={20} w={14} h={8} />
      <Plant x={14} y={40} w={12} h={7} />
      <Plant x={86} y={58} w={14} h={8} />
      <Plant x={14} y={74} w={12} h={7} />
    </Group>
  );
}
