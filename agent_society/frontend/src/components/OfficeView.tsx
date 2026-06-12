"use client";

import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import {
  ROOMS,
  DOORS,
  WALL_THICKNESS,
  CENTER_VERT_X,
  CENTER_HORZ_Y,
  meetingChair,
  type Room,
  type Door,
} from "@/lib/officeLayout";
import {
  FurnitureSlot,
  PxDesk,
  PxChair,
  PxRoundTable,
  PxCouch,
  PxPlant,
  PxSmallPlant,
  PxFridge,
  PxVending,
  PxBookshelf,
  PxCoffeeMachine,
  PxTV,
  PxWindow,
  PxPainting,
  PxReceptionDesk,
  PxCoffeeTable,
  PxWhiteboard,
  PxCoatRack,
  PxRug,
} from "@/components/PixelFurniture";

const WALL_COLOR = "#3d2410";
const WALL_HIGHLIGHT = "#5d3a1a";

export function OfficeView() {
  const agents = useAgentStore((s) => s.agents);
  const positions = useAgentStore((s) => s.positions);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <div
      className="h-full w-full p-6"
      style={{
        background: "radial-gradient(ellipse at center, #2a1d0e 0%, #1a1106 100%)",
      }}
    >
      <div
        onClick={() => selectAgent(null)}
        className="relative h-full w-full"
        style={{
          background: "#3a2818",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.6)",
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        {(Object.values(ROOMS) as Room[]).map((room) => (
          <RoomFloor key={room.id} room={room} />
        ))}

        <Walls />
        {DOORS.map((d) => <DoorFrame key={d.id} door={d} />)}

        {(Object.values(ROOMS) as Room[]).map((room) => (
          <RoomFurniture key={`f-${room.id}`} room={room} />
        ))}

        {agents.map((agent) => {
          const pos = positions[agent.id];
          if (!pos) return null;
          return (
            <AgentSprite
              key={agent.id}
              agent={agent}
              room={pos.room}
              lx={pos.lx}
              ly={pos.ly}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Floors ──────────────────────────────────────────────────────────────────

function RoomFloor({ room }: { room: Room }) {
  const b = room.bounds;
  return (
    <div
      className="absolute"
      style={{
        left: `${b.x}%`, top: `${b.y}%`,
        width: `${b.w}%`, height: `${b.h}%`,
        background: room.floor,
        boxShadow: "inset 0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 30% 20%, rgba(255,236,180,0.18) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute top-2 left-2 px-2 py-1 text-[8px] rounded text-amber-50 z-30"
        style={{ background: "#2a1d0e", boxShadow: `0 0 0 1px ${room.accent}` }}
      >
        {room.label}
      </div>
    </div>
  );
}

// ── Walls ────────────────────────────────────────────────────────────────────

function Walls() {
  const vertDoors = DOORS.filter((d) => d.orient === "v").sort((a, b) => a.y - b.y);
  const horzDoors = DOORS.filter((d) => d.orient === "h").sort((a, b) => a.x - b.x);

  return (
    <>
      <WallSeg x={0} y={0} w={100} h={WALL_THICKNESS} />
      <WallSeg x={0} y={100 - WALL_THICKNESS} w={100} h={WALL_THICKNESS} />
      <WallSeg x={0} y={0} w={WALL_THICKNESS} h={100} />
      <WallSeg x={100 - WALL_THICKNESS} y={0} w={WALL_THICKNESS} h={100} />

      {wallSegmentsBetween(0, 100, vertDoors.map((d) => ({ pos: d.y, gap: d.width }))).map(
        (s, i) => (
          <WallSeg
            key={`v-${i}`}
            x={CENTER_VERT_X - WALL_THICKNESS / 2}
            y={s.from}
            w={WALL_THICKNESS}
            h={s.to - s.from}
          />
        ),
      )}
      {wallSegmentsBetween(0, 100, horzDoors.map((d) => ({ pos: d.x, gap: d.width }))).map(
        (s, i) => (
          <WallSeg
            key={`h-${i}`}
            x={s.from}
            y={CENTER_HORZ_Y - WALL_THICKNESS / 2}
            w={s.to - s.from}
            h={WALL_THICKNESS}
          />
        ),
      )}
    </>
  );
}

function wallSegmentsBetween(
  start: number, end: number,
  gaps: Array<{ pos: number; gap: number }>,
): Array<{ from: number; to: number }> {
  const sorted = [...gaps].sort((a, b) => a.pos - b.pos);
  const segs: Array<{ from: number; to: number }> = [];
  let cursor = start;
  for (const g of sorted) {
    const gapStart = g.pos - g.gap / 2;
    const gapEnd = g.pos + g.gap / 2;
    if (gapStart > cursor) segs.push({ from: cursor, to: gapStart });
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < end) segs.push({ from: cursor, to: end });
  return segs;
}

function WallSeg({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <div
      className="absolute z-10 pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`,
        width: `${w}%`, height: `${h}%`,
        background: `linear-gradient(180deg, ${WALL_HIGHLIGHT} 0%, ${WALL_COLOR} 100%)`,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.6)",
      }}
    />
  );
}

function DoorFrame({ door }: { door: Door }) {
  const isVert = door.orient === "v";
  const w = isVert ? WALL_THICKNESS * 2 : door.width;
  const h = isVert ? door.width : WALL_THICKNESS * 2;
  return (
    <div
      className="absolute z-10 pointer-events-none flex items-center justify-center"
      style={{
        left: `${door.x}%`, top: `${door.y}%`,
        width: `${w}%`, height: `${h}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className="absolute"
        style={{
          left: isVert ? "20%" : "0%",
          top: isVert ? "5%" : "20%",
          width: isVert ? "8%" : "100%",
          height: isVert ? "90%" : "8%",
          background: "#8b5a2b",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)",
        }}
      />
      <div
        className="absolute"
        style={{
          left: isVert ? "72%" : "0%",
          top: isVert ? "5%" : "72%",
          width: isVert ? "8%" : "100%",
          height: isVert ? "90%" : "8%",
          background: "#8b5a2b",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

// ── Per-room furniture (real SVG pixel sprites) ─────────────────────────────

function RoomFurniture({ room }: { room: Room }) {
  switch (room.id) {
    case "lobby":
      return <LobbyFurniture room={room} />;
    case "meeting":
      return <MeetingFurniture room={room} />;
    case "desks":
      return <DeskFurniture room={room} />;
    case "break":
      return <BreakFurniture room={room} />;
  }
}

function Group({ room, children }: { room: Room; children: React.ReactNode }) {
  const b = room.bounds;
  return (
    <div
      className="absolute z-[5] pointer-events-none"
      style={{
        left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
      }}
    >
      {children}
    </div>
  );
}

function LobbyFurniture({ room }: { room: Room }) {
  return (
    <Group room={room}>
      <FurnitureSlot lx={50} ly={75} width={220}><PxRug width={220} /></FurnitureSlot>
      <FurnitureSlot lx={75} ly={14} width={160}><PxReceptionDesk width={160} /></FurnitureSlot>
      <FurnitureSlot lx={20} ly={8} width={48}><PxPainting width={48} /></FurnitureSlot>
      <FurnitureSlot lx={45} ly={8} width={56}><PxWindow width={56} /></FurnitureSlot>
      <FurnitureSlot lx={68} ly={8} width={56}><PxWindow width={56} /></FurnitureSlot>
      <FurnitureSlot lx={8} ly={28} width={28}><PxCoatRack width={28} /></FurnitureSlot>
      <FurnitureSlot lx={8} ly={92} width={32}><PxPlant width={32} /></FurnitureSlot>
      <FurnitureSlot lx={92} ly={92} width={28}><PxSmallPlant width={28} /></FurnitureSlot>
    </Group>
  );
}

function MeetingFurniture({ room }: { room: Room }) {
  // Chairs are generated to match the N seats around the table (meetingChair
  // mirrors meetingSeat's ellipse), so the ring scales with the roster size.
  const n = useAgentStore((s) => s.agents.length) || 6;
  const chairs = Array.from({ length: n }, (_, i) => meetingChair(i, n));
  const cw = n > 8 ? 20 : 26;
  return (
    <Group room={room}>
      {/* Whiteboard on top wall */}
      <FurnitureSlot lx={50} ly={6} width={120}><PxWhiteboard width={120} /></FurnitureSlot>
      {/* Big table */}
      <FurnitureSlot lx={50} ly={50} width={200}><PxRoundTable width={200} /></FurnitureSlot>
      {/* Chairs around table — one per seat */}
      {chairs.map((c, i) => (
        <FurnitureSlot key={i} lx={c.lx} ly={c.ly} width={cw} z={4}>
          <PxChair width={cw} />
        </FurnitureSlot>
      ))}
    </Group>
  );
}

function DeskFurniture({ room }: { room: Room }) {
  const desks = [
    { lx: 18, ly: 12 }, { lx: 50, ly: 12 }, { lx: 82, ly: 12 },
    { lx: 18, ly: 88 }, { lx: 50, ly: 88 }, { lx: 82, ly: 88 },
  ];
  // Chairs sit between each desk and its agent (visual cue they're seated)
  const chairs = [
    { lx: 18, ly: 24 }, { lx: 50, ly: 24 }, { lx: 82, ly: 24 },
    { lx: 18, ly: 76 }, { lx: 50, ly: 76 }, { lx: 82, ly: 76 },
  ];
  return (
    <Group room={room}>
      {desks.map((d, i) => (
        <FurnitureSlot key={i} lx={d.lx} ly={d.ly} width={90}><PxDesk width={90} /></FurnitureSlot>
      ))}
      {chairs.map((c, i) => (
        <FurnitureSlot key={`c${i}`} lx={c.lx} ly={c.ly} width={22} z={4}>
          <PxChair width={22} />
        </FurnitureSlot>
      ))}
      {/* Bookshelves on side walls, away from the wandering corridor */}
      <FurnitureSlot lx={4} ly={50} width={28}><PxBookshelf width={28} /></FurnitureSlot>
      <FurnitureSlot lx={96} ly={50} width={28}><PxBookshelf width={28} /></FurnitureSlot>
    </Group>
  );
}

function BreakFurniture({ room }: { room: Room }) {
  return (
    <Group room={room}>
      <FurnitureSlot lx={50} ly={23} width={220}><PxCouch width={220} /></FurnitureSlot>
      <FurnitureSlot lx={50} ly={68} width={130}><PxCoffeeTable width={130} /></FurnitureSlot>
      <FurnitureSlot lx={9} ly={50} width={56}><PxVending width={56} /></FurnitureSlot>
      <FurnitureSlot lx={91} ly={50} width={56}><PxFridge width={56} /></FurnitureSlot>
      <FurnitureSlot lx={28} ly={50} width={32}><PxCoffeeMachine width={32} /></FurnitureSlot>
      <FurnitureSlot lx={50} ly={6} width={72}><PxTV width={72} /></FurnitureSlot>
      <FurnitureSlot lx={8} ly={92} width={28}><PxSmallPlant width={28} /></FurnitureSlot>
      <FurnitureSlot lx={92} ly={92} width={28}><PxPlant width={28} /></FurnitureSlot>
    </Group>
  );
}
