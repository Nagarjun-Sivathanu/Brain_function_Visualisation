"use client";

import { useEffect } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { pickWanderSpot } from "@/lib/officeLayout";

/**
 * Per-agent wander loop. Each idle agent picks a new spot every 10-22s.
 * Skips if the agent is currently mid-walk (no mid-walk re-targeting).
 */
export function useIdleWander() {
  const agents = useAgentStore((s) => s.agents);

  useEffect(() => {
    if (agents.length === 0) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const scheduleWander = (agentId: string) => {
      const delay = 10000 + Math.random() * 12000; // 10-22s
      const t = setTimeout(() => {
        const state = useAgentStore.getState();
        const status = state.statuses[agentId];
        const pos = state.positions[agentId];
        const walking = state.walking[agentId];
        const isSelected = state.selectedAgentId === agentId;

        if (status === "idle" && pos && !walking && !isSelected) {
          const next = pickWanderSpot(pos.room);
          state.setAgentPosition(agentId, {
            room: next.room,
            lx: next.lx,
            ly: next.ly,
          });
        }
        scheduleWander(agentId);
      }, delay);
      timers.push(t);
    };

    for (const a of agents) {
      // stagger initial wander
      const initial = setTimeout(() => scheduleWander(a.id), 2000 + Math.random() * 4000);
      timers.push(initial);
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [agents]);
}
