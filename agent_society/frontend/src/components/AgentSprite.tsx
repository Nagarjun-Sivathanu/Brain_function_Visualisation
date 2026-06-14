"use client";

import { motion, useMotionValue, useTransform, animate as fmAnimate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/lib/agentStore";
import { useMeetingStore } from "@/lib/meetingStore";
import { useChatStore } from "@/lib/chatStore";
import { findPath, toOffice, type RoomId } from "@/lib/officeLayout";
import { type Direction } from "@/components/PixelCharacter";
import { CharacterSprite } from "@/components/CharacterSprite";
import { baseFor, outfitFilter, PIXEL_SCALE } from "@/lib/sprites";
import type { Agent } from "@/types/agent";

// % per second — Stardew-ish walking pace.
const WALK_SPEED = 9;

interface Props {
  agent: Agent;
  room: RoomId;
  lx: number;
  ly: number;
}

export function AgentSprite({ agent, room, lx, ly }: Props) {
  const status = useAgentStore((s) => s.statuses[agent.id] ?? "idle");
  const selectedId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const hoverAgent = useAgentStore((s) => s.hoverAgent);
  const setWalking = useAgentStore((s) => s.setWalking);
  const isMeetingThinking = useMeetingStore((s) =>
    s.view.speakingAgentIds.includes(agent.id),
  );
  const isChatThinking = useChatStore(
    (s) => s.threads[agent.id]?.isStreaming ?? false,
  );
  const isThinking = isMeetingThinking || isChatThinking;

  const isSelected = selectedId === agent.id;

  // Motion values for absolute % position
  const initial = toOffice(room, lx, ly);
  const mx = useMotionValue(initial.x);
  const my = useMotionValue(initial.y);

  const leftPct = useTransform(mx, (v) => `${v}%`);
  const topPct = useTransform(my, (v) => `${v}%`);

  // Track what target we last began walking toward, so we don't restart on every render.
  const lastTargetRef = useRef<{ room: RoomId; lx: number; ly: number }>({ room, lx, ly });
  const lastTargetRoomRef = useRef<RoomId>(room);
  const walkIdRef = useRef(0);

  const [isWalking, setIsWalkingLocal] = useState(false);
  const [walkFrame, setWalkFrame] = useState(0);
  const [direction, setDirection] = useState<Direction>("south");

  const charBase = baseFor(agent.id);
  const charFilter = outfitFilter(agent.id, agent.color);

  // ── Walk animation effect ──
  useEffect(() => {
    const sameTarget =
      lastTargetRef.current.room === room &&
      Math.abs(lastTargetRef.current.lx - lx) < 0.001 &&
      Math.abs(lastTargetRef.current.ly - ly) < 0.001;
    if (sameTarget) return;

    const targetAbs = toOffice(room, lx, ly);
    const fromAbs = { x: mx.get(), y: my.get() };

    const path = findPath(lastTargetRoomRef.current, fromAbs, room, targetAbs, agent.id);
    lastTargetRef.current = { room, lx, ly };
    lastTargetRoomRef.current = room;

    if (path.length < 2) return;

    // Increment walk id — any old in-flight walk for this agent must abandon
    const myId = ++walkIdRef.current;

    let stepInterval: ReturnType<typeof setInterval> | null = null;

    async function walk() {
      setIsWalkingLocal(true);
      setWalking(agent.id, true);
      stepInterval = setInterval(() => {
        setWalkFrame((s) => (s + 1) % 6);
      }, 120);

      for (let i = 1; i < path.length; i++) {
        if (walkIdRef.current !== myId) return; // cancelled
        const a = path[i - 1];
        const b = path[i];
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        if (segDist < 0.01) continue;

        setDirection(getDirection(a, b));

        const segDur = segDist / WALK_SPEED;
        const ctrlX = fmAnimate(mx, b.x, { duration: segDur, ease: "linear" });
        const ctrlY = fmAnimate(my, b.y, { duration: segDur, ease: "linear" });
        try {
          await Promise.all([ctrlX, ctrlY]);
        } catch {
          return;
        }
      }

      if (walkIdRef.current !== myId) return;

      setIsWalkingLocal(false);
      setWalking(agent.id, false);
      setWalkFrame(0);
      setDirection("south");
      if (stepInterval) clearInterval(stepInterval);
    }

    walk();

    return () => {
      if (stepInterval) clearInterval(stepInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, lx, ly]);

  return (
    <motion.button
      style={{ left: leftPct, top: topPct }}
      onClick={(e) => {
        e.stopPropagation();
        selectAgent(isSelected ? null : agent.id);
      }}
      onMouseEnter={() => hoverAgent(agent.id)}
      onMouseLeave={() => hoverAgent(null)}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20"
    >
      {/* soft foot shadow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/40"
        style={{
          width: 18,
          height: 4,
          bottom: 12,
          filter: "blur(2px)",
        }}
      />

      <div
        className="relative flex items-center justify-center"
        style={{
          // subtle ring while selected/chatting — NO pulsing glow on meeting
          boxShadow: isSelected
            ? "0 0 0 2px #fef3c7"
            : status === "chatting"
            ? "0 0 0 1px #60a5fa"
            : undefined,
          borderRadius: "4px",
          padding: "1px",
        }}
      >
        {isThinking && <ThinkingBubble />}
        <motion.div
          animate={isWalking ? {} : { y: [0, -1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <CharacterSprite
            base={charBase}
            dir={direction}
            walking={isWalking}
            frame={walkFrame}
            filter={charFilter}
            width={16 * PIXEL_SCALE}
          />
        </motion.div>
      </div>

      <div
        className="text-[8px] px-1.5 py-0.5 rounded bg-amber-950/95 text-amber-50 whitespace-nowrap mt-0.5"
        style={{ boxShadow: `0 0 0 1px ${agent.color}` }}
      >
        {agent.name}
      </div>
    </motion.button>
  );
}

function getDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

/**
 * Comic-style thought bubble that floats above the agent's head while their
 * model is generating tokens. Three dots animate in sequence to suggest thinking.
 * Sized and styled for visibility — bright amber, dark dots, drop-shadow,
 * gentle hover bob so it stands out against the office backdrop.
 */
function ThinkingBubble() {
  return (
    <motion.div
      className="absolute left-1/2 pointer-events-none z-40"
      style={{ top: -32, transform: "translateX(-50%)" }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <div
        className="flex items-center gap-[4px] px-2.5 py-1.5 rounded-full bg-amber-50 border-2 border-amber-700"
        style={{
          boxShadow: "0 3px 6px rgba(0,0,0,0.5), 0 0 0 1px #0f172a",
          minWidth: 28,
        }}
      >
        <ThinkingDot delay={0} />
        <ThinkingDot delay={0.2} />
        <ThinkingDot delay={0.4} />
      </div>
      {/* tail dots (the classic two small bubbles under the main one) */}
      <div className="flex flex-col items-start ml-[10px] mt-[2px] gap-[2px]">
        <div
          className="rounded-full bg-amber-50 border border-amber-700"
          style={{ width: 6, height: 6 }}
        />
        <div
          className="rounded-full bg-amber-50 border border-amber-700"
          style={{ width: 4, height: 4 }}
        />
      </div>
    </motion.div>
  );
}

function ThinkingDot({ delay }: { delay: number }) {
  return (
    <motion.span
      className="block rounded-full bg-amber-900"
      style={{ width: 5, height: 5 }}
      animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
      transition={{
        duration: 0.9,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}
