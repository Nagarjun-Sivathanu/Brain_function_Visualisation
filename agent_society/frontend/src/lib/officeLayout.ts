// Office layout with single coordinate system, doorways, and pathfinding.
// All positions are % within the OfficeView container.

export type RoomId = "lobby" | "meeting" | "desks" | "break";

export interface Room {
  id: RoomId;
  label: string;
  bounds: { x: number; y: number; w: number; h: number };
  floor: string;
  accent: string;
}

// Office is divided into 4 rooms by a central wall cross at x=60, y=50.
// Door gaps cut into those walls.
export const ROOMS: Record<RoomId, Room> = {
  lobby: {
    id: "lobby",
    label: "LOBBY",
    bounds: { x: 1, y: 1, w: 58, h: 48 },
    floor:
      "repeating-linear-gradient(90deg, #8b6f47 0 28px, #7a5f3d 28px 30px), linear-gradient(180deg, #8b6f47, #7a5f3d)",
    accent: "#facc15",
  },
  meeting: {
    id: "meeting",
    label: "MEETING ROOM",
    bounds: { x: 61, y: 1, w: 38, h: 48 },
    floor:
      "repeating-linear-gradient(0deg, #6b4f30 0 24px, #5d4426 24px 26px), linear-gradient(180deg, #6b4f30, #5d4426)",
    accent: "#f59e0b",
  },
  desks: {
    id: "desks",
    label: "DESK AREA",
    bounds: { x: 1, y: 51, w: 58, h: 48 },
    floor:
      "repeating-linear-gradient(90deg, #94774e 0 32px, #826641 32px 34px), linear-gradient(180deg, #94774e, #826641)",
    accent: "#22d3ee",
  },
  break: {
    id: "break",
    label: "BREAK ROOM",
    bounds: { x: 61, y: 51, w: 38, h: 48 },
    floor:
      "repeating-conic-gradient(#a08060 0 25%, #8b6b4a 0 50%) 0 0 / 36px 36px, linear-gradient(180deg, #a08060, #8b6b4a)",
    accent: "#f472b6",
  },
};

// Wall config: center cross divides office into 4 rooms.
export const WALL_THICKNESS = 1.5; // % of office
export const CENTER_VERT_X = 60;
export const CENTER_HORZ_Y = 50;

// Doorways: gaps in the central walls. Each door is a waypoint between 2 rooms.
export interface Door {
  id: string;
  a: RoomId;
  b: RoomId;
  /** Office coords for the door's center (the waypoint agents pass through) */
  x: number;
  y: number;
  /** Orientation of the door: vertical wall = "v", horizontal wall = "h" */
  orient: "v" | "h";
  /** Width of the door gap in % */
  width: number;
}

export const DOORS: Door[] = [
  { id: "lobby-meeting", a: "lobby",   b: "meeting", x: CENTER_VERT_X, y: 25, orient: "v", width: 8 },
  { id: "lobby-desks",   a: "lobby",   b: "desks",   x: 30, y: CENTER_HORZ_Y, orient: "h", width: 8 },
  { id: "meeting-break", a: "meeting", b: "break",   x: 80, y: CENTER_HORZ_Y, orient: "h", width: 8 },
  { id: "desks-break",   a: "desks",   b: "break",   x: CENTER_VERT_X, y: 75, orient: "v", width: 8 },
];

function doorBetween(a: RoomId, b: RoomId): Door | undefined {
  return DOORS.find(
    (d) => (d.a === a && d.b === b) || (d.a === b && d.b === a),
  );
}

/** Convert a room-local position (0-100%) to an absolute office % position. */
export function toOffice(room: RoomId, lx: number, ly: number): { x: number; y: number } {
  const b = ROOMS[room].bounds;
  return { x: b.x + (lx / 100) * b.w, y: b.y + (ly / 100) * b.h };
}

