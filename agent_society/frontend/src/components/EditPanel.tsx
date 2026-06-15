"use client";

import { useState } from "react";
import { useEditStore } from "@/lib/editStore";
import { CATALOG, PIECE_BY_KEY } from "@/lib/furnitureCatalog";
import { INTERIOR_SHEET } from "@/components/Tile";
import type { RoomId } from "@/lib/officeLayout";

const ATLAS_W = 256, ATLAS_H = 1424;

function Thumb({ pkey, onClick }: { pkey: string; onClick: () => void }) {
  const p = PIECE_BY_KEY[pkey];
  const box = 30;
  const s = box / (Math.max(p.w, p.h) * 16);
  return (
    <button onClick={onClick} title={p.label}
      className="flex flex-col items-center gap-0.5 rounded border border-slate-700 bg-[#0b1018] p-1 hover:border-amber-500">
      <div style={{
        width: p.w * 16 * s, height: p.h * 16 * s,
        backgroundImage: `url("${INTERIOR_SHEET}")`, backgroundRepeat: "no-repeat",
        backgroundSize: `${ATLAS_W * s}px ${ATLAS_H * s}px`,
        backgroundPosition: `${-p.col * 16 * s}px ${-p.row * 16 * s}px`,
        imageRendering: "pixelated",
      }} />
      <span className="max-w-[58px] truncate text-[8px] text-slate-400">{p.label}</span>
    </button>
  );
}

export function EditPanel({ targetRoom }: { targetRoom: RoomId }) {
  const editing = useEditStore((s) => s.editing);
  const setEditing = useEditStore((s) => s.setEditing);
  const add = useEditStore((s) => s.add);
  const scale = useEditStore((s) => s.scale);
  const rotate = useEditStore((s) => s.rotate);
  const flip = useEditStore((s) => s.flip);
  const bump = useEditStore((s) => s.bump);
  const remove = useEditStore((s) => s.remove);
  const resetDefault = useEditStore((s) => s.resetDefault);
  const exportJSON = useEditStore((s) => s.exportJSON);
  const selectedId = useEditStore((s) => s.selectedId);
  const items = useEditStore((s) => s.items);
  const [copied, setCopied] = useState(false);

  const sel = items.find((it) => it.id === selectedId) || null;

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className="absolute top-2 left-2 z-40 rounded bg-amber-500 px-3 py-1 text-[11px] font-semibold text-black shadow">
        ✎ Edit office
      </button>
    );
  }

  const onExport = async () => {
    const json = exportJSON();
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { console.log(json); }
  };

  return (
    <div
      // Keep interactions inside the panel from bubbling to the office floor,
      // which would otherwise deselect the piece on pointer-down before a
      // button's click (so resize / rotate / etc. would silently do nothing).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-2 left-2 z-40 flex max-h-[94%] w-64 flex-col gap-2 rounded-lg border border-slate-700 bg-black/85 p-2 text-slate-200">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">Office editor</span>
        <button onClick={() => setEditing(false)} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-black">Done</button>
      </div>

      <div className="text-[9px] leading-snug text-slate-400">
        Click a piece below to add it to <b className="text-amber-300">{targetRoom}</b>, then
        <b className="text-amber-300"> drag</b> it anywhere. Click a placed piece to select it.
      </div>

      {sel ? (
        <div className="rounded border border-amber-700/60 bg-amber-950/30 p-1.5">
          <div className="mb-1 text-[10px] text-amber-300">Selected: {PIECE_BY_KEY[sel.key]?.label}</div>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <Btn onClick={() => scale(sel.id, -0.2)}>−</Btn>
            <span className="w-8 text-center tabular-nums">{sel.mul.toFixed(1)}×</span>
            <Btn onClick={() => scale(sel.id, 0.2)}>+</Btn>
            <Btn onClick={() => rotate(sel.id, 90)}>↻ rotate</Btn>
            <Btn onClick={() => flip(sel.id)}>⇄ flip</Btn>
            <Btn onClick={() => bump(sel.id, -1)}>↓z</Btn>
            <Btn onClick={() => bump(sel.id, 1)}>↑z</Btn>
            <Btn onClick={() => remove(sel.id)} danger>🗑 delete</Btn>
          </div>
          <div className="mt-1 text-[8px] leading-snug text-slate-400">
            Keys: <b>arrows</b> move (Shift = faster) · <b>R</b> rotate · <b>F</b> flip ·
            <b> [ ]</b> resize · <b>, .</b> stacking · <b>Del</b> remove · <b>Esc</b> deselect
          </div>
        </div>
      ) : (
        <div className="rounded border border-slate-700 bg-slate-900/50 p-1.5 text-[9px] text-slate-400">
          Select a placed piece to move, rotate (R), flip (F) or resize it.
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 overflow-y-auto pr-1">
        {CATALOG.map((p) => <Thumb key={p.key} pkey={p.key} onClick={() => add(p.key, targetRoom)} />)}
      </div>

      <div className="flex gap-1">
        <button onClick={onExport} className="flex-1 rounded bg-sky-600 py-1 text-[10px] font-semibold text-white hover:bg-sky-500">
          {copied ? "copied ✓" : "Export layout"}
        </button>
        <button onClick={resetDefault} className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:border-red-500">Reset</button>
      </div>
    </div>
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-[10px] ${danger ? "bg-red-700 text-white" : "bg-slate-700 text-slate-100 hover:bg-slate-600"}`}>
      {children}
    </button>
  );
}
