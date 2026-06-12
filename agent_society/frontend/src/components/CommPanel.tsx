"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import {
  useMeetingStore,
  STAGE_LABELS,
  STAGE_ORDER,
  type LiveMessage,
  type LiveVote,
} from "@/lib/meetingStore";
import { useChatStore, type ChatTurn } from "@/lib/chatStore";
import {
  createMeeting,
  proceedMeeting,
  streamMeeting,
  streamAgentChat,
  fetchChatHistory,
  fetchAgentMemories,
  fetchAgentRelationships,
  fetchToolInventory,
  fetchObserverHealth,
  fetchObserverBriefingPreview,
  addAgentMemory,
  editAgentMemory,
  deleteAgentMemory,
  resetAgentMemories,
  resetAllMemories,
  type ObserverBriefingPreview,
} from "@/lib/api";

// localStorage keys for the per-meeting checkboxes. Module-scope constants so
// we don't accidentally typo them across read/write sites.
const ENABLE_TOOLS_STORAGE_KEY = "aas:enable-tools";
const INCLUDE_OBSERVER_STORAGE_KEY = "aas:include-observer-context";
import type { Agent, AgentMemory, AgentRelationship } from "@/types/agent";
import type { MeetingStage, VotePosition } from "@/types/meeting";
import type { RoomId } from "@/lib/officeLayout";

