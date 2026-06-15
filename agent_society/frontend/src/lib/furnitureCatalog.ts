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
  rot?: number;      // rotation in degrees (0/90/180/270)
  flip?: boolean;    // mirrored horizontally
}

let _idc = 0;
const nid = () => `it_${Date.now().toString(36)}_${_idc++}`;

// The starting arrangement (what the editor opens with). This is the layout the
// user arranged in the in-app editor and exported; the user can keep dragging /
// rotating / scaling from here and it persists to localStorage.
export function defaultLayout(): PlacedItem[] {
  const mk = (
    room: RoomId, key: string, lx: number, ly: number, mul: number, z: number,
    extra: Partial<PlacedItem> = {},
  ): PlacedItem => ({ id: nid(), key, room, lx, ly, mul, z, ...extra });

  return [
    // ── meeting ──
    mk("meeting", "windowF", 28, 5, 1, 5),
    mk("meeting", "windowF", 72, 5, 1, 5),
    mk("meeting", "fire", 49.6, 5.5, 1.2, 5, { flip: true }),
    mk("meeting", "table", 56, 30.1, 2.5, 3),
    mk("meeting", "globe", 35.8, 26.1, 1, 6),
    mk("meeting", "vending", 10.3, 29.1, 1, 6),
    mk("meeting", "deskMon", 82.8, 12.6, 1, 6),
    mk("meeting", "filing", 93.4, 4.6, 1, 6),
    mk("meeting", "palm", 5, 20, 1, 5),
    mk("meeting", "palm", 95, 20, 1, 5),
    mk("meeting", "bookshelf", 8, 46, 1, 5),
    mk("meeting", "rugRed", 30.9, 63.5, 2.4, 6),
    mk("meeting", "rugRed", 72.1, 63.5, 2.4, 6, { flip: true }),
    mk("meeting", "lamp", 16, 69.9, 1, 6),
    mk("meeting", "plant", 5, 86, 1, 5),
    mk("meeting", "plant", 96.1, 85.4, 1, 5, { flip: true }),
    mk("meeting", "plant", 90.5, 85.4, 1, 5),
    mk("meeting", "plant", 10.6, 85.9, 1, 5, { flip: true }),
    mk("meeting", "sofaTan", 26.6, 92.2, 1, 6),
    mk("meeting", "sofaTan", 43.1, 92.2, 1, 6, { flip: true }),
    mk("meeting", "sofaPink", 74.1, 93.3, 1, 6),

    // ── implementation ──
    mk("implementation", "blackbd", 29.6, 13.4, 1, 6),
    mk("implementation", "blackbd", 51.6, 13.4, 1, 6, { flip: true }),
    mk("implementation", "filing", 87.9, 5.2, 1, 6),
    mk("implementation", "deskMon", 50, 28, 1.2, 5),
    mk("implementation", "lamp", 33.5, 26, 1, 5),
    mk("implementation", "bookshelf", 13, 40, 1, 5),
    mk("implementation", "woodCab", 88, 40, 1, 5),
    mk("implementation", "woodCab", 77, 40, 1, 5, { flip: true }),
    mk("implementation", "rugGreen", 50, 56, 1.8, 2),
    mk("implementation", "palm", 13, 86, 1, 5),
    mk("implementation", "sofaGrey", 25.3, 90.8, 1, 6),
    mk("implementation", "sofaGrey", 79.2, 90.3, 1, 6),

    // ── waiting ──
    mk("waiting", "vending", 28, 8, 1, 5),
    mk("waiting", "plant", 75, 8, 1, 5),
    mk("waiting", "sideTbl", 25, 26, 1, 5),
    mk("waiting", "lamp", 76, 26, 1, 5),
    mk("waiting", "plant", 25, 44, 1, 5),
    mk("waiting", "chairTan", 75, 44, 1, 5),
    mk("waiting", "sideTbl", 85, 86, 1, 5),
    mk("waiting", "sideTbl", 65, 86, 1, 6, { flip: true }),
  ];
}

export { nid as newId };
