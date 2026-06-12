"use client";

import { useEffect } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { useIdleWander } from "@/lib/useIdleWander";
import { fetchAgents } from "@/lib/api";
import { OfficeView } from "@/components/OfficeView";
import { CommPanel } from "@/components/CommPanel";

export default function Home() {
  const setAgents = useAgentStore((s) => s.setAgents);
  const agents = useAgentStore((s) => s.agents);

  // Agents must load before the office can render sprites or the chat can
  // attribute messages to a real persona. If the very first fetch fails
  // (typically because the dev backend is restarting), retry with backoff
  // until we get them — otherwise the office stays empty and every chat
  // bubble falls back to "System / Facilitator" with no avatar, which is
  // what surfaced as the "none of the agents have loaded yet" symptom.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    const load = async () => {
      while (!cancelled) {
        try {
          const list = await fetchAgents();
          if (cancelled) return;
          if (Array.isArray(list) && list.length > 0) {
            setAgents(list);
            return;
          }
          throw new Error("agents endpoint returned empty list");
        } catch (err) {
          attempt += 1;
          const delay = Math.min(500 * 2 ** Math.min(attempt, 5), 8000);
          console.warn(`fetchAgents attempt ${attempt} failed, retry in ${delay}ms:`, err);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [setAgents]);

  // Idle agents wander around the office naturally
  useIdleWander();

  // minmax(0, fr) on BOTH columns is the key — default `fr` tracks have an
  // implicit auto min-content sizing, so a single long token in the chat
  // panel (a URL, a code identifier, …) lets that column grow past its 2fr
  // share, squeezing the office column. The office is positioned in %, so
  // narrower → rooms get stretched vertically (the "zoom/stretch" bug).
  // Pairing it with min-w-0 + overflow-hidden on each section double-locks
  // the chat column to its fr share regardless of content.
  return (
    <main className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] h-screen w-screen overflow-hidden">
      <section className="relative bg-[#1a1106] min-w-0 overflow-hidden">
        <div className="absolute top-3 left-6 z-30 text-[10px] text-amber-200/80">
          BRAIN REGION SOCIETY · {agents.length} regions
        </div>
        <OfficeView />
      </section>
      <section className="flex flex-col bg-[#1e293b] border-l-4 border-[#5d4a2e] min-w-0 overflow-hidden">
        <CommPanel />
      </section>
    </main>
  );
}
