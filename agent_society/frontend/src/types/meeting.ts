export type MeetingStage =
  | "initial_opinions"
  | "critique_round"
  | "refinement_round"
  | "voting"
  | "consensus_summary";

export type VotePosition = "for" | "against" | "abstain";

export interface Meeting {
  id: string;
  scenario: string;
  status: "pending" | "running" | "complete";
  created_at: string;
  result_summary: string | null;
  /** True if this meeting was started with the agent-tool-use flag.
   *  Stored so the header can show a "🔧 tools on" badge after start. */
  enable_tools?: boolean;
  /** True if this meeting was started with Observer context injection. */
  include_observer_context?: boolean;
}

export interface MeetingMessage {
  id: number;
  meeting_id: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  stage: MeetingStage;
  content: string;
  created_at: string;
  emoji: string;
  color: string;
}

export interface Vote {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  position: VotePosition;
  confidence: number;
  reasoning: string;
  emoji: string;
  color: string;
}

export type SseEvent =
  | { type: "stage_change"; stage: MeetingStage }
  | { type: "agent_start"; agent_id: string; stage: MeetingStage }
  | { type: "token"; agent_id: string; text: string }
  | { type: "agent_end"; agent_id: string }
  | { type: "vote"; agent_id: string; position: VotePosition; confidence: number; reasoning: string }
  | { type: "phase_paused"; completed_stage: MeetingStage; next_stage: MeetingStage }
  | { type: "interjection"; content: string }
  | { type: "error"; meeting_id: string; message: string }
  | { type: "meeting_end"; meeting_id: string };
