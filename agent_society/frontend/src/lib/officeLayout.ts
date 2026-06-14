// Office layout with single coordinate system, doorways, and pathfinding.
// All positions are % within the OfficeView container.

// Three brain-meeting rooms:
//   meeting        — top-left, where divisions sit (main seats) + summoned regions (ring)
//   implementation — top-right, where regions line up and give their final step
//   waiting        — bottom strip, idle home for all regions
export type RoomId = "waiting" | "meeting" | "implementation";

export interface Room {
  id: RoomId;
  label: string;
  bounds: { x: number; y: number; w: number; h: number };
  floor: string;
  accent: string;
}

export const ROOMS: Record<RoomId, Room> = {
  meeting: {
    id: "meeting",
    label: "MEETING / DISCUSSION",
    bounds: { x: 1, y: 1, w: 63, h: 77 },
    floor:
      "repeating-linear-gradient(0deg, #6b4f30 0 24px, #5d4426 24px 26px), linear-gradient(180deg, #6b4f30, #5d4426)",
    accent: "#f59e0b",
  },
  implementation: {
    id: "implementation",
    label: "IMPLEMENTATION",
    bounds: { x: 66, y: 1, w: 33, h: 77 },
    floor:
      "repeating-linear-gradient(90deg, #4f5d6b 0 26px, #44505d 26px 28px), linear-gradient(180deg, #4f5d6b, #44505d)",
    accent: "#5b8cff",
  },
  waiting: {
    id: "waiting",
    label: "WAITING ROOM",
    bounds: { x: 1, y: 80, w: 98, h: 19 },
    floor:
      "repeating-linear-gradient(90deg, #94774e 0 32px, #826641 32px 34px), linear-gradient(180deg, #94774e, #826641)",
    accent: "#22d3ee",
  },
};

export const WALL_THICKNESS = 1.5; // % of office
// Boundary lines between rooms (used by the door waypoints + room borders).
export const CENTER_VERT_X = 65;   // between meeting and implementation
export const CENTER_HORZ_Y = 79;   // above the waiting strip

// Doorways: waypoints agents pass through when moving between rooms.
export interface Door {
  id: string;
  a: RoomId;
  b: RoomId;
  x: number;
  y: number;
  orient: "v" | "h";
  width: number;
}

export const DOORS: Door[] = [
  { id: "meeting-implementation", a: "meeting", b: "implementation", x: CENTER_VERT_X, y: 38, orient: "v", width: 12 },
  { id: "meeting-waiting",        a: "meeting", b: "waiting",        x: 32, y: CENTER_HORZ_Y, orient: "h", width: 12 },
  { id: "implementation-waiting", a: "implementation", b: "waiting", x: 82, y: CENTER_HORZ_Y, orient: "h", width: 12 },
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
  meeting: [
    { lx: 50, ly: 58, w: 44, h: 30 }, // central discussion table (lower-middle)
  ],
  implementation: [
    { lx: 50, ly: 6, w: 70, h: 10 }, // results board on top wall
  ],
  waiting: [
    { lx: 50, ly: 50, w: 30, h: 10 }, // bench in the middle of the strip
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

// ── Room slot allocation (room-local %) ─────────────────────────────────────
// `slot` = the agent's index among those currently in the room; `count` = how
// many are in the room. The store assigns slots in arrival order, so the three
// level-2 divisions (seated first) take the main seats and summoned regions
// fill the ring below.

const MAIN_SEATS = [
  { lx: 22, ly: 16 }, { lx: 50, ly: 14 }, { lx: 78, ly: 16 },
];

/** Three fixed main seats for the level-2 divisions, across the top. */
export function mainSeat(i: number): { lx: number; ly: number } {
  return MAIN_SEATS[i] ?? { lx: 50, ly: 16 };
}

/** Ring of summon seats around the lower discussion table. */
export function summonSeat(i: number, n: number): { lx: number; ly: number } {
  if (n <= 0) return { lx: 50, ly: 58 };
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return {
    lx: clamp(50 + 38 * Math.cos(angle), 8, 92),
    ly: clamp(60 + 24 * Math.sin(angle), 30, 92),
  };
}

export function roomSlot(room: RoomId, slot: number, count: number): { lx: number; ly: number } {
  if (room === "meeting") {
    if (slot < 3) return mainSeat(slot);
    return summonSeat(slot - 3, Math.max(1, count - 3));
  }
  if (room === "implementation") {
    // Vertical queue, in flow order, top → bottom.
    const n = Math.max(1, count);
    const ly = n === 1 ? 50 : 12 + (slot / (n - 1)) * 76;
    return { lx: 50, ly: clamp(ly, 12, 90) };
  }
  // waiting — a single horizontal row across the strip
  const n = Math.max(1, count);
  const lx = n === 1 ? 50 : 5 + (slot / (n - 1)) * 90;
  return { lx: clamp(lx, 5, 95), ly: 50 };
}

/** Fallback used for the initial placement of an agent with no explicit slot. */
export function getDefaultLocal(agentId: string, room: RoomId): { lx: number; ly: number } {
  return roomSlot(room, indexOf(agentId), total());
}

// Wander only happens in the waiting room (idle home).
export const WANDER_ZONES: Record<RoomId, Array<{ lx: number; ly: number }>> = {
  meeting: [{ lx: 12, ly: 35 }, { lx: 88, ly: 35 }, { lx: 50, ly: 92 }],
  implementation: [{ lx: 20, ly: 50 }, { lx: 80, ly: 50 }],
  waiting: [
    { lx: 12, ly: 35 }, { lx: 30, ly: 65 }, { lx: 50, ly: 35 },
    { lx: 70, ly: 65 }, { lx: 88, ly: 35 }, { lx: 50, ly: 70 },
  ],
};

export function pickWanderSpot(currentRoom: RoomId): { room: RoomId; lx: number; ly: number } {
  // Idle agents only mill around within the waiting room.
  const room: RoomId = currentRoom === "waiting" ? "waiting" : currentRoom;
  const zones = WANDER_ZONES[room] ?? WANDER_ZONES.waiting;
  const spot = zones[Math.floor(Math.random() * zones.length)];
  const jitter = () => (Math.random() - 0.5) * 6;
  return { room, lx: spot.lx + jitter(), ly: spot.ly + jitter() };
}
