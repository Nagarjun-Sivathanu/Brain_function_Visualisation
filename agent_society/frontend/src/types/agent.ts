export type AgentStatus = "idle" | "meeting" | "chatting";

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  temperature: number;
  personality_traits: string[];
  expertise: string[];
  emoji: string;
  color: string;
  level?: number;
}

export interface AgentMemory {
  id: number;
  agent_id: string;
  memory_type: string;
  content: string;
  meeting_id: string | null;
  created_at: string;
}

export interface AgentRelationship {
  trust_score: number;
  interaction_count: number;
  target_name: string;
  emoji: string;
  color: string;
}
