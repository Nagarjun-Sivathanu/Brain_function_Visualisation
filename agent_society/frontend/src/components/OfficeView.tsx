"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { ROOMS, mainSeat, type Room } from "@/lib/officeLayout";
import {
  FurnitureSlot,
  PxChair,
  PxRoundTable,
  PxCouch,
  PxPlant,
  PxSmallPlant,
  PxWhiteboard,
  PxTV,
  PxRug,
} from "@/components/PixelFurniture";

export function OfficeView() {
  const agents = useAgentStore((s) => s.agents);
  const positions = useAgentStore((s) => s.positions);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <div
      className="h-full w-full p-4"
      style={{ background: "radial-gradient(ellipse at center, #2a1d0e 0%, #1a1106 100%)" }}
    >
      <div
        onClick={() => selectAgent(null)}
        className="relative h-full w-full"
        style={{ background: "#3a2818", boxShadow: "inset 0 0 30px rgba(0,0,0,0.6)", borderRadius: 6, overflow: "hidden" }}
      >
        {(Object.values(ROOMS) as Room[]).map((room) => (
          <RoomFloor key={room.id} room={room} />
        ))}

        {(Object.values(ROOMS) as Room[]).map((room) => (
          <RoomFurniture key={`f-${room.id}`} room={room} />
        ))}

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
        boxShadow: `inset 0 0 0 2px ${room.accent}55, inset 0 4px 16px rgba(0,0,0,0.4)`,
        borderRadius: 4,
      }}
    >
      <div
        className="absolute top-2 left-2 px-2 py-1 text-[8px] rounded text-amber-50 z-30"
        style={{ background: "#2a1d0e", boxShadow: `0 0 0 1px ${room.accent}` }}
      >
        {room.label}
      </div>
    </div>
  );
}

function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div
      className="absolute z-[5] pointer-events-none"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
    >
      {children}
    </div>
  );
}

function RoomFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    const chairs = [0, 1, 2].map((i) => mainSeat(i));
    return (
      <Group room={room}>
        <FurnitureSlot lx={50} ly={6} width={150}><PxWhiteboard width={150} /></FurnitureSlot>
        <FurnitureSlot lx={50} ly={58} width={210}><PxRoundTable width={210} /></FurnitureSlot>
        {chairs.map((c, i) => (
          <FurnitureSlot key={i} lx={c.lx} ly={c.ly + 7} width={22} z={4}><PxChair width={22} /></FurnitureSlot>
        ))}
        <FurnitureSlot lx={8} ly={92} width={26}><PxPlant width={26} /></FurnitureSlot>
        <FurnitureSlot lx={92} ly={92} width={24}><PxSmallPlant width={24} /></FurnitureSlot>
      </Group>
    );
  }
  if (room.id === "implementation") {
    return (
      <Group room={room}>
        <FurnitureSlot lx={50} ly={6} width={120}><PxTV width={120} /></FurnitureSlot>
        <FurnitureSlot lx={12} ly={94} width={24}><PxSmallPlant width={24} /></FurnitureSlot>
        <FurnitureSlot lx={88} ly={94} width={26}><PxPlant width={26} /></FurnitureSlot>
      </Group>
    );
  }
  // waiting
  return (
    <Group room={room}>
      <FurnitureSlot lx={50} ly={50} width={200}><PxRug width={200} /></FurnitureSlot>
      <FurnitureSlot lx={50} ly={50} width={150}><PxCouch width={150} /></FurnitureSlot>
      <FurnitureSlot lx={6} ly={50} width={24}><PxPlant width={24} /></FurnitureSlot>
      <FurnitureSlot lx={94} ly={50} width={24}><PxPlant width={24} /></FurnitureSlot>
    </Group>
  );
}
