import { create } from "zustand";
import type { RoomId } from "@/lib/officeLayout";
import { defaultLayout, newId, type PlacedItem } from "@/lib/furnitureCatalog";

const KEY = "office_layout_v5";

function load(): PlacedItem[] {
  if (typeof window === "undefined") return defaultLayout();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return defaultLayout();
}

function save(items: PlacedItem[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

interface EditState {
  editing: boolean;
  items: PlacedItem[];
  selectedId: string | null;
  loaded: boolean;

  init: () => void;
  setEditing: (on: boolean) => void;
  select: (id: string | null) => void;
  add: (key: string, room: RoomId) => void;
  moveTo: (id: string, room: RoomId, lx: number, ly: number) => void;
  nudge: (id: string, dlx: number, dly: number) => void;
  scale: (id: string, delta: number) => void;
  rotate: (id: string, ddeg: number) => void;
  flip: (id: string) => void;
  bump: (id: string, dz: number) => void;
  remove: (id: string) => void;
  resetDefault: () => void;
  exportJSON: () => string;
}

export const useEditStore = create<EditState>((set, get) => ({
  editing: false,
  items: [],
  selectedId: null,
  loaded: false,

  init: () => { if (!get().loaded) set({ items: load(), loaded: true }); },
  setEditing: (editing) => set({ editing, selectedId: editing ? get().selectedId : null }),
  select: (selectedId) => set({ selectedId }),

  add: (key, room) => {
    const item: PlacedItem = { id: newId(), key, room, lx: 50, ly: 50, mul: 1, z: 6 };
    const items = [...get().items, item];
    save(items);
    set({ items, selectedId: item.id });
  },

  moveTo: (id, room, lx, ly) => {
    const items = get().items.map((it) => it.id === id ? { ...it, room, lx, ly } : it);
    save(items); set({ items });
  },

  nudge: (id, dlx, dly) => {
    const items = get().items.map((it) =>
      it.id === id
        ? { ...it, lx: +Math.max(0, Math.min(100, it.lx + dlx)).toFixed(1), ly: +Math.max(0, Math.min(100, it.ly + dly)).toFixed(1) }
        : it);
    save(items); set({ items });
  },

  scale: (id, delta) => {
    const items = get().items.map((it) => it.id === id ? { ...it, mul: Math.max(0.3, Math.min(8, +(it.mul + delta).toFixed(2))) } : it);
    save(items); set({ items });
  },

  rotate: (id, ddeg) => {
    const items = get().items.map((it) => it.id === id ? { ...it, rot: (((it.rot ?? 0) + ddeg) % 360 + 360) % 360 } : it);
    save(items); set({ items });
  },

  flip: (id) => {
    const items = get().items.map((it) => it.id === id ? { ...it, flip: !it.flip } : it);
    save(items); set({ items });
  },

  bump: (id, dz) => {
    const items = get().items.map((it) => it.id === id ? { ...it, z: Math.max(1, Math.min(20, it.z + dz)) } : it);
    save(items); set({ items });
  },

  remove: (id) => {
    const items = get().items.filter((it) => it.id !== id);
    save(items); set({ items, selectedId: null });
  },

  resetDefault: () => {
    const items = defaultLayout();
    save(items); set({ items, selectedId: null });
  },

  exportJSON: () => JSON.stringify(get().items, null, 2),
}));