// Room-local obstacle rectangles (0-100%). Used to route AROUND furniture.
// Each entry: { lx, ly, w, h } — center coords + size.
const ROOM_OBSTACLES: Record<RoomId, Array<{ lx: number; ly: number; w: number; h: number }>> = {
  lobby: [
    { lx: 75, ly: 15, w: 32, h: 14 }, // reception desk
  ],
  meeting: [
    { lx: 50, ly: 50, w: 52, h: 58 }, // big oval table (boxed)
  ],
  desks: [
    // Desks now flush against top/bottom walls so agents sit in front of them
    { lx: 18, ly: 12, w: 22, h: 16 }, { lx: 50, ly: 12, w: 22, h: 16 }, { lx: 82, ly: 12, w: 22, h: 16 },
    { lx: 18, ly: 88, w: 22, h: 16 }, { lx: 50, ly: 88, w: 22, h: 16 }, { lx: 82, ly: 88, w: 22, h: 16 },
    // Bookshelves on side walls — avoid wandering into them
    { lx: 4, ly: 50, w: 8, h: 18 }, { lx: 96, ly: 50, w: 8, h: 18 },
  ],
  break: [
    { lx: 50, ly: 23, w: 62, h: 18 }, // couch
    { lx: 50, ly: 68, w: 38, h: 18 }, // coffee table
    { lx: 9,  ly: 50, w: 12, h: 38 }, // vending
    { lx: 91, ly: 50, w: 12, h: 38 }, // fridge
  ],
};

/** Test if a room-local point is inside any furniture obstacle. */
function isObstructed(room: RoomId, lx: number, ly: number): boolean {
  for (const o of ROOM_OBSTACLES[room]) {
    if (
      lx >= o.lx - o.w / 2 && lx <= o.lx + o.w / 2 &&
      ly >= o.ly - o.h / 2 && ly <= o.ly + o.h / 2
    ) return true;
  }
  return false;
}

/** Test if the straight line from A to B in a room crosses any obstacle. */
function segmentCrossesObstacle(room: RoomId, a: { lx: number; ly: number }, b: { lx: number; ly: number }): boolean {
  // Sample 12 points along the segment
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.lx + (b.lx - a.lx) * t;
    const y = a.ly + (b.ly - a.ly) * t;
    if (isObstructed(room, x, y)) return true;
  }
  return false;
}

/** Route around obstacles within a single room — adds perimeter waypoints if direct path crosses furniture. */
function intraRoomPath(
  room: RoomId,
  from: { lx: number; ly: number },
  to: { lx: number; ly: number },
): Array<{ lx: number; ly: number }> {
  if (!segmentCrossesObstacle(room, from, to)) {
    return [from, to];
  }
  // Try 4 perimeter corner waypoints; pick the one whose A→C and C→B are both clear,
  // with shortest total distance.
  const corners = [
    { lx: 8, ly: 8 }, { lx: 92, ly: 8 },
    { lx: 8, ly: 92 }, { lx: 92, ly: 92 },
  ];
  let best: { path: Array<{ lx: number; ly: number }>; dist: number } | null = null;
  for (const c of corners) {
    if (
      !segmentCrossesObstacle(room, from, c) &&
      !segmentCrossesObstacle(room, c, to)
    ) {
      const d = Math.hypot(c.lx - from.lx, c.ly - from.ly) + Math.hypot(to.lx - c.lx, to.ly - c.ly);
      if (!best || d < best.dist) best = { path: [from, c, to], dist: d };
    }
  }
  if (best) return best.path;

  // Fallback: try two-corner detour (down + across)
  for (const c1 of corners) {
    if (segmentCrossesObstacle(room, from, c1)) continue;
    for (const c2 of corners) {
      if (c1 === c2) continue;
      if (segmentCrossesObstacle(room, c1, c2)) continue;
      if (segmentCrossesObstacle(room, c2, to)) continue;
      const d = Math.hypot(c1.lx - from.lx, c1.ly - from.ly)
        + Math.hypot(c2.lx - c1.lx, c2.ly - c1.ly)
        + Math.hypot(to.lx - c2.lx, to.ly - c2.ly);
      if (!best || d < best.dist) best = { path: [from, c1, c2, to], dist: d };
    }
  }
  return best ? best.path : [from, to];
}

// Convert absolute office position to room-local %
function toLocal(room: RoomId, x: number, y: number): { lx: number; ly: number } {
  const b = ROOMS[room].bounds;
  return { lx: ((x - b.x) / b.w) * 100, ly: ((y - b.y) / b.h) * 100 };
}

// Convert a per-room intra-path (local %) to absolute office coords, walked end-to-end
function walkRoomSegment(
  room: RoomId,
  fromAbs: { x: number; y: number },
  toAbs: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const fromLocal = toLocal(room, fromAbs.x, fromAbs.y);
  const toLocal_ = toLocal(room, toAbs.x, toAbs.y);
  const local = intraRoomPath(room, fromLocal, toLocal_);
  return local.map((p) => toOffice(room, p.lx, p.ly));
}

