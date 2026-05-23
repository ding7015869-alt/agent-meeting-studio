export type AgentMode = "mock" | "command" | "openai-compatible" | "local-model";
export type AgentKind = "participant" | "moderator";
export type SessionMode = "debate" | "discussion";
export type SessionStatus = "queued" | "running" | "complete" | "stopped" | "error";
export type MessageStatus = "streaming" | "complete" | "stopped" | "error";

export interface AgentConfig {
  id: string;
  name: string;
  title?: string;
  mode: AgentMode | string;
  enabled: boolean;
  kind?: AgentKind | string;
  color?: string;
  role?: string;
  stance?: string;
  style?: string;
  mission?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  shell?: boolean;
  stdin?: string;
  stdoutMode?: string;
  outputFile?: boolean;
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface DebateMessage {
  id: string;
  type: "agent" | "moderator" | "result" | "system";
  round: number;
  agentId: string;
  agentName: string;
  agentTitle?: string;
  agentColor?: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  completedAt?: string | null;
  error?: string;
  errorCode?: string;
  errorTitle?: string;
  errorHint?: string;
}

export interface DebateSession {
  id: string;
  mode?: SessionMode;
  topic: string;
  context: string;
  goal: string;
  maxRounds: number;
  minRounds: number;
  currentRound: number;
  status: SessionStatus;
  phase: string;
  createdAt: string;
  updatedAt: string;
  agents: AgentConfig[];
  moderator: AgentConfig | null;
  messages: DebateMessage[];
  result: string;
  resultHtml?: string;
  storagePath?: string;
  htmlPath?: string;
  documentUrl?: string;
  debatePlan?: Array<{ title: string; question: string; affirmative: string; negative: string; criteria: string }>;
  debateOutcomes?: Array<{
    title: string;
    question: string;
    affirmative: string;
    negative: string;
    criteria: string;
    judgment: string;
  }>;
  discussionPlan?: Array<{ title: string; question: string; acceptance: string }>;
  discussionDecisions?: Array<{ title: string; question: string; acceptance: string; decision: string }>;
  research?: {
    enabled: boolean;
    query: string;
    updatedAt: string;
    items: Array<{ title: string; url: string; snippet: string }>;
    error?: string;
  } | null;
  error?: string;
}

export interface DiscussionPlanItem {
  title: string;
  question: string;
  acceptance: string;
}

export interface BriefQuestionOption {
  label: string;
  effect: string;
}

export interface BriefQuestion {
  id: string;
  question: string;
  options: BriefQuestionOption[];
}

export interface BriefAssistDraft {
  mode: SessionMode;
  topic: string;
  context: string;
  goal: string;
  minRounds: number;
  maxRounds: number;
  summary: string;
  items: DiscussionPlanItem[];
  questions: BriefQuestion[];
}

export interface SessionSummary {
  id: string;
  mode?: SessionMode;
  topic: string;
  status: SessionStatus;
  currentRound: number;
  maxRounds: number;
  createdAt: string;
  updatedAt: string;
  result: string;
}
