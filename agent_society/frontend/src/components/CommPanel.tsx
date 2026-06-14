"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import {
  useMeetingStore, STAGE_ORDER, STAGE_LABELS,
} from "@/lib/meetingStore";
import type { MeetingStage } from "@/types/meeting";
import {
  createMeeting, streamMeeting, proceedMeeting,
  fetchMeetingEvents, listMeetings, renameMeeting,
} from "@/lib/api";
import type { Meeting } from "@/types/meeting";

const display = (id: string) => id.replace(/_/g, " ");

export function CommPanel() {
  const view = useMeetingStore((s) => s.view);
  const meetingId = useMeetingStore((s) => s.meetingId);
  const startMeeting = useMeetingStore((s) => s.startMeeting);
  const reset = useMeetingStore((s) => s.reset);

  const agents = useAgentStore((s) => s.agents);
  const info = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ?? { id, name: display(id).replace(/\b\w/g, (c) => c.toUpperCase()), color: "#9ca3af", emoji: "•", role: "" };
  };

  const [scenario, setScenario] = useState("");
  const [level, setLevel] = useState(3);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Meeting[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const closeRef = useRef<null | (() => void)>(null);

  useEffect(() => () => closeRef.current?.(), []);

  const refreshSaved = async () => {
    try { setSaved(await listMeetings()); } catch { /* ignore */ }
  };

  const onStart = async () => {
    const s = scenario.trim();
    if (!s) return;
    closeRef.current?.();
    const m = await createMeeting(s, level);
    startMeeting(m.id, s);
    closeRef.current = streamMeeting(m.id, (e) => useMeetingStore.getState().ingest(e));
  };

  const onProceed = async () => {
    if (!meetingId) return;
    await proceedMeeting(meetingId, note.trim() || undefined);
    setNote("");
  };

  const onEnd = () => { closeRef.current?.(); reset(); };

  const onLoad = async (id: string) => {
    closeRef.current?.();
    const evs = await fetchMeetingEvents(id);
    useMeetingStore.getState().loadEvents(id, evs);
    setShowSaved(false);
  };

  const onRename = async (id: string, current: string) => {
    const name = window.prompt("Rename this memory state", current || "");
    if (name && name.trim()) { await renameMeeting(id, name.trim()); refreshSaved(); }
  };

  const idle = view.status === "idle";

  return (
    <div className="flex h-full flex-col bg-[#0f1420] text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">🧠 Brain Region Society</div>
          <div className="text-[10px] text-slate-400">
            {idle ? "ready" : view.scenario}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSaved((v) => !v); refreshSaved(); }}
            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500"
            title="Hippocampus — saved memory states"
          >🧬 Memory</button>
          {!idle && (
            <button onClick={onEnd} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-red-500">
              {view.status === "complete" || view.status === "error" ? "✕ Close" : "End"}
            </button>
          )}
        </div>
      </div>

      {/* Saved memory states drawer */}
      {showSaved && (
        <div className="max-h-48 overflow-y-auto border-b border-slate-800 bg-[#0b1018] p-2">
          {saved.length === 0 && <div className="p-2 text-[11px] text-slate-500">No saved sessions yet.</div>}
          {saved.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-800/50">
              <button onClick={() => onLoad(m.id)} className="flex-1 truncate text-left text-[12px]" title={m.scenario}>
                <span className="text-slate-200">{m.name || m.scenario}</span>
                <span className="ml-2 text-[10px] text-slate-500">{m.status}</span>
              </button>
              <button onClick={() => onRename(m.id, m.name || m.scenario)} className="text-[10px] text-slate-400 hover:text-sky-400">rename</button>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      {idle ? (
        <StartScreen
          scenario={scenario} setScenario={setScenario}
          level={level} setLevel={setLevel} onStart={onStart}
        />
      ) : (
        <MeetingScreen info={info} onProceed={onProceed} note={note} setNote={setNote} />
      )}
    </div>
  );
}

function StartScreen({ scenario, setScenario, level, setLevel, onStart }: {
  scenario: string; setScenario: (s: string) => void;
  level: number; setLevel: (n: number) => void; onStart: () => void;
}) {
  const examples = [
    "You see a lion and feel afraid",
    "A ball flies at you and someone shouts catch",
    "You smell smoke and freeze",
    "You recall your friend's name on seeing their face",
  ];
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="text-center text-slate-300">
        <h2 className="text-lg font-semibold">Pose a scenario to the brain</h2>
        <p className="mt-1 text-[12px] text-slate-400">
          The three divisions assess it, recruit the regions involved, deliberate, vote on an
          ordered plan, then implement it and give a final answer.
        </p>
      </div>

      <textarea
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onStart(); }}
        placeholder="Describe a scenario the brain should process…"
        className="min-h-[80px] rounded-lg border border-slate-700 bg-[#0b1018] p-3 text-[13px] outline-none focus:border-amber-500"
      />

      <div className="flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button key={ex} onClick={() => setScenario(ex)}
            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-amber-500">
            {ex}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[11px] text-slate-400">Region depth</label>
        <div className="flex rounded-full border border-slate-700 p-0.5">
          {[2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setLevel(n)}
              className={`px-3 py-1 text-[11px] rounded-full ${level === n ? "bg-amber-500 text-black font-semibold" : "text-slate-300"}`}>
              L{n}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">(deeper = more specialized regions)</span>
      </div>

      <button onClick={onStart} disabled={!scenario.trim()}
        className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 font-semibold text-black disabled:opacity-40">
        Start meeting
      </button>
    </div>
  );
}

