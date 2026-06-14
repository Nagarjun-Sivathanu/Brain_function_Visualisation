"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { useIdleWander } from "@/lib/useIdleWander";
import { fetchAgents } from "@/lib/api";
import { OfficeView } from "@/components/OfficeView";
import { CommPanel } from "@/components/CommPanel";
import { ControlBar } from "@/components/ControlBar";
import { TerminalView } from "@/components/TerminalView";
import { useUiStore } from "@/lib/uiStore";
import type { Agent } from "@/types/agent";

export default function Home() {
  const setAgents = useAgentStore((s) => s.setAgents);
  const agents = useAgentStore((s) => s.agents);
  const leftView = useUiStore((s) => s.leftView);
  const maxLevel = useUiStore((s) => s.maxLevel);

  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [rightWidth, setRightWidth] = useState(560);
  const draggingRef = useRef(false);

  // Load the full roster once (with retry/backoff while the backend warms up).
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const load = async () => {
      while (!cancelled) {
        try {
          const list = await fetchAgents();
          if (cancelled) return;
          if (Array.isArray(list) && list.length > 0) { setAllAgents(list); return; }
          throw new Error("empty agents");
        } catch (err) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** Math.min(attempt, 5), 8000)));
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Show only regions up to the chosen depth; raising the level re-adds the
  // deeper ones, lowering it removes them.
  useEffect(() => {
    if (allAgents.length === 0) return;
    const shown = allAgents.filter((a) => (a.level ?? 3) <= maxLevel);
    setAgents(shown.length > 0 ? shown : allAgents);
  }, [allAgents, maxLevel, setAgents]);

  useIdleWander();

  // Sidebar resize
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const w = Math.max(360, Math.min(900, window.innerWidth - e.clientX));
      setRightWidth(w);
    };
    const up = () => { draggingRef.current = false; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <section className="relative min-w-0 flex-1 bg-[#0b1220] overflow-hidden">
        <div className="absolute top-3 left-6 z-30 text-[10px] text-slate-300/80">
          BRAIN REGION SOCIETY · {agents.length} regions
        </div>
        <ControlBar />
        {leftView === "office" ? <OfficeView /> : <TerminalView />}
      </section>

      <div
        onMouseDown={() => { draggingRef.current = true; document.body.style.userSelect = "none"; }}
        className="w-1.5 cursor-col-resize bg-[#0f172a] hover:bg-sky-600 transition-colors"
        title="Drag to resize"
      />

      <section
        className="flex flex-col bg-[#0f1420] overflow-hidden"
        style={{ width: rightWidth, flex: "0 0 auto" }}
      >
        <CommPanel />
      </section>
    </main>
  );
}
