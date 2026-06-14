"use client";

import { useMemo, useRef, useEffect } from "react";
import { useMeetingStore } from "@/lib/meetingStore";
import type { SseEvent } from "@/types/meeting";

const display = (id: string) => id.replace(/_/g, " ");

/** A line rendered from one event — the same event log the office renders,
 *  shown the way the CLI brain_system models print it. Honours the replay
 *  cursor so it scrubs in lock-step with the office. */
function lineFor(e: SseEvent): { text: string; cls: string } | null {
  switch (e.type) {
    case "meeting_started": return { text: `# scenario: ${e.scenario}`, cls: "text-amber-300" };
    case "stage_change": return { text: `\n== ${e.stage.toUpperCase()} ==`, cls: "text-sky-300" };
    case "seat": return { text: `  seat  ${display(e.agent_id)}  [main]`, cls: "text-slate-400" };
    case "assess": {
      const inv = e.picks.filter((p) => p.involved).map((p) => `${display(p.region)} ${p.confidence.toFixed(2)}`);
      return { text: `  ${display(e.agent_id)} → involved: ${inv.join(", ") || "none"}`, cls: "text-slate-300" };
    }
    case "summon": return { text: `  ✦ SUMMON ${display(e.agent_id)}  ⟵ ${display(e.caller_id)}  (${e.reason})`, cls: "text-amber-400" };
    case "contribution": return { text: `  [${display(e.agent_id)}] ${e.text}`, cls: "text-emerald-300" };
    case "edge": return { text: `      ${display(e.from)} --${e.kind}--> ${display(e.to)}`, cls: "text-fuchsia-300" };
    case "flow_proposal": return { text: `  FLOW: ${e.ordering.map(display).join(" → ")}`, cls: "text-sky-300" };
    case "vote": return { text: `  vote ${display(e.agent_id)}: ${e.position} (${e.confidence.toFixed(2)})`, cls: "text-yellow-300" };
    case "merge": return { text: `  ⊕ MERGE ${display(e.left_id)} + ${display(e.right_id)} = ${e.label}`, cls: "text-pink-300" };
    case "implement": return { text: `  ${e.order}. ${display(e.agent_id)}: ${e.text}`, cls: "text-emerald-200" };
    case "final_answer": return { text: `\nFINAL → ${e.text}`, cls: "text-amber-200" };
    case "memory_saved": return { text: `  💾 saved as "${e.name}"`, cls: "text-slate-400" };
    case "interjection": return { text: `  > moderator: ${e.content}`, cls: "text-orange-300" };
    case "error": return { text: `  ERROR: ${e.message}`, cls: "text-red-400" };
    default: return null;
  }
}

export function TerminalView() {
  const events = useMeetingStore((s) => s.events);
  const cursor = useMeetingStore((s) => s.cursor);
  const ref = useRef<HTMLDivElement>(null);

  const lines = useMemo(
    () => events.slice(0, cursor).map(lineFor).filter(Boolean) as { text: string; cls: string }[],
    [events, cursor],
  );

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  return (
    <div className="h-full w-full bg-[#0a0c10] p-3">
      <div
        ref={ref}
        className="h-full w-full overflow-y-auto rounded border border-slate-800 p-3 font-mono text-[11px] leading-relaxed"
      >
        {lines.length === 0 && <div className="text-slate-600">// run a meeting to see the flow in the terminal</div>}
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap ${l.cls}`}>{l.text}</div>
        ))}
      </div>
    </div>
  );
}