function MeetingScreen({ info, onProceed, note, setNote }: {
  info: (id: string) => { id: string; name: string; color: string; emoji: string; role: string };
  onProceed: () => void; note: string; setNote: (s: string) => void;
}) {
  const view = useMeetingStore((s) => s.view);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [view.messages, view.implement.length, view.finalAnswer]);

  const stageIdx = view.currentStage ? STAGE_ORDER.indexOf(view.currentStage) : -1;
  const round2Msgs = view.messages.filter((m) => m.stage === "round2");
  const votes = Object.entries(view.votes);

  return (
    <>
      {/* stage pills */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-3 py-2">
        {STAGE_ORDER.map((st, i) => (
          <span key={st}
            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
              i < stageIdx ? "bg-slate-700 text-slate-300"
              : i === stageIdx ? "bg-amber-500 text-black"
              : "bg-slate-800 text-slate-500"}`}>
            {STAGE_LABELS[st as MeetingStage]}
          </span>
        ))}
      </div>

      <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        {/* Assessment */}
        {Object.keys(view.assessments).length > 0 && (
          <Section title="Assessment — which sub-regions are involved">
            {Object.entries(view.assessments).map(([div, picks]) => (
              <div key={div} className="mb-1">
                <span className="font-semibold" style={{ color: info(div).color }}>{info(div).name}</span>
                <span className="text-slate-400">: {picks.filter((p) => p.involved).map((p) => `${display(p.region)} (${p.confidence.toFixed(2)})`).join(", ") || "none"}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Recruitment */}
        {view.summons.length > 0 && (
          <Section title="Recruitment — regions called in">
            {view.summons.map((s, i) => (
              <div key={i} className="text-[12px] text-slate-300">
                <span className="text-amber-400">✦</span> {info(s.agent_id).name}
                <span className="text-slate-500"> ⟵ {info(s.caller_id).name}: {s.reason}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Round 1 contributions */}
        {view.contributions.length > 0 && (
          <Section title="Round 1 — contributions">
            {view.contributions.map((c, i) => <Bubble key={i} a={info(c.agentId)} text={c.text} />)}
          </Section>
        )}

        {/* Round 2 deliberation */}
        {round2Msgs.length > 0 && (
          <Section title="Round 2 — deliberation">
            {round2Msgs.map((m) => <Bubble key={m.key} a={info(m.agentId)} text={m.text} />)}
          </Section>
        )}

        {/* Flow + votes */}
        {view.ordering.length > 0 && (
          <Section title="Proposed flow">
            <div className="text-[12px] text-sky-300">{view.ordering.map(display).join("  →  ")}</div>
            {view.rationale && <div className="mt-1 text-[11px] text-slate-500">{view.rationale}</div>}
          </Section>
        )}
        {votes.length > 0 && (
          <Section title="Vote">
            <div className="flex flex-wrap gap-1.5">
              {votes.map(([id, v]) => (
                <span key={id} title={v.reasoning}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    v.position === "for" ? "bg-emerald-900 text-emerald-200"
                    : v.position === "against" ? "bg-red-900 text-red-200"
                    : "bg-slate-800 text-slate-300"}`}>
                  {info(id).name}: {v.position} {(v.confidence * 100) | 0}%
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Merges */}
        {view.merges.map((m, i) => (
          <div key={i} className="rounded border border-pink-800 bg-pink-950/40 px-3 py-1.5 text-[11px] text-pink-200">
            ⊕ {info(m.left_id).name} + {info(m.right_id).name} answer together as <b>{m.label}</b>
          </div>
        ))}

        {/* Implementation */}
        {view.implement.length > 0 && (
          <Section title="Implementation — in flow order">
            {view.implement.slice().sort((a, b) => a.order - b.order).map((im) => (
              <div key={im.order} className="mb-1.5 flex gap-2 text-[12px]">
                <span className="text-slate-500">{im.order}.</span>
                <span className="font-semibold" style={{ color: info(im.agentId).color }}>{info(im.agentId).name}</span>
                <span className="text-slate-300">{im.text}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Final answer */}
        {view.finalAnswer && (
          <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Final answer</div>
            <div className="whitespace-pre-wrap text-[13px] text-amber-50">{view.finalAnswer}</div>
            {view.memoryName && <div className="mt-2 text-[10px] text-slate-500">💾 saved to hippocampus as “{view.memoryName}”</div>}
          </div>
        )}

        {view.errorText && (
          <div className="rounded border border-red-800 bg-red-950/40 p-2 text-[12px] text-red-300">Error: {view.errorText}</div>
        )}
      </div>

      {/* Pause banner / proceed */}
      {view.status === "paused" && (
        <div className="border-t border-slate-800 bg-[#0b1018] p-3">
          <div className="mb-2 text-[11px] text-slate-400">
            Paused after <b className="text-slate-200">{view.pausedAfterStage && STAGE_LABELS[view.pausedAfterStage]}</b>.
            Add a note as the moderator, or continue.
          </div>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onProceed(); }}
              placeholder="Optional moderator note…"
              className="flex-1 rounded border border-slate-700 bg-[#0f1420] px-2 py-1.5 text-[12px] outline-none focus:border-amber-500" />
            <button onClick={onProceed} className="rounded bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-black">
              ▶ Proceed
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Bubble({ a, text }: { a: { name: string; color: string }; text: string }) {
  return (
    <div className="mb-2 rounded-lg border border-slate-800 bg-[#0b1018] p-2.5">
      <div className="mb-0.5 text-[11px] font-semibold" style={{ color: a.color }}>{a.name}</div>
      <div className="whitespace-pre-wrap text-[12px] text-slate-200">{text || "…"}</div>
    </div>
  );
}
