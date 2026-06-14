"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { useMeetingStore, STAGE_ORDER, STAGE_LABELS } from "@/lib/meetingStore";
import { useUiStore } from "@/lib/uiStore";
import type { MeetingStage } from "@/types/meeting";
import {
  createMeeting, streamMeeting, fetchMeetingEvents,
  createGroup, listGroups, getGroup, renameGroup,
  type MemoryGroup,
} from "@/lib/api";

const display = (id: string) => id.replace(/_/g, " ");

export function CommPanel() {
  const view = useMeetingStore((s) => s.view);
  const startMeeting = useMeetingStore((s) => s.startMeeting);
  const reset = useMeetingStore((s) => s.reset);

  const agents = useAgentStore((s) => s.agents);
  const info = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ?? { id, name: display(id).replace(/\b\w/g, (c) => c.toUpperCase()), color: "#9ca3af", emoji: "•", role: "" };
  };

  const maxLevel = useUiStore((s) => s.maxLevel);
  const setMaxLevel = useUiStore((s) => s.setMaxLevel);

  const [scenario, setScenario] = useState("");
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeMeetings, setActiveMeetings] = useState<{ id: string; scenario: string; name: string | null }[]>([]);
  const [showMem, setShowMem] = useState(false);
  const closeRef = useRef<null | (() => void)>(null);

  useEffect(() => () => closeRef.current?.(), []);
  useEffect(() => { listGroups().then(setGroups).catch(() => {}); }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;

  const refreshGroup = async (id: string) => {
    try { const d = await getGroup(id); setActiveMeetings(d.meetings.reverse()); } catch { setActiveMeetings([]); }
  };
  const onNewGroup = async () => {
    const g = await createGroup();
    setGroups((gs) => [g, ...gs]);
    setActiveGroupId(g.id);
    setActiveMeetings([]);
  };
  const onSelectGroup = async (id: string) => { setActiveGroupId(id); refreshGroup(id); };
  const onRenameGroup = async (id: string, cur: string) => {
    const name = window.prompt("Rename this hippocampus session", cur);
    if (name && name.trim()) { await renameGroup(id, name.trim()); setGroups(await listGroups()); }
  };

  const onStart = async () => {
    const s = scenario.trim();
    if (!s) return;
    closeRef.current?.();
    // Ensure an active hippocampus session (create one named from the scenario).
    let gid = activeGroupId;
    if (!gid) {
      const g = await createGroup(s.slice(0, 40));
      gid = g.id;
      setGroups((gs) => [g, ...gs]);
      setActiveGroupId(gid);
    }
    const m = await createMeeting(s, maxLevel, gid);
    startMeeting(m.id, s);
    setScenario("");
    closeRef.current = streamMeeting(m.id, (e) => {
      useMeetingStore.getState().ingest(e);
      if (e.type === "meeting_end" && gid) refreshGroup(gid);
    });
  };

  const onReplay = async (id: string) => {
    closeRef.current?.();
    const evs = await fetchMeetingEvents(id);
    useMeetingStore.getState().loadEvents(id, evs);
    setShowMem(false);
  };

  const onNewQuestion = () => { closeRef.current?.(); reset(); };

  const idle = view.status === "idle";

  return (
    <div className="flex h-full flex-col text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">🧠 Brain Region Society</div>
          <div className="truncate text-[10px] text-slate-400">
            {activeGroup ? `session: ${activeGroup.name}` : "no session — one starts on your first question"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowMem((v) => !v); listGroups().then(setGroups); if (activeGroupId) refreshGroup(activeGroupId); }}
            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500"
            title="Hippocampus — conversation sessions">🧬 Hippocampus</button>
          {!idle && (
            <button onClick={onNewQuestion} className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-500">
              + New question
            </button>
          )}
        </div>
      </div>

      {/* Hippocampus drawer */}
      {showMem && (
        <div className="max-h-72 overflow-y-auto border-b border-slate-800 bg-[#0b1018] p-2">
          <button onClick={onNewGroup} className="mb-2 w-full rounded bg-sky-600 py-1.5 text-[12px] font-semibold text-white hover:bg-sky-500">
            + New session
          </button>
          {groups.length === 0 && <div className="p-2 text-[11px] text-slate-500">No sessions yet.</div>}
          {groups.map((g) => (
            <div key={g.id} className={`rounded ${g.id === activeGroupId ? "bg-slate-800/70" : ""}`}>
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <button onClick={() => onSelectGroup(g.id)} className="flex-1 truncate text-left text-[12px]">
                  <span className={g.id === activeGroupId ? "text-sky-300" : "text-slate-200"}>{g.name}</span>
                  <span className="ml-2 text-[10px] text-slate-500">{g.meeting_count ?? 0} q</span>
                </button>
                <button onClick={() => onRenameGroup(g.id, g.name)} className="text-[10px] text-slate-400 hover:text-sky-400">rename</button>
              </div>
              {g.id === activeGroupId && activeMeetings.length > 0 && (
                <div className="mb-1 ml-3 border-l border-slate-700 pl-2">
                  {activeMeetings.map((m) => (
                    <button key={m.id} onClick={() => onReplay(m.id)}
                      className="block w-full truncate py-0.5 text-left text-[11px] text-slate-400 hover:text-amber-300"
                      title={m.scenario}>↻ {m.name || m.scenario}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      {idle ? (
        <StartScreen scenario={scenario} setScenario={setScenario} level={maxLevel} setLevel={setMaxLevel} onStart={onStart} />
      ) : (
        <MeetingScreen info={info} />
      )}
    </div>
  );
}

function StartScreen({ scenario, setScenario, level, setLevel, onStart }: {
  scenario: string; setScenario: (s: string) => void; level: number; setLevel: (n: number) => void; onStart: () => void;
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
          The divisions assess it, recruit the regions involved, deliberate, vote on an ordered
          plan, then implement it and give a final answer.
        </p>
      </div>

      <textarea value={scenario} onChange={(e) => setScenario(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onStart(); }}
        placeholder="Describe a scenario the brain should process…"
        className="min-h-[80px] rounded-lg border border-slate-700 bg-[#0b1018] p-3 text-[13px] outline-none focus:border-amber-500" />

      <div className="flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button key={ex} onClick={() => setScenario(ex)}
            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-amber-500">{ex}</button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[11px] text-slate-400">Region depth</label>
        <div className="flex rounded-full border border-slate-700 p-0.5">
          {[2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setLevel(n)}
              className={`px-3 py-1 text-[11px] rounded-full ${level === n ? "bg-amber-500 text-black font-semibold" : "text-slate-300"}`}>L{n}</button>
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

function MeetingScreen({ info }: { info: (id: string) => { id: string; name: string; color: string; emoji: string; role: string } }) {
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

        {view.contributions.length > 0 && (
          <Section title="Round 1 — contributions">
            {view.contributions.map((c, i) => <Bubble key={i} a={info(c.agentId)} text={c.text} />)}
          </Section>
        )}

        {round2Msgs.length > 0 && (
          <Section title="Round 2 — deliberation">
            {round2Msgs.map((m) => <Bubble key={m.key} a={info(m.agentId)} text={m.text} />)}
          </Section>
        )}

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

        {view.merges.map((m, i) => (
          <div key={i} className="rounded border border-pink-800 bg-pink-950/40 px-3 py-1.5 text-[11px] text-pink-200">
            ⊕ {info(m.left_id).name} + {info(m.right_id).name} answer together as <b>{m.label}</b>
          </div>
        ))}

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

        {view.finalAnswer && (
          <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Final answer</div>
            <div className="whitespace-pre-wrap text-[13px] text-amber-50">{view.finalAnswer}</div>
            {view.memoryName && <div className="mt-2 text-[10px] text-slate-500">💾 saved to this session’s hippocampus memory</div>}
          </div>
        )}

        {view.errorText && (
          <div className="rounded border border-red-800 bg-red-950/40 p-2 text-[12px] text-red-300">Error: {view.errorText}</div>
        )}
      </div>
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
