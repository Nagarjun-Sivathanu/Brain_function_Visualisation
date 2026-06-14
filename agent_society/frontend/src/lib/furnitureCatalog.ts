import type { RoomId } from "@/lib/officeLayout";

// Every piece here has been visually verified as a WHOLE crop (no half tiles).
// col,row = top-left tile in the interiors atlas; w,h = size in tiles.
export interface Piece {
  key: string;
  label: string;
  col: number; row: number; w: number; h: number;
  mul: number;   // default scale multiplier
}

export const CATALOG: Piece[] = [
  { key: "table", label: "Boardroom table", col: 2, row: 36, w: 4, h: 2, mul: 2.6 },
  { key: "chairRed", label: "Chair (red)", col: 9, row: 31, w: 1, h: 2, mul: 1 },
  { key: "chairBrown", label: "Chair (wood)", col: 11, row: 31, w: 1, h: 2, mul: 1 },
  { key: "chairTan", label: "Chair (tan)", col: 13, row: 31, w: 1, h: 2, mul: 1 },
  { key: "sofaGrey", label: "Sofa (grey)", col: 1, row: 72, w: 3, h: 2, mul: 1 },
  { key: "sofaWhite", label: "Sofa (white)", col: 4, row: 72, w: 3, h: 2, mul: 1 },
  { key: "sofaTan", label: "Sofa (tan)", col: 7, row: 72, w: 3, h: 2, mul: 1 },
  { key: "sofaPink", label: "Couch (pink)", col: 8, row: 18, w: 2, h: 2, mul: 1 },
  { key: "palm", label: "Palm tree", col: 13, row: 44, w: 2, h: 3, mul: 1 },
  { key: "plant", label: "Plant", col: 10, row: 44, w: 1, h: 2, mul: 1 },
  { key: "bookshelf", label: "Bookshelf", col: 10, row: 68, w: 2, h: 3, mul: 1 },
  { key: "woodCab", label: "Cabinet", col: 8, row: 48, w: 1, h: 3, mul: 1 },
  { key: "deskMon", label: "Desk + monitor", col: 10, row: 40, w: 2, h: 2, mul: 1.2 },
  { key: "blackbd", label: "Board", col: 10, row: 38, w: 2, h: 2, mul: 1.2 },
  { key: "map", label: "World map", col: 10, row: 67, w: 2, h: 1, mul: 1.2 },
  { key: "globe", label: "Globe", col: 13, row: 36, w: 1, h: 2, mul: 1 },
  { key: "lamp", label: "Lamp", col: 13, row: 53, w: 1, h: 2, mul: 1 },
  { key: "filing", label: "Filing cabinet", col: 1, row: 16, w: 2, h: 2, mul: 1 },
  { key: "rugRed", label: "Rug (ornate)", col: 7, row: 15, w: 3, h: 3, mul: 3 },
  { key: "rugGreen", label: "Rug (green)", col: 0, row: 42, w: 3, h: 2, mul: 2 },
  { key: "vending", label: "Vending machine", col: 3, row: 18, w: 1, h: 3, mul: 1 },
  { key: "fire", label: "Fireplace", col: 4, row: 69, w: 3, h: 2, mul: 1.2 },
  { key: "sideTbl", label: "Side table", col: 4, row: 55, w: 1, h: 2, mul: 1 },
  { key: "mirror", label: "Mirror", col: 3, row: 67, w: 1, h: 3, mul: 1 },
  { key: "tv", label: "TV console", col: 12, row: 79, w: 2, h: 2, mul: 1.2 },
  { key: "windowF", label: "Window", col: 7, row: 24, w: 1, h: 2, mul: 1 },
];

export const PIECE_BY_KEY: Record<string, Piece> = Object.fromEntries(CATALOG.map((p) => [p.key, p]));

export interface PlacedItem {
  id: string;
  key: string;       // catalog key
  room: RoomId;
  lx: number; ly: number; // room-local %
  mul: number;
  z: number;
}

let _idc = 0;
const nid = () => `it_${Date.now().toString(36)}_${_idc++}`;

function place(room: RoomId, key: string, lx: number, ly: number, z = 5, mul?: number): PlacedItem {
  return { id: nid(), key, room, lx, ly, mul: mul ?? PIECE_BY_KEY[key].mul, z };
}

// The starting arrangement (what the editor opens with). Mirrors the coded
// layout; the user can drag/scale/delete from here and it persists.
export function defaultLayout(): PlacedItem[] {
  const items: PlacedItem[] = [];
  // meeting centrepiece (chairs are rendered dynamically under each seated region)
  items.push(place("meeting", "rugRed", 50, 52, 2, 3.6));
  items.push(place("meeting", "table", 50, 52, 3, 2.6));
  // meeting walls
  items.push(place("meeting", "blackbd", 50, 6));
  items.push(place("meeting", "windowF", 30, 5));
  items.push(place("meeting", "windowF", 70, 5));
  items.push(place("meeting", "bookshelf", 6, 26));
  items.push(place("meeting", "filing", 7, 50));
  items.push(place("meeting", "deskMon", 8, 75));
  items.push(place("meeting", "bookshelf", 94, 26));
  items.push(place("meeting", "woodCab", 95, 52));
  items.push(place("meeting", "globe", 93, 74));
  items.push(place("meeting", "palm", 10, 93));
  items.push(place("meeting", "palm", 90, 93));
  // implementation
  items.push(place("implementation", "blackbd", 50, 9, 5, 1.8));
  items.push(place("implementation", "rugGreen", 50, 56, 2, 1.8));
  items.push(place("implementation", "bookshelf", 13, 40));
  items.push(place("implementation", "woodCab", 88, 40));
  items.push(place("implementation", "deskMon", 50, 28));
  items.push(place("implementation", "palm", 13, 86));
  items.push(place("implementation", "plant", 87, 86));
  items.push(place("implementation", "lamp", 50, 93));
  // waiting corridor
  items.push(place("waiting", "vending", 28, 8));
  items.push(place("waiting", "plant", 75, 8));
  items.push(place("waiting", "sideTbl", 25, 26));
  items.push(place("waiting", "lamp", 76, 26));
  items.push(place("waiting", "plant", 25, 44));
  items.push(place("waiting", "chairTan", 75, 44));
  items.push(place("waiting", "sideTbl", 25, 62));
  items.push(place("waiting", "mirror", 78, 64));
  items.push(place("waiting", "plant", 25, 82));
  items.push(place("waiting", "fire", 60, 88));
  return items;
}

export { nid as newId };
