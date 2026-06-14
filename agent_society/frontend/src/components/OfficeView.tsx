"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { AgentSprite } from "@/components/AgentSprite";
import { Connectome } from "@/components/Connectome";
import { Tile, useAtlasReady } from "@/components/Tile";
import { EditPanel } from "@/components/EditPanel";
import { useEditStore } from "@/lib/editStore";
import { PIECE_BY_KEY } from "@/lib/furnitureCatalog";
import { ROOMS, roomAtOffice, officeToLocal, type Room, type RoomId } from "@/lib/officeLayout";
import { Plant, Sofa, Rug, ConfTable, Chair, Screen, Podium } from "@/components/Furniture";

export function OfficeView() {
  const agents = useAgentStore((s) => s.agents);
  const positions = useAgentStore((s) => s.positions);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const atlasReady = useAtlasReady();

  const init = useEditStore((s) => s.init);
  const editing = useEditStore((s) => s.editing);
  const items = useEditStore((s) => s.items);
  const selectedId = useEditStore((s) => s.selectedId);
  const select = useEditStore((s) => s.select);
  const moveTo = useEditStore((s) => s.moveTo);

  const officeRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [targetRoom, setTargetRoom] = useState<RoomId>("meeting");

  useEffect(() => { init(); }, [init]);

  const officePoint = (e: React.PointerEvent) => {
    const el = officeRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!editing) return;
    const p = officePoint(e);
    if (!p) return;
    const room = roomAtOffice(p.x, p.y);
    if (room) setTargetRoom(room);
    if (dragId.current && room) {
      const loc = officeToLocal(room, p.x, p.y);
      moveTo(dragId.current, room, +loc.lx.toFixed(1), +loc.ly.toFixed(1));
    }
  };

  const itemsByRoom: Record<string, typeof items> = { waiting: [], meeting: [], implementation: [] };
  items.forEach((it) => { (itemsByRoom[it.room] ||= []).push(it); });

  return (
    <div className="h-full w-full p-3" style={{ background: "#0b1220" }}>
      <div
        ref={officeRef}
        onPointerMove={onMove}
        onPointerUp={() => { dragId.current = null; }}
        onPointerLeave={() => { dragId.current = null; }}
        // Items call stopPropagation on pointer-down, so this only fires for
        // clicks on empty floor — i.e. selection HOLDS until you click away.
        onPointerDown={() => { if (editing) select(null); }}
        onClick={() => { selectAgent(null); }}
        className="relative h-full w-full"
        style={{ background: "#1e293b", borderRadius: 8, overflow: "hidden", boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)" }}
      >
        {(Object.values(ROOMS) as Room[]).map((room) => <RoomFloor key={room.id} room={room} />)}

        {atlasReady
          ? (Object.values(ROOMS) as Room[]).map((room) => (
              <div key={`g-${room.id}`} className="absolute"
                style={{ left: `${room.bounds.x}%`, top: `${room.bounds.y}%`, width: `${room.bounds.w}%`, height: `${room.bounds.h}%`, pointerEvents: editing ? "auto" : "none", zIndex: 5 }}>
                {(itemsByRoom[room.id] || []).map((it) => {
                  const p = PIECE_BY_KEY[it.key];
                  if (!p) return null;
                  return (
                    <Tile key={it.id} col={p.col} row={p.row} w={p.w} h={p.h} lx={it.lx} ly={it.ly} z={it.z} mul={it.mul}
                      interactive={editing} selected={selectedId === it.id}
                      onPointerDown={editing ? (e) => { e.stopPropagation(); select(it.id); dragId.current = it.id; } : undefined} />
                  );
                })}
              </div>
            ))
          : (Object.values(ROOMS) as Room[]).map((room) => <ProceduralFurniture key={`pf-${room.id}`} room={room} />)}

        <Connectome />

        {agents.map((agent) => {
          const pos = positions[agent.id];
          if (!pos) return null;
          return <AgentSprite key={agent.id} agent={agent} room={pos.room} lx={pos.lx} ly={pos.ly} />;
        })}

        <EditPanel targetRoom={targetRoom} />
      </div>
    </div>
  );
}

function RoomFloor({ room }: { room: Room }) {
  const b = room.bounds;
  return (
    <div className="absolute"
      style={{
        left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
        background: room.floor, border: "2px solid #0f172a",
        boxShadow: `inset 0 0 0 1px ${room.accent}33, inset 0 6px 24px rgba(15,23,42,0.18)`, borderRadius: 5,
      }}>
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

// Procedural fallback (only when the LimeZu atlas isn't present).
function ProceduralFurniture({ room }: { room: Room }) {
  if (room.id === "meeting") {
    return (
      <Group room={room}>
        <Rug x={50} y={55} w={70} h={60} color="#b9c6d8" />
        <ConfTable x={50} y={54} w={48} h={44} />
        <Plant x={8} y={12} w={7} h={11} />
        <Plant x={92} y={12} w={8} h={12} />
      </Group>
    );
  }
  if (room.id === "implementation") {
    return (
      <Group room={room}>
        <Screen x={50} y={9} w={70} h={16} />
        <Podium x={50} y={24} w={20} h={12} />
        {[34, 54, 74].flatMap((y) => [{ x: 30, y }, { x: 70, y }]).map((c, i) => <Chair key={i} x={c.x} y={c.y} w={14} h={16} />)}
        <Plant x={12} y={86} w={12} h={13} />
      </Group>
    );
  }
  return (
    <Group room={room}>
      <Sofa x={45} y={20} w={34} h={9} />
      <Sofa x={55} y={45} w={34} h={9} />
      <Sofa x={45} y={70} w={34} h={9} />
      <Plant x={80} y={10} w={14} h={8} />
    </Group>
  );
}
