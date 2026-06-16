"use client";

import { useEffect, useRef } from "react";
import { useMeetingStore } from "@/lib/meetingStore";
import { useUiStore } from "@/lib/uiStore";

/** Top-right controls over the left pane: Office⇆Terminal view toggle and the
 *  replay transport (timeline scrubber over the event log). */
export function ControlBar() {
  const leftView = useUiStore((s) => s.leftView);
  const setLeftView = useUiStore((s) => s.setLeftView);
  const showLinks = useUiStore((s) => s.showLinks);
  const setShowLinks = useUiStore((s) => s.setShowLinks);

  const events = useMeetingStore((s) => s.events);
  const cursor = useMeetingStore((s) => s.cursor);
  const replaying = useMeetingStore((s) => s.replaying);
  const replayTo = useMeetingStore((s) => s.replayTo);
  const setReplaying = useMeetingStore((s) => s.setReplaying);
  const meetingId = useMeetingStore((s) => s.meetingId);
  const status = useMeetingStore((s) => s.view.status);

  // Download the meeting's clean structured JSON (assessment + result). The
  // backend sets Content-Disposition, so the browser saves it as a file.
  const canDownload = !!meetingId && status === "complete";
  const downloadJson = () => {
    if (!meetingId) return;
    const a = document.createElement("a");
    a.href = `/api/meetings/${meetingId}/export?download=1`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = events.length;
  const playing = replaying && cursor < total;

  // Drive playback: advance the cursor a few events/sec while "playing".
  useEffect(() => {
    if (playRef.current) { clearInterval(playRef.current); playRef.current = null; }
    if (!playing) return;
    playRef.current = setInterval(() => {
      const s = useMeetingStore.getState();
      if (s.cursor >= s.events.length) {
        if (playRef.current) clearInterval(playRef.current);
        return;
      }
      s.replayTo(s.cursor + 1);
    }, 140);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing]);

  const goLive = () => { setReplaying(false); replayTo(total); };
  const play = () => { setReplaying(true); if (cursor >= total) replayTo(0); };
  const pause = () => setReplaying(false);
  const step = (d: number) => { setReplaying(true); replayTo(cursor + d); };

  return (
    <div className="absolute top-2 right-2 z-40 flex flex-col items-end gap-2">
      <div className="flex rounded-full bg-black/70 border border-slate-700 p-0.5 text-[11px]">
        <button
          onClick={() => setLeftView("office")}
          className={`px-3 py-1 rounded-full font-semibold ${leftView === "office" ? "bg-amber-500 text-black" : "text-slate-300"}`}
        >Office</button>
        <button
          onClick={() => setLeftView("terminal")}
          className={`px-3 py-1 rounded-full font-semibold ${leftView === "terminal" ? "bg-sky-500 text-black" : "text-slate-300"}`}
        >Terminal</button>
        <button
          onClick={() => setShowLinks(!showLinks)}
          title="Show/hide the interaction edges between regions"
          className={`px-3 py-1 rounded-full font-semibold ${showLinks ? "bg-fuchsia-500 text-black" : "text-slate-400"}`}
        >Links</button>
        <button
          onClick={downloadJson}
          disabled={!canDownload}
          title={canDownload
            ? "Download this meeting's structured JSON (assessment + result)"
            : "Available once the meeting finishes"}
          className={`px-3 py-1 rounded-full font-semibold ${canDownload ? "text-emerald-300 hover:bg-slate-700" : "text-slate-600 cursor-not-allowed"}`}
        >⤓ JSON</button>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-1.5 rounded-full bg-black/70 border border-slate-700 px-2 py-1">
          <TBtn label="⏮" title="Start" onClick={() => step(-cursor)} />
          <TBtn label="◀" title="Step back" onClick={() => step(-1)} />
          {playing
            ? <TBtn label="⏸" title="Pause" onClick={pause} />
            : <TBtn label="▶" title="Play" onClick={play} />}
          <TBtn label="▶▏" title="Step forward" onClick={() => step(1)} />
          <input
            type="range" min={0} max={total} value={cursor}
            onChange={(e) => { setReplaying(true); replayTo(Number(e.target.value)); }}
            className="w-32 accent-amber-500"
          />
          <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{cursor}/{total}</span>
          <TBtn label="LIVE" title="Jump to latest" onClick={goLive} active={!replaying} />
        </div>
      )}
    </div>
  );
}

function TBtn({ label, title, onClick, active }: { label: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${active ? "bg-emerald-500 text-black" : "text-slate-200 hover:bg-slate-700"}`}
    >
      {label}
    </button>
  );
}