export function CommPanel() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const moveAllTo = useAgentStore((s) => s.moveAllTo);
  const setStatusAll = useAgentStore((s) => s.setStatusAll);
  const setStatus = useAgentStore((s) => s.setStatus);
  const resetPositions = useAgentStore((s) => s.resetPositions);

  const meetingStatus = useMeetingStore((s) => s.status);
  const meetingId = useMeetingStore((s) => s.meetingId);
  const startMeeting = useMeetingStore((s) => s.startMeeting);
  const applyEvent = useMeetingStore((s) => s.applyEvent);
  const failMeeting = useMeetingStore((s) => s.failMeeting);
  const resetMeeting = useMeetingStore((s) => s.resetMeeting);
  const pausedAfter = useMeetingStore((s) => s.pausedAfterStage);
  const pausedNext = useMeetingStore((s) => s.pausedNextStage);

  const chatSessionId = useChatStore((s) => s.sessionId);
  const setHistory = useChatStore((s) => s.setHistory);
  const appendUser = useChatStore((s) => s.appendUser);
  const beginAssistant = useChatStore((s) => s.beginAssistant);
  const appendAssistantToken = useChatStore((s) => s.appendAssistantToken);
  const finishAssistant = useChatStore((s) => s.finishAssistant);
  const setChatError = useChatStore((s) => s.setError);
  const isChatStreaming = useChatStore(
    (s) => (selectedAgentId ? s.threads[selectedAgentId]?.isStreaming ?? false : false),
  );

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const inMeeting =
    meetingStatus === "running" ||
    meetingStatus === "paused" ||
    meetingStatus === "complete" ||
    meetingStatus === "error";
  const inChat = !inMeeting && !!selectedAgent;

  // ── SSE subscription for the active meeting ──
  // CRITICAL: only depend on meetingId — NOT meetingStatus. The SSE delivers
  // status-changing events (phase_paused, meeting_end…); reacting to those
  // events by tearing down and reopening the stream causes the backend's
  // finally{} to pop the queue, after which any reconnect gets a 404
  // ("No active stream") and the meeting visually dies even though the
  // orchestrator is still running fine. The stream stays open for the entire
  // lifetime of the meetingId — close happens via cleanup when meetingId
  // changes (next meeting) or when the user clicks Close (resetMeeting →
  // meetingId becomes null).
  useEffect(() => {
    if (!meetingId) return;
    const close = streamMeeting(
      meetingId,
      applyEvent,
      () => failMeeting("Lost connection to meeting stream."),
    );
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // ── Sync office sprites with meeting lifecycle ──
  // When the meeting ends, send everyone home quickly (no long meeting-room
  // linger and no big "all six walk through the lobby" pile-up) so the office
  // returns to a normal-looking state instead of feeling visually locked on
  // the meeting room.
  useEffect(() => {
    if (meetingStatus === "running" || meetingStatus === "paused") {
      moveAllTo("meeting");
      setStatusAll("meeting");
    } else if (meetingStatus === "complete" || meetingStatus === "error") {
      const t = setTimeout(() => {
        moveAllTo("desks");
        setStatusAll("idle");
      }, 800);
      return () => clearTimeout(t);
    }
  }, [meetingStatus, moveAllTo, setStatusAll]);

  // ── Per-meeting toggles (tools + Observer context) ──
  //
  // Both default OFF and persist across reloads via localStorage. Companion
  // info ("N tools available", Observer backend state) is fetched on mount
  // and hides silently if the backend is unreachable.
  const [enableTools, setEnableTools] = useState<boolean>(false);
  const [toolCount, setToolCount] = useState<number>(0);
  const [includeObserverContext, setIncludeObserverContext] = useState<boolean>(false);
  const [observerAvailable, setObserverAvailable] = useState<boolean>(false);
  const [observerBackend, setObserverBackend] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEnableTools(window.localStorage.getItem(ENABLE_TOOLS_STORAGE_KEY) === "true");
      setIncludeObserverContext(
        window.localStorage.getItem(INCLUDE_OBSERVER_STORAGE_KEY) === "true",
      );
    } catch {
      /* localStorage disabled (privacy mode) — defaults to OFF, no fuss */
    }
    fetchToolInventory()
      .then((inv) => setToolCount(inv.tool_names.length))
      .catch(() => setToolCount(0));
    fetchObserverHealth()
      .then((h) => {
        setObserverAvailable(h.available);
        setObserverBackend(h.backend);
      })
      .catch(() => {
        setObserverAvailable(false);
        setObserverBackend(null);
      });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ENABLE_TOOLS_STORAGE_KEY, String(enableTools));
    } catch { /* localStorage disabled */ }
  }, [enableTools]);

  useEffect(() => {
    try {
      window.localStorage.setItem(INCLUDE_OBSERVER_STORAGE_KEY, String(includeObserverContext));
    } catch { /* localStorage disabled */ }
  }, [includeObserverContext]);

  const onStartMeeting = async (scenario: string) => {
    try {
      const meeting = await createMeeting(scenario, enableTools, includeObserverContext);
      startMeeting(meeting.id, scenario, enableTools, includeObserverContext);
    } catch (err) {
      console.error(err);
      failMeeting(err instanceof Error ? err.message : "Failed to start meeting");
    }
  };

  const onEndMeeting = () => {
    resetMeeting();
    resetPositions(); // walks everyone back to their default desks + sets status idle
  };

  const onProceed = async (interjection?: string) => {
    if (!meetingId) return;
    try {
      await proceedMeeting(meetingId, interjection);
    } catch (err) {
      console.error("proceed failed", err);
      failMeeting(err instanceof Error ? err.message : "Failed to proceed meeting");
    }
  };

  // ── Load persisted chat history when an agent is selected for chat ──
  useEffect(() => {
    if (!inChat || !selectedAgent) return;
    let cancelled = false;
    fetchChatHistory(selectedAgent.id, chatSessionId)
      .then((history) => {
        if (cancelled) return;
        setHistory(
          selectedAgent.id,
          history.map((h, i) => ({
            id: `hist-${i}`,
            role: h.role,
            content: h.content,
            streaming: false,
          })),
        );
      })
      .catch((err) => console.warn("chat history fetch failed", err));
    return () => {
      cancelled = true;
    };
  }, [inChat, selectedAgent?.id, chatSessionId, setHistory]);

  // ── Mark the agent as "chatting" while a chat stream is open ──
  // Skip during a meeting — setStatusAll("meeting") owns the status there.
  useEffect(() => {
    if (!selectedAgent || inMeeting) return;
    setStatus(selectedAgent.id, isChatStreaming ? "chatting" : "idle");
  }, [selectedAgent?.id, isChatStreaming, setStatus, inMeeting]);

  const onSendChat = (message: string) => {
    if (!selectedAgent || isChatStreaming) return;
    appendUser(selectedAgent.id, message);
    const turnId = beginAssistant(selectedAgent.id);
    streamAgentChat(
      selectedAgent.id,
      chatSessionId,
      message,
      (token) => appendAssistantToken(selectedAgent.id, turnId, token),
      () => finishAssistant(selectedAgent.id, turnId),
      (err) => {
        finishAssistant(selectedAgent.id, turnId);
        setChatError(selectedAgent.id, err.message);
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        inMeeting={inMeeting}
        meetingStatus={meetingStatus}
        onEnd={onEndMeeting}
      />

      {inMeeting ? (
        <MeetingView agents={agents} onProceed={onProceed} />
      ) : inChat && selectedAgent ? (
        <ChatView agent={selectedAgent} />
      ) : (
        <IdlePanel
          onGoTo={(room, status) => {
            moveAllTo(room);
            setStatusAll(status);
          }}
          onReset={resetPositions}
        />
      )}

      {/* When the meeting is paused between phases we swap the scenario
          textarea for the PauseBanner — same screen real-estate, so the
          Proceed button lands exactly where the user's eyes already are
          when typing scenarios. Stops the banner from getting buried by
          the bottom of the page. */}
      {meetingStatus === "paused" ? (
        <div className="px-3 py-2 border-t-2 border-amber-600 bg-slate-900">
          <PauseBanner
            completedStage={pausedAfter}
            nextStage={pausedNext}
            onProceed={onProceed}
          />
        </div>
      ) : (
        <PanelInput
          mode={inChat ? "chat" : "meeting"}
          chatAgentName={selectedAgent?.name}
          disabled={meetingStatus === "running" || isChatStreaming}
          onSubmit={inChat ? onSendChat : onStartMeeting}
          enableTools={enableTools}
          setEnableTools={setEnableTools}
          toolCount={toolCount}
          includeObserverContext={includeObserverContext}
          setIncludeObserverContext={setIncludeObserverContext}
          observerAvailable={observerAvailable}
          observerBackend={observerBackend}
        />
      )}
    </div>
  );
}

// ─── Header with stage indicator ───────────────────────────────────────────

function Header({
  inMeeting,
  meetingStatus,
  onEnd,
}: {
  inMeeting: boolean;
  meetingStatus: "idle" | "running" | "paused" | "complete" | "error";
  onEnd: () => void;
}) {
  const currentStage = useMeetingStore((s) => s.currentStage);
  const enableTools = useMeetingStore((s) => s.enableTools);
  const includeObserverContext = useMeetingStore((s) => s.includeObserverContext);

  return (
    <div className="px-4 py-3 border-b-2 border-office-wall">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-300">COMMUNICATION PANEL</div>
          <div className="text-[8px] text-slate-500 mt-1">
            {meetingStatus === "idle" && "Type a scenario below to start a meeting"}
            {meetingStatus === "running" && "Meeting in progress…"}
            {meetingStatus === "paused" && "Paused — review and click Proceed below"}
            {meetingStatus === "complete" && "Meeting complete"}
            {meetingStatus === "error" && "Meeting error"}
            {inMeeting && enableTools && (
              <span className="ml-1.5 text-amber-400">· 🔧 tools on</span>
            )}
            {inMeeting && includeObserverContext && (
              <span className="ml-1.5 text-amber-400">· 📡 context on</span>
            )}
          </div>
        </div>
        {inMeeting && (
          <button
            onClick={onEnd}
            className={
              meetingStatus === "running" || meetingStatus === "paused"
                ? "text-[9px] px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
                : "text-[9px] px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 border border-amber-600 text-amber-50 font-medium"
            }
          >
            {meetingStatus === "running" || meetingStatus === "paused"
              ? "End meeting"
              : "✕ Close meeting"}
          </button>
        )}
      </div>

      {inMeeting && (
        <div className="mt-3 flex items-center gap-1">
          {STAGE_ORDER.map((s) => (
            <StagePill key={s} stage={s} current={currentStage} />
          ))}
        </div>
      )}
    </div>
  );
}

function StagePill({
  stage,
  current,
}: {
  stage: MeetingStage;
  current: MeetingStage | null;
}) {
  const reachedIdx = current ? STAGE_ORDER.indexOf(current) : -1;
  const myIdx = STAGE_ORDER.indexOf(stage);
  const state =
    reachedIdx < 0 ? "pending"
      : myIdx < reachedIdx ? "done"
      : myIdx === reachedIdx ? "active"
      : "pending";

  return (
    <div
      className="flex-1 text-center text-[7px] py-1 rounded border"
      style={{
        background:
          state === "active" ? "#f59e0b" : state === "done" ? "#334155" : "transparent",
        borderColor:
          state === "active" ? "#fbbf24" : state === "done" ? "#475569" : "#1e293b",
        color:
          state === "active" ? "#0f172a" : state === "done" ? "#cbd5e1" : "#475569",
      }}
    >
      {STAGE_LABELS[stage]}
    </div>
  );
}

// ─── Meeting view (live message stream) ────────────────────────────────────

function MeetingView({
  agents,
  onProceed,
}: {
  agents: Agent[];
  onProceed: (interjection?: string) => Promise<void>;
}) {
  const messages = useMeetingStore((s) => s.messages);
  const votes = useMeetingStore((s) => s.votes);
  const scenario = useMeetingStore((s) => s.scenario);
  const errorText = useMeetingStore((s) => s.errorText);
  const status = useMeetingStore((s) => s.status);
  const interjections = useMeetingStore((s) => s.interjections);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether the user is "stuck" near the bottom (auto-follow) vs they
  // have scrolled up to read earlier messages (don't yank them back).
  const [autoFollow, setAutoFollow] = useState(true);

  // When new content arrives, only scroll to bottom if the user is already
  // following along. Otherwise leave them where they are.
  useEffect(() => {
    if (!autoFollow) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, votes, interjections, status, autoFollow]);

  // Toggle autoFollow based on whether the user is at the bottom.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setAutoFollow(distanceFromBottom < 80);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoFollow(true);
  };

  const agentById = new Map(agents.map((a) => [a.id, a]));

  // Group messages by stage
  const grouped: Record<MeetingStage, LiveMessage[]> = {
    initial_opinions: [],
    critique_round: [],
    refinement_round: [],
    voting: [],
    consensus_summary: [],
  };
  for (const m of messages) grouped[m.stage].push(m);

  const votesByAgent = new Map<string, LiveVote>();
  for (const v of votes) votesByAgent.set(v.agentId, v);

  return (
    <div className="relative flex-1 min-h-0">
      {!autoFollow && (
        <button
          onClick={jumpToLatest}
          className="absolute right-3 bottom-3 z-30 text-[9px] px-2.5 py-1.5 rounded-full bg-amber-700 hover:bg-amber-600 text-amber-50 border border-amber-500 shadow-lg font-medium"
        >
          ↓ Jump to latest
        </button>
      )}
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto scrollbar-thin px-3 py-3 space-y-4"
    >
      {scenario && (
        <div className="rounded bg-amber-900/30 border border-amber-700/50 px-3 py-2">
          <div className="text-[7px] uppercase tracking-wider text-amber-400 mb-1">
            Scenario
          </div>
          <div className="text-[10px] text-amber-100 leading-relaxed">{scenario}</div>
        </div>
      )}

      {errorText && (
        <div className="rounded bg-red-900/40 border border-red-700/50 px-3 py-2 text-[10px] text-red-200">
          {errorText}
        </div>
      )}

      {STAGE_ORDER.map((stage) => {
        const stageMsgs = grouped[stage];
        if (stageMsgs.length === 0 && stage !== "voting") return null;
        const stageVotes = stage === "voting" ? votes : [];
        if (stage === "voting" && stageVotes.length === 0 && stageMsgs.length === 0) {
          return null;
        }
        const stageInterjections = interjections.filter((i) => i.afterStage === stage);

        return (
          <div key={stage} className="space-y-2">
            <StageDivider label={STAGE_LABELS[stage]} />
            {stage === "voting"
              ? stageVotes.map((v) => (
                  <VoteBubble
                    key={v.agentId}
                    vote={v}
                    agent={agentById.get(v.agentId)}
                  />
                ))
              : stageMsgs.map((m) => (
                  <MessageBubble
                    key={m.key}
                    message={m}
                    agent={agentById.get(m.agentId)}
                  />
                ))}
            {stageInterjections.map((i) => (
              <InterjectionBubble key={i.id} content={i.content} />
            ))}
          </div>
        );
      })}

    </div>
    {/* PauseBanner is rendered OUTSIDE MeetingView now — it replaces the
        scenario textarea at the bottom of the CommPanel when paused (see
        CommPanel return). */}
    </div>
  );
}

function InterjectionBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-2">
      <div
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-base mt-0.5"
        style={{
          background: "#fcd34d",
          boxShadow: "0 0 0 2px #0f172a, 0 0 0 3px #fcd34d",
        }}
      >
        🧑
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="text-[10px] text-amber-100 font-medium">You</div>
          <div className="text-[7px] text-amber-200">(Moderator interjection)</div>
        </div>
        <div className="text-[10px] leading-relaxed mt-0.5 text-amber-50 whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    </div>
  );
}

function PauseBanner({
  completedStage,
  nextStage,
  onProceed,
}: {
  completedStage: MeetingStage | null;
  nextStage: MeetingStage | null;
  onProceed: (interjection?: string) => Promise<void>;
}) {
  const [interjection, setInterjection] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const trimmed = interjection.trim();
      await onProceed(trimmed || undefined);
      setInterjection("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg bg-amber-900/40 border-2 border-amber-600 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[12px]">⏸️</div>
        <div className="flex-1">
          <div className="text-[10px] text-amber-100 font-medium">
            Phase complete — meeting paused
          </div>
          <div className="text-[8px] text-amber-300 mt-0.5">
            {completedStage ? `Just finished: ${STAGE_LABELS[completedStage]}` : ""}
            {completedStage && nextStage ? "  ·  " : ""}
            {nextStage ? `Next: ${STAGE_LABELS[nextStage]}` : ""}
          </div>
        </div>
      </div>
      <textarea
        value={interjection}
        onChange={(e) => setInterjection(e.target.value)}
        rows={2}
        disabled={sending}
        placeholder="(optional) Drop a comment for the agents to consider in the next phase…"
        className="w-full px-2 py-1.5 text-[10px] bg-slate-900 border border-amber-700/60 rounded text-amber-50 placeholder-amber-200/50 resize-none focus:outline-none focus:border-amber-400 disabled:opacity-60"
      />
      <button
        onClick={send}
        disabled={sending}
        className="w-full text-[11px] px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-amber-950 font-bold border border-amber-300 transition-colors"
      >
        {sending ? "Sending…" : "▶ Proceed to next phase"}
      </button>
    </div>
  );
}

function StageDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="flex-1 h-px bg-slate-700" />
      <div className="text-[7px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="flex-1 h-px bg-slate-700" />
    </div>
  );
}

/** Minimal Markdown renderer for the consensus-summary bubble. Handles only
 *  what the summary prompt is told to produce: bold-line headings, "- " /
 *  "* " bullets, "N. " numbered lists, blank lines as paragraph breaks, and
 *  inline `**bold**`. Anything fancier (links, code blocks) falls through as
 *  plain text. Keeping this tiny avoids pulling in react-markdown. */
function renderInlineBold(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={`${keyPrefix}-b-${i++}`} className="text-amber-200">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function ConsensusMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bulletBuf: string[] = [];
  let numBuf: string[] = [];

  const flushBullets = () => {
    if (bulletBuf.length === 0) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="list-disc pl-4 my-0.5 space-y-0.5">
        {bulletBuf.map((b, i) => (
          <li key={i}>{renderInlineBold(b, `ulb-${nodes.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    bulletBuf = [];
  };
  const flushNumbers = () => {
    if (numBuf.length === 0) return;
    nodes.push(
      <ol key={`ol-${nodes.length}`} className="list-decimal pl-4 my-0.5 space-y-0.5">
        {numBuf.map((b, i) => (
          <li key={i}>{renderInlineBold(b, `olb-${nodes.length}-${i}`)}</li>
        ))}
      </ol>,
    );
    numBuf = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushNumbers();
      return;
    }
    const bulletM = line.match(/^[-*]\s+(.*)$/);
    if (bulletM) {
      flushNumbers();
      bulletBuf.push(bulletM[1]);
      return;
    }
    const numM = line.match(/^\d+\.\s+(.*)$/);
    if (numM) {
      flushBullets();
      numBuf.push(numM[1]);
      return;
    }
    flushBullets();
    flushNumbers();
    // A standalone bold-only line is a heading
    const headingM = line.match(/^\*\*(.+)\*\*$/);
    if (headingM) {
      nodes.push(
        <div key={`h-${idx}`} className="text-amber-300 font-semibold mt-1.5">
          {headingM[1]}
        </div>,
      );
      return;
    }
    nodes.push(
      <div key={`p-${idx}`} className="my-0.5">
        {renderInlineBold(line, `p-${idx}`)}
      </div>,
    );
  });
  flushBullets();
  flushNumbers();
  return <>{nodes}</>;
}

function MessageBubble({
  message,
  agent,
}: {
  message: LiveMessage;
  agent: Agent | undefined;
}) {
  const isSystem = message.agentId === "system";
  const color = agent?.color ?? "#6b7280";
  const emoji = agent?.emoji ?? "🏛️";
  const name = agent?.name ?? "System";
  const role = agent?.role ?? "Facilitator";

  return (
    <div className="flex gap-2">
      <div
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-base mt-0.5"
        style={{
          background: color,
          boxShadow: `0 0 0 2px #0f172a, 0 0 0 3px ${color}`,
        }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="text-[10px] text-slate-100 font-medium">{name}</div>
          <div className="text-[7px] text-slate-500">{role}</div>
          {!message.done && (
            <div className="text-[7px] text-amber-400 animate-pulse">typing…</div>
          )}
        </div>
        <div
          className={`text-[10px] leading-relaxed mt-0.5 break-words ${
            isSystem ? "text-amber-100" : "text-slate-300 whitespace-pre-wrap"
          }`}
        >
          {isSystem ? <ConsensusMarkdown text={message.text} /> : message.text}
          {!message.done && <span className="inline-block w-1 ml-0.5 bg-amber-400 animate-pulse">&nbsp;</span>}
        </div>
      </div>
    </div>
  );
}

function VoteBubble({ vote, agent }: { vote: LiveVote; agent: Agent | undefined }) {
  const color = agent?.color ?? "#6b7280";
  const emoji = agent?.emoji ?? "🗳️";
  const name = agent?.name ?? "Unknown";
  const role = agent?.role ?? "";

  return (
    <div className="flex gap-2">
      <div
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-base mt-0.5"
        style={{
          background: color,
          boxShadow: `0 0 0 2px #0f172a, 0 0 0 3px ${color}`,
        }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="text-[10px] text-slate-100 font-medium">{name}</div>
          <div className="text-[7px] text-slate-500">{role}</div>
          <VotePill position={vote.position} />
          <div className="text-[7px] text-slate-400">
            {Math.round(vote.confidence * 100)}%
          </div>
        </div>
        <div className="text-[10px] leading-relaxed mt-0.5 text-slate-300">
          {vote.reasoning}
        </div>
      </div>
    </div>
  );
}

function VotePill({ position }: { position: VotePosition }) {
  const styles: Record<VotePosition, { bg: string; fg: string; label: string }> = {
    for: { bg: "#15803d", fg: "#dcfce7", label: "FOR" },
    against: { bg: "#b91c1c", fg: "#fee2e2", label: "AGAINST" },
    abstain: { bg: "#475569", fg: "#e2e8f0", label: "ABSTAIN" },
  };
  const s = styles[position];
  return (
    <span
      className="text-[7px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

// ─── Idle panel (no selection, no meeting) ─────────────────────────────────

function IdlePanel({
  onGoTo,
  onReset,
}: {
  onGoTo: (room: RoomId, status: "idle" | "meeting" | "chatting") => void;
  onReset: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
      <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
        <p>
          <span className="text-slate-200 font-medium">Click an agent</span> in the office to start a 1:1 chat.
        </p>
        <p>
          <span className="text-slate-200 font-medium">Type a scenario</span> below (no agent selected) to convene a group meeting where all 6 debate and vote.
        </p>
      </div>

      <div className="pt-2 border-t border-slate-700">
        <div className="text-[8px] text-slate-500 mb-2">DEV CONTROLS</div>
        <div className="grid grid-cols-2 gap-1">
          <ControlButton onClick={() => onGoTo("meeting", "meeting")}>
            → Meeting
          </ControlButton>
          <ControlButton onClick={() => onGoTo("break", "idle")}>
            → Break
          </ControlButton>
          <ControlButton onClick={() => onGoTo("lobby", "idle")}>
            → Lobby
          </ControlButton>
          <ControlButton onClick={onReset}>Reset Desks</ControlButton>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-700">
        <div className="text-[8px] text-slate-500 mb-2">GROUP MEMORY</div>
        <p className="text-[9px] text-slate-400 leading-relaxed mb-2">
          Per-agent memories live in their profile (click an agent → expanded profile shows them with edit/delete). This button wipes EVERY agent&apos;s memories + resets ALL relationships to neutral.
        </p>
        <GroupMemoryControl />
      </div>
    </div>
  );
}

function GroupMemoryControl() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reset = async () => {
    if (!window.confirm("Wipe ALL agents' memories and reset ALL relationships to neutral? This cannot be undone.")) return;
    setBusy(true);
    setMsg(null);
    try {
      await resetAllMemories();
      setMsg("All memories wiped, relationships reset to neutral.");
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={reset}
        disabled={busy}
        className="w-full text-[9px] px-2.5 py-1.5 rounded bg-red-900/70 hover:bg-red-800 disabled:opacity-50 border border-red-700 text-red-100 font-medium"
      >
        {busy ? "Resetting…" : "Reset ALL agent memories + relationships"}
      </button>
      {msg && <div className="text-[8px] text-slate-300 mt-2">{msg}</div>}
    </>
  );
}

// ─── Chat view (1:1 with selected agent) ───────────────────────────────────

function ChatView({ agent }: { agent: Agent }) {
  const thread = useChatStore((s) => s.threads[agent.id]);
  const error = thread?.error;
  const turns = thread?.turns ?? [];
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const clearThread = useChatStore((s) => s.clearThread);
  // Profile + memories visible by default so issue #5 surface is immediately
  // discoverable; collapsible if the user wants more chat real-estate.
  const [showProfile, setShowProfile] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.content.length]);

  // Load memories + relationships when profile pane is opened
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [relationships, setRelationships] = useState<AgentRelationship[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!showProfile) return;
    let cancelled = false;
    setProfileLoading(true);
    Promise.all([
      fetchAgentMemories(agent.id).catch(() => [] as AgentMemory[]),
      fetchAgentRelationships(agent.id).catch(() => [] as AgentRelationship[]),
    ]).then(([mems, rels]) => {
      if (cancelled) return;
      setMemories(mems);
      setRelationships(rels);
      setProfileLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [agent.id, showProfile]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat header — agent identity + actions */}
      <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-3">
        <div
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xl"
          style={{
            background: agent.color,
            boxShadow: `0 0 0 2px #0f172a, 0 0 0 3px ${agent.color}`,
          }}
        >
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-slate-100 font-medium">
            DM · {agent.name}
          </div>
          <div className="text-[8px] text-slate-400 truncate">
            {agent.role} · {agent.model}
          </div>
        </div>
        <button
          onClick={() => setShowProfile((v) => !v)}
          className="text-[8px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
        >
          {showProfile ? "Hide profile" : "Profile"}
        </button>
        <button
          onClick={() => selectAgent(null)}
          className="text-[8px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
          title="Close chat"
        >
          ✕
        </button>
      </div>

      {showProfile && (
        <div className="px-4 py-3 border-b border-slate-700 bg-black/20 space-y-2">
          <Section label="PERSONALITY">
            <div className="flex flex-wrap gap-1">
              {agent.personality_traits.map((t) => (
                <Pill key={t} bg="#334155">
                  {t}
                </Pill>
              ))}
            </div>
          </Section>
          <Section label="EXPERTISE">
            <div className="flex flex-wrap gap-1">
              {agent.expertise.map((e) => (
                <Pill key={e} bg="#475569">
                  {e}
                </Pill>
              ))}
            </div>
          </Section>

          <MemoriesSection
            agent={agent}
            memories={memories}
            loading={profileLoading}
            // Optimistic remove — the row disappears instantly when the user
            // clicks ✕ or Reset all, even before the server roundtrip. Without
            // this, deletes felt buggy because the list re-fetch could pull in
            // a previously-hidden memory that visually replaced the deleted
            // one (especially when the backend GET was capped at 10).
            onLocalRemove={(removedIds) => {
              setMemories((curr) => curr.filter((m) => !removedIds.includes(m.id)));
            }}
            onLocalClear={() => setMemories([])}
            onRefresh={() => {
              fetchAgentMemories(agent.id).then(setMemories).catch(() => {});
            }}
          />

          <Section label={`RELATIONSHIPS (${relationships.length})`}>
            {profileLoading && (
              <div className="text-[9px] text-slate-500">Loading…</div>
            )}
            {!profileLoading && relationships.length === 0 && (
              <div className="text-[9px] text-slate-500">No interactions yet.</div>
            )}
            {!profileLoading && relationships.length > 0 && (
              <div className="space-y-1">
                {relationships.map((r) => (
                  <RelationshipRow key={r.target_name} rel={r} />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* Thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3"
      >
        {turns.length === 0 && (
          <div className="text-[10px] text-slate-500 leading-relaxed pt-2">
            Send a message to {agent.name} below. Their answer streams here.
            Click an empty area or another agent to switch.
          </div>
        )}

        {turns.map((turn) => (
          <ChatTurnBubble key={turn.id} turn={turn} agent={agent} />
        ))}

        {error && (
          <div className="rounded bg-red-900/40 border border-red-700/50 px-3 py-2 text-[10px] text-red-200">
            {error}
          </div>
        )}

        {turns.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => clearThread(agent.id)}
              className="text-[8px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
            >
              Clear this thread
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Memories sub-panel: view, add, edit, delete, reset.
function MemoriesSection({
  agent,
  memories,
  loading,
  onRefresh,
  onLocalRemove,
  onLocalClear,
}: {
  agent: Agent;
  memories: AgentMemory[];
  loading: boolean;
  onRefresh: () => void;
  // Optimistic remove — parent removes from the list immediately so the user
  // sees the change instantly, instead of waiting on a re-fetch that could
  // return a stale-looking different memory in the same slot.
  onLocalRemove: (removedIds: number[]) => void;
  onLocalClear: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submitAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await addAgentMemory(agent.id, text);
      setDraft("");
      setAdding(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (id: number) => {
    const text = editDraft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await editAgentMemory(agent.id, id, text);
      setEditingId(null);
      setEditDraft("");
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: number) => {
    // Optimistically remove first so the row disappears immediately.
    onLocalRemove([id]);
    setBusy(true);
    try {
      await deleteAgentMemory(agent.id, id);
    } catch (e) {
      console.error("delete failed, refetching", e);
    } finally {
      // Sync with backend either way: confirms a successful delete or
      // restores the row if the server actually rejected it.
      onRefresh();
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!window.confirm(`Wipe ALL of ${agent.name}'s memories and reset their relationships? This cannot be undone.`)) return;
    onLocalClear();
    setBusy(true);
    try {
      await resetAgentMemories(agent.id);
    } catch (e) {
      console.error("reset failed, refetching", e);
    } finally {
      onRefresh();
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[8px] text-slate-500">MEMORIES ({memories.length})</div>
        <div className="flex gap-1">
          <button
            onClick={() => setAdding((v) => !v)}
            disabled={busy}
            className="text-[7px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-50"
            title="Add a manual memory"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
          {memories.length > 0 && (
            <button
              onClick={resetAll}
              disabled={busy}
              className="text-[7px] px-1.5 py-0.5 rounded bg-red-900/60 hover:bg-red-800/70 border border-red-700/60 text-red-100 disabled:opacity-50"
              title={`Reset ${agent.name}'s memories + relationships`}
            >
              Reset all
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mb-2 space-y-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={`Seed a belief or experience for ${agent.name}…`}
            className="w-full px-2 py-1 text-[9px] bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-amber-600 break-words"
          />
          <button
            onClick={submitAdd}
            disabled={busy || !draft.trim()}
            className="text-[8px] px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:bg-slate-700 text-amber-50 border border-amber-600 disabled:border-slate-600"
          >
            {busy ? "Saving…" : "Save memory"}
          </button>
        </div>
      )}

      {loading && <div className="text-[9px] text-slate-500">Loading…</div>}
      {!loading && memories.length === 0 && !adding && (
        <div className="text-[9px] text-slate-500 leading-relaxed">
          {agent.name} hasn&apos;t formed any memories yet. Run a meeting (or click <span className="text-slate-300">+ Add</span> to seed one) and they&apos;ll start remembering positions and outcomes.
        </div>
      )}
      {!loading && memories.length > 0 && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pr-1">
          {memories.map((m) => (
            <div
              key={m.id}
              className="text-[9px] text-slate-300 leading-relaxed bg-slate-800/60 border border-slate-700 rounded px-2 py-1.5 break-words"
            >
              <div className="flex items-center justify-between text-[7px] text-slate-500 mb-0.5">
                <div>{new Date(m.created_at).toLocaleString()}</div>
                <div className="flex gap-1">
                  {editingId === m.id ? (
                    <>
                      <button
                        onClick={() => submitEdit(m.id)}
                        disabled={busy}
                        className="px-1 rounded bg-amber-700 hover:bg-amber-600 text-amber-50 disabled:opacity-50"
                      >
                        save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditDraft(""); }}
                        className="px-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(m.id); setEditDraft(m.content); }}
                        disabled={busy}
                        className="px-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50"
                        title="Edit this memory"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => removeOne(m.id)}
                        disabled={busy}
                        className="px-1 rounded bg-red-900/60 hover:bg-red-800/70 text-red-100 disabled:opacity-50"
                        title="Delete this memory"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editingId === m.id ? (
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  className="w-full px-1.5 py-1 text-[9px] bg-slate-900 border border-slate-700 rounded text-slate-200 resize-none focus:outline-none focus:border-amber-600 break-words"
                />
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelationshipRow({ rel }: { rel: AgentRelationship }) {
  const score = rel.trust_score;
  const label =
    score > 0.5 ? "close ally"
    : score > 0.2 ? "trusted"
    : score > -0.2 ? "neutral"
    : "skeptical";
  const color = score > 0.2 ? "#86efac" : score < -0.2 ? "#fca5a5" : "#cbd5e1";
  return (
    <div className="flex items-center gap-2 text-[9px]">
      <div
        className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[12px]"
        style={{ background: rel.color, boxShadow: `0 0 0 1px #0f172a` }}
      >
        {rel.emoji}
      </div>
      <div className="flex-1 text-slate-200">{rel.target_name}</div>
      <div style={{ color }}>{label}</div>
      <div className="text-slate-500 tabular-nums">
        {score >= 0 ? "+" : ""}
        {score.toFixed(2)}
      </div>
    </div>
  );
}

function ChatTurnBubble({ turn, agent }: { turn: ChatTurn; agent: Agent }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] text-[10px] leading-relaxed bg-amber-700/40 border border-amber-700/60 text-amber-50 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <div
        className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-base mt-0.5"
        style={{
          background: agent.color,
          boxShadow: `0 0 0 2px #0f172a, 0 0 0 3px ${agent.color}`,
        }}
      >
        {agent.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="text-[10px] text-slate-100 font-medium">{agent.name}</div>
          {turn.streaming && (
            <div className="text-[7px] text-amber-400 animate-pulse">typing…</div>
          )}
        </div>
        <div className="text-[10px] leading-relaxed mt-0.5 text-slate-300 whitespace-pre-wrap break-words">
          {turn.content || (turn.streaming ? " " : "")}
          {turn.streaming && (
            <span className="inline-block w-1 ml-0.5 bg-amber-400 animate-pulse">
              &nbsp;
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Unified bottom input (dispatches chat vs meeting based on mode) ───────

function PanelInput({
  mode,
  chatAgentName,
  disabled,
  onSubmit,
  enableTools,
  setEnableTools,
  toolCount,
  includeObserverContext,
  setIncludeObserverContext,
  observerAvailable,
  observerBackend,
}: {
  mode: "chat" | "meeting";
  chatAgentName: string | undefined;
  disabled: boolean;
  onSubmit: (text: string) => void;
  enableTools: boolean;
  setEnableTools: (v: boolean) => void;
  toolCount: number;
  includeObserverContext: boolean;
  setIncludeObserverContext: (v: boolean) => void;
  observerAvailable: boolean;
  observerBackend: string | null;
}) {
  const [value, setValue] = useState("");
  const [briefingPreview, setBriefingPreview] = useState<ObserverBriefingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // Debounced preview fetch when the user has the checkbox on AND types a
  // scenario. 600ms after they stop typing we ask the backend what would be
  // sent. Cleared if they uncheck, switch to chat, or clear the textarea.
  useEffect(() => {
    if (mode !== "meeting" || !includeObserverContext || !observerAvailable) {
      setBriefingPreview(null);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setBriefingPreview(null);
      return;
    }
    setPreviewLoading(true);
    const t = setTimeout(() => {
      fetchObserverBriefingPreview(trimmed)
        .then((p) => setBriefingPreview(p))
        .catch(() => setBriefingPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => {
      clearTimeout(t);
      setPreviewLoading(false);
    };
  }, [value, mode, includeObserverContext, observerAvailable]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
    setBriefingPreview(null);
  };

  const placeholder =
    disabled && mode === "meeting"
      ? "Meeting in progress…"
      : disabled && mode === "chat"
      ? `${chatAgentName ?? "Agent"} is typing…`
      : mode === "chat"
      ? `Message ${chatAgentName ?? "agent"} (Enter to send)`
      : "Scenario for the agents to discuss (Enter to send)";

  const buttonLabel = mode === "chat" ? "Send" : "Start meeting";

  return (
    <div className="px-4 py-3 border-t-2 border-office-wall bg-black/20">
      {/* Allow-agent-tools toggle. Meeting mode only — single-agent chats
          don't run through the tool loop. Default OFF; persists via
          localStorage in CommPanel. */}
      {mode === "meeting" && (
        <label
          className="flex items-center gap-2 mb-1.5 select-none cursor-pointer"
          title="When on, agents can call web search / arXiv / FX / Wikipedia / HN / current_datetime during the discussion phases."
        >
          <input
            type="checkbox"
            checked={enableTools}
            onChange={(e) => setEnableTools(e.target.checked)}
            disabled={disabled}
            className="w-3 h-3 accent-amber-600 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-[9px] text-slate-300">
            Allow agents to use tools
          </span>
          {toolCount > 0 && (
            <span className="text-[8px] text-slate-500 ml-auto">
              {toolCount} tool{toolCount === 1 ? "" : "s"} available
            </span>
          )}
        </label>
      )}

      {/* Include-Observer-context toggle + preview pane. Meeting mode only.
          Greyed-out + disabled if the Observer bridge isn't reachable. */}
      {mode === "meeting" && (
        <>
          <label
            className={`flex items-center gap-2 mb-2 select-none ${
              observerAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"
            }`}
            title={
              observerAvailable
                ? "Inject a 'USER CONTEXT' block (recent app activity + screen-OCR snippets relevant to the scenario) from Omniscient Observer into every agent's prompt."
                : "Omniscient Observer isn't reachable. Configure OBSERVER_DB_PATH in backend/.env to enable."
            }
          >
            <input
              type="checkbox"
              checked={includeObserverContext && observerAvailable}
              onChange={(e) => setIncludeObserverContext(e.target.checked)}
              disabled={disabled || !observerAvailable}
              className="w-3 h-3 accent-amber-600 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-[9px] text-slate-300">
              Include my recent activity (Observer)
            </span>
            {observerBackend && (
              <span className="text-[8px] text-slate-500 ml-auto">
                via {observerBackend}
              </span>
            )}
            {!observerAvailable && (
              <span className="text-[8px] text-slate-600 ml-auto">offline</span>
            )}
          </label>

          {/* Preview pane — only when checkbox is on, observer reachable,
              and the user has typed something. Shows EXACTLY what the
              agents will see, so the user can't be surprised. */}
          {includeObserverContext && observerAvailable && (previewLoading || briefingPreview) && (
            <div className="mb-2 rounded border border-amber-700/40 bg-amber-900/15 px-2 py-1.5">
              {previewLoading && (
                <div className="text-[8px] text-amber-200/70">Building preview…</div>
              )}
              {!previewLoading && briefingPreview && (
                <div className="text-[8px] text-amber-100/90 space-y-1">
                  {briefingPreview.available ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="text-amber-300 font-medium">
                          📡 USER CONTEXT preview · {briefingPreview.lookback_hours}h
                        </div>
                        <button
                          onClick={() => setPreviewExpanded((v) => !v)}
                          className="text-[7px] text-amber-300 hover:text-amber-200 underline"
                        >
                          {previewExpanded ? "less" : "show full"}
                        </button>
                      </div>
                      {briefingPreview.activity_summary && (
                        <div className="text-amber-100/90">
                          <span className="text-amber-300/70">activity:</span>{" "}
                          {briefingPreview.activity_summary}
                        </div>
                      )}
                      <div className="text-amber-300/70">
                        {briefingPreview.observation_snippets.length} snippet
                        {briefingPreview.observation_snippets.length === 1 ? "" : "s"}{" "}
                        matched (keywords: {briefingPreview.keywords.join(", ") || "—"})
                      </div>
                      {previewExpanded && (
                        <pre className="mt-1 text-[7px] text-amber-100/80 whitespace-pre-wrap break-words max-h-40 overflow-y-auto scrollbar-thin">
                          {briefingPreview.rendered_block}
                        </pre>
                      )}
                    </>
                  ) : (
                    <div className="text-amber-300/70">
                      No relevant activity in the last {briefingPreview.lookback_hours}h
                      — meeting will run without Observer context.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          className="flex-1 px-3 py-2 text-[10px] bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-amber-600 disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="text-[10px] px-3 rounded bg-amber-700 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-amber-50 border border-amber-600 disabled:border-slate-600 transition-colors whitespace-nowrap"
        >
          {buttonLabel}
        </button>
      </div>
      <div className="text-[7px] text-slate-500 mt-1.5">
        {mode === "chat"
          ? `Direct message — only ${chatAgentName ?? "this agent"} will respond.`
          : "Group meeting — all brain regions debate and vote."}
      </div>
    </div>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] text-slate-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Pill({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <span className="text-[8px] px-2 py-1 rounded text-slate-200" style={{ background: bg }}>
      {children}
    </span>
  );
}

function ControlButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[8px] px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
    >
      {children}
    </button>
  );
}
