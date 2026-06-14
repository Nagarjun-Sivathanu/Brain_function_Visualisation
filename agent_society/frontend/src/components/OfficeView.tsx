"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { Tile, useAtlasReady } from "@/components/Tile";
import { ROOMS, summonSeat, type Room } from "@/lib/officeLayout";
import {
  ConfTable, Chair, Sofa, Plant, Screen, Podium, Cabinet, Cooler, CoffeeTable, Rug,
} from "@/components/Furniture";

export function OfficeView() {
  const agents = useAgentStore((s) => s.agents);
  const positions = useAgentStore((s) => s.positions);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const atlasReady = useAtlasReady();

  return (
    <div className="h-full w-full p-3" style={{ background: "#0b1220" }}>
      <div
        onClick={() => selectAgent(null)}
        className="relative h-full w-full"
        style={{ background: "#1e293b", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)" }}
      >
        {(Object.values(ROOMS) as Room[]).map((room) => <RoomFloor key={room.id} room={room} />)}
        {(Object.values(ROOMS) as Room[]).map((room) =>
          atlasReady
            ? <TileFurniture key={`f-${room.id}`} room={room} />
            : <ProceduralFurniture key={`f-${room.id}`} room={room} />,
        )}

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

function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div className="absolute z-[5] pointer-events-none"
      style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
      {children}
    </div>
  );
}

// ── Real LimeZu furniture tiles (col,row,w,h in the interiors atlas) ─────────
const F = {
  table: { col: 2, row: 36, w: 4, h: 2 },
  chairRed: { col: 9, row: 31, w: 1, h: 1 },
  chairBrown: { col: 10, row: 31, w: 1, h: 1 },
  chairTan: { col: 11, row: 31, w: 1, h: 1 },
  sofaGrey: { col: 1, row: 72, w: 3, h: 2 },
  sofaWhite: { col: 4, row: 72, w: 3, h: 2 },
  sofaTan: { col: 7, row: 72, w: 3, h: 2 },
  palm: { col: 13, row: 44, w: 2, h: 3 },
  plant: { col: 10, row: 44, w: 1, h: 2 },
  tv: { col: 11, row: 79, w: 3, h: 2 },
  map: { col: 10, row: 66, w: 2, h: 2 },
  rugRed: { col: 7, row: 16, w: 3, h: 3 },
  rugGreen: { col: 0, row: 42, w: 3, h: 2 },
  filing: { col: 1, row: 16, w: 2, h: 2 },
  globe: { col: 13, row: 36, w: 1, h: 2 },
  lamp: { col: 13, row: 53, w: 1, h: 2 },
  bookshelf: { col: 11, row: 68, w: 2, h: 3 },
  woodCab: { col: 8, row: 48, w: 1, h: 3 },
  deskMon: { col: 10, row: 40, w: 2, h: 2 },
  blackbd: { col: 10, row: 38, w: 2, h: 2 },
  windowF: { col: 7, row: 24, w: 1, h: 2 },
  vending: { col: 3, row: 18, w: 1, h: 3 },
  fire: { col: 4, row: 69, w: 3, h: 2 },
  sideTbl: { col: 4, row: 55, w: 1, h: 2 },
  mirror: { col: 3, row: 67, w: 1, h: 3 },
} as const;

type P = { col: number; row: number; w: number; h: number };
function T({ p, lx, ly, z = 5, mul = 1 }: { p: P; lx: number; ly: number; z?: number; mul?: number }) {
  return <Tile col={p.col} row={p.row} w={p.w} h={p.h} lx={lx} ly={ly} z={z} mul={mul} />;
}

function TileFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    const chairTiles = [F.chairRed, F.chairBrown, F.chairTan];
    const ring = Array.from({ length: 12 }, (_, i) => summonSeat(i, 12));
    return (
      <Group room={room}>
        {/* central boardroom table + chairs */}
        <T p={F.rugRed} lx={50} ly={53} z={2} mul={2.6} />
        <T p={F.table} lx={50} ly={53} z={3} mul={2} />
        {ring.map((c, i) => <T key={i} p={chairTiles[i % 3]} lx={c.lx} ly={c.ly} z={4} />)}
        {/* top wall */}
        <T p={F.blackbd} lx={50} ly={6} />
        <T p={F.windowF} lx={70} ly={5} />
        <T p={F.windowF} lx={30} ly={5} />
        {/* left wall */}
        <T p={F.bookshelf} lx={6} ly={26} />
        <T p={F.filing} lx={7} ly={50} />
        <T p={F.deskMon} lx={8} ly={75} />
        {/* right wall */}
        <T p={F.bookshelf} lx={94} ly={26} />
        <T p={F.woodCab} lx={95} ly={52} />
        <T p={F.globe} lx={93} ly={74} />
        {/* corners */}
        <T p={F.palm} lx={10} ly={93} />
        <T p={F.palm} lx={90} ly={93} />
      </Group>
    );
  }
  if (room.id === "implementation") {
    const seats = [34, 54, 74].flatMap((y) => [{ x: 30, y }, { x: 70, y }]);
    return (
      <Group room={room}>
        <T p={F.tv} lx={50} ly={9} mul={1.5} />
        <T p={F.rugGreen} lx={50} ly={56} z={2} mul={1.8} />
        {seats.map((c, i) => <T key={i} p={F.chairBrown} lx={c.x} ly={c.y} z={4} />)}
        <T p={F.bookshelf} lx={13} ly={40} />
        <T p={F.woodCab} lx={88} ly={40} />
        <T p={F.deskMon} lx={50} ly={26} />
        <T p={F.palm} lx={13} ly={86} />
        <T p={F.plant} lx={87} ly={86} />
        <T p={F.lamp} lx={50} ly={92} />
      </Group>
    );
  }
  // waiting lounge — thin vertical corridor; small items hug the walls
  return (
    <Group room={room}>
      <T p={F.vending} lx={28} ly={8} />
      <T p={F.plant} lx={75} ly={8} />
      <T p={F.sideTbl} lx={25} ly={26} />
      <T p={F.lamp} lx={76} ly={26} />
      <T p={F.plant} lx={25} ly={44} />
      <T p={F.chairTan} lx={75} ly={44} />
      <T p={F.sideTbl} lx={25} ly={62} />
      <T p={F.mirror} lx={78} ly={64} />
      <T p={F.plant} lx={25} ly={82} />
      <T p={F.fire} lx={60} ly={88} />
    </Group>
  );
}

// ── Procedural fallback (used only if the LimeZu atlas isn't present) ────────
function ProceduralFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    return (
      <Group room={room}>
        <Rug x={50} y={57} w={78} h={64} color="#b9c6d8" />
        <ConfTable x={50} y={56} w={54} h={50} />
        <Cabinet x={50} y={95} w={34} h={9} />
        <Cooler x={6} y={88} w={4} h={11} />
        <Plant x={6} y={12} w={7} h={11} />
        <Plant x={94} y={11} w={8} h={12} />
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
        <Plant x={10} y={24} w={12} h={13} />
        <Plant x={90} y={24} w={12} h={13} />
      </Group>
    );
  }
  return (
    <Group room={room}>
      <Rug x={50} y={50} w={48} h={94} color="#aeb9c9" />
      <Sofa x={26} y={17} w={34} h={9} />
      <Sofa x={74} y={33} w={34} h={9} />
      <Sofa x={26} y={52} w={34} h={9} />
      <CoffeeTable x={50} y={46} w={26} h={7} />
      <Plant x={86} y={20} w={14} h={8} />
      <Plant x={14} y={74} w={12} h={7} />
    </Group>
  );
}