/** Build the waypoint path from room A to room B (in absolute office coords).
 *  Optional `routeHint` (a string — usually the agent id) deterministically
 *  picks among the available intermediate rooms for diagonal paths, so
 *  different agents naturally take different routes instead of all funnelling
 *  through the same intermediate room. */
export function findPath(
  fromRoom: RoomId,
  fromXY: { x: number; y: number },
  toRoom: RoomId,
  toXY: { x: number; y: number },
  routeHint?: string,
): Array<{ x: number; y: number }> {
  if (fromRoom === toRoom) {
    return walkRoomSegment(fromRoom, fromXY, toXY);
  }

  const direct = doorBetween(fromRoom, toRoom);
  if (direct) {
    const step = 2;
    const inFrom = direct.orient === "v"
      ? { x: fromRoom === direct.a ? direct.x - step : direct.x + step, y: direct.y }
      : { x: direct.x, y: fromRoom === direct.a ? direct.y - step : direct.y + step };
    const doorPt = { x: direct.x, y: direct.y };
    const inTo = direct.orient === "v"
      ? { x: toRoom === direct.a ? direct.x - step : direct.x + step, y: direct.y }
      : { x: direct.x, y: toRoom === direct.a ? direct.y - step : direct.y + step };

    return [
      ...walkRoomSegment(fromRoom, fromXY, inFrom),
      doorPt,
      ...walkRoomSegment(toRoom, inTo, toXY),
    ];
  }

  // Diagonal: via intermediate room
  const intermediates = (Object.keys(ROOMS) as RoomId[]).filter(
    (r) => r !== fromRoom && r !== toRoom &&
      doorBetween(fromRoom, r) && doorBetween(r, toRoom),
  );
  if (intermediates.length === 0) return walkRoomSegment(fromRoom, fromXY, toXY);

  // Distribute traffic: deterministically pick via routeHint's char codes so
  // agents going from the same room to the same room split across the
  // available intermediates instead of all using intermediates[0].
  let pickIdx = 0;
  if (routeHint && intermediates.length > 1) {
    let h = 0;
    for (let i = 0; i < routeHint.length; i++) h = (h * 31 + routeHint.charCodeAt(i)) | 0;
    pickIdx = Math.abs(h) % intermediates.length;
  }
  const via = intermediates[pickIdx];
  const door1 = doorBetween(fromRoom, via)!;
  const door2 = doorBetween(via, toRoom)!;
  const step = 2;
  const inFrom1 = door1.orient === "v"
    ? { x: fromRoom === door1.a ? door1.x - step : door1.x + step, y: door1.y }
    : { x: door1.x, y: fromRoom === door1.a ? door1.y - step : door1.y + step };
  const inVia1 = door1.orient === "v"
    ? { x: via === door1.a ? door1.x - step : door1.x + step, y: door1.y }
    : { x: door1.x, y: via === door1.a ? door1.y - step : door1.y + step };
  const inVia2 = door2.orient === "v"
    ? { x: via === door2.a ? door2.x - step : door2.x + step, y: door2.y }
    : { x: door2.x, y: via === door2.a ? door2.y - step : door2.y + step };
  const inTo2 = door2.orient === "v"
    ? { x: toRoom === door2.a ? door2.x - step : door2.x + step, y: door2.y }
    : { x: door2.x, y: toRoom === door2.a ? door2.y - step : door2.y + step };

  return [
    ...walkRoomSegment(fromRoom, fromXY, inFrom1),
    { x: door1.x, y: door1.y },
    ...walkRoomSegment(via, inVia1, inVia2),
    { x: door2.x, y: door2.y },
    ...walkRoomSegment(toRoom, inTo2, toXY),
  ];
}

// ── Default positions per room (computed for N agents) ──────────────────────
//
// The original app hard-coded six seats. This edition has a variable roster
// (13 brain regions), so positions are generated from the agent's index in a
// registered order. Register the roster once (the agent store does this) and
// every layout query is derived by index + total — no overlap regardless of N.

let _agentOrder: string[] = [];

/** Called once by the agent store after agents load, so layout math knows the
 *  full roster and each agent's stable index. */
export function registerAgentOrder(ids: string[]): void {
  _agentOrder = [...ids];
}

function indexOf(agentId: string): number {
  const i = _agentOrder.indexOf(agentId);
  return i >= 0 ? i : 0;
}
function total(): number {
  return Math.max(1, _agentOrder.length);
}

/** Seats around the oval meeting table — points on an ellipse, evenly spaced. */
export function meetingSeat(i: number, n: number): { lx: number; ly: number } {
  const rx = 40, ry = 42; // local % radii around table centre (50,50)
  const angle = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2; // start at top
  return {
    lx: clamp(50 + rx * Math.cos(angle), 6, 94),
    ly: clamp(50 + ry * Math.sin(angle), 8, 92),
  };
}

/** Evenly spaced points on the same ellipse but a touch further out — used to
 *  draw chairs just behind each seat. */
export function meetingChair(i: number, n: number): { lx: number; ly: number } {
  const rx = 46, ry = 48;
  const angle = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
  return {
    lx: clamp(50 + rx * Math.cos(angle), 4, 96),
    ly: clamp(50 + ry * Math.sin(angle), 4, 96),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** A grid spot inside the [marginX..100-marginX] × [yTop..yBottom] box. Two
 *  banded rows (top + bottom) keep the open centre corridor walkable. */
function gridSpot(
  i: number, n: number,
  opts: { cols?: number; bandTop?: number; bandBottom?: number; marginX?: number } = {},
): { lx: number; ly: number } {
  const marginX = opts.marginX ?? 16;
  const bandTop = opts.bandTop ?? 26;
  const bandBottom = opts.bandBottom ?? 74;
  const perRow = opts.cols ?? Math.ceil(n / 2);
  const row = Math.floor(i / perRow);      // 0 = top band, 1 = bottom band, …
  const col = i % perRow;
  const span = 100 - marginX * 2;
  const lx = perRow === 1 ? 50 : marginX + (col / (perRow - 1)) * span;
  const ly = row % 2 === 0 ? bandTop : bandBottom;
  return { lx, ly };
}

// ── Wander zones: only walkable corridors, NO furniture overlap ─────────────
// These are picked from real floor space in each room.
export const WANDER_ZONES: Record<RoomId, Array<{ lx: number; ly: number }>> = {
  lobby: [
    { lx: 20, ly: 45 }, { lx: 35, ly: 60 }, { lx: 50, ly: 70 },
    { lx: 20, ly: 85 }, { lx: 40, ly: 85 }, { lx: 35, ly: 50 },
  ],
  meeting: [
    // Around the table perimeter only — no center
    { lx: 12, ly: 35 }, { lx: 12, ly: 65 }, { lx: 88, ly: 35 }, { lx: 88, ly: 65 },
    { lx: 50, ly: 95 }, { lx: 25, ly: 95 }, { lx: 75, ly: 95 },
  ],
  desks: [
    // Open middle of the room (between the two desk rows)
    { lx: 30, ly: 45 }, { lx: 50, ly: 45 }, { lx: 70, ly: 45 },
    { lx: 30, ly: 55 }, { lx: 50, ly: 55 }, { lx: 70, ly: 55 },
    { lx: 40, ly: 50 }, { lx: 60, ly: 50 },
  ],
  break: [
    // Avoid couch, coffee table, vending, fridge
    { lx: 28, ly: 50 }, { lx: 72, ly: 50 }, { lx: 50, ly: 45 },
    { lx: 28, ly: 92 }, { lx: 72, ly: 92 }, { lx: 50, ly: 92 },
  ],
};

export function getDefaultLocal(
  agentId: string,
  room: RoomId,
): { lx: number; ly: number } {
  const i = indexOf(agentId);
  const n = total();
  if (room === "meeting") return meetingSeat(i, n);
  if (room === "break") {
    return gridSpot(i, n, { bandTop: 45, bandBottom: 90, marginX: 24 });
  }
  if (room === "desks") {
    return gridSpot(i, n, { bandTop: 28, bandBottom: 72, marginX: 14 });
  }
  // lobby
  return gridSpot(i, n, { bandTop: 50, bandBottom: 80, marginX: 22 });
}

export function pickWanderSpot(currentRoom: RoomId): {
  room: RoomId;
  lx: number;
  ly: number;
} {
  let room: RoomId = currentRoom;
  if (Math.random() < 0.35) {
    const others = (Object.keys(ROOMS) as RoomId[]).filter((r) => r !== currentRoom);
    room = others[Math.floor(Math.random() * others.length)];
  }
  const zones = WANDER_ZONES[room];
  const spot = zones[Math.floor(Math.random() * zones.length)];
  const jitter = () => (Math.random() - 0.5) * 6;
  return { room, lx: spot.lx + jitter(), ly: spot.ly + jitter() };
}
