import type { AgentConfig, BriefAssistDraft, DebateSession, DiscussionPlanItem, SessionMode, SessionSummary } from "./types";

const explicitBase = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE = explicitBase?.replace(/\/$/, "") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload as T;
}

export function getAgents() {
  return request<{ configPath: string; agents: AgentConfig[] }>("/api/agents");
}

export function saveAgents(agents: AgentConfig[]) {
  return request<{ configPath: string; agents: AgentConfig[] }>("/api/agents", {
    method: "PUT",
    body: JSON.stringify({ agents })
  });
}

export function listSessions() {
  return request<{ sessions: SessionSummary[] }>("/api/sessions");
}

export function getSession(sessionId: string) {
  return request<{ session: DebateSession }>(`/api/sessions/${sessionId}`);
}

export function deleteSession(sessionId: string) {
  return request<{ ok: boolean; deleted: number }>(`/api/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export function clearSessions() {
  return request<{ ok: boolean; deleted: number }>("/api/sessions", {
    method: "DELETE"
  });
}

export function createSession(input: {
  mode: SessionMode;
  topic: string;
  context: string;
  goal: string;
  maxRounds: number;
  minRounds: number;
  agentIds: string[];
  discussionPlan?: DiscussionPlanItem[];
}) {
  return request<{ session: DebateSession }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function assistBrief(input: {
  mode: SessionMode;
  topic: string;
  context: string;
  goal: string;
  maxRounds: number;
  minRounds: number;
  agentIds: string[];
}) {
  return request<{ draft: BriefAssistDraft; source: "agent" | "fallback"; warning?: string }>("/api/brief-assist", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function stopSession(sessionId: string) {
  return request<{ session: DebateSession }>(`/api/sessions/${sessionId}/stop`, {
    method: "POST"
  });
}

export function continueSession(sessionId: string, rounds = 1) {
  return request<{ session: DebateSession }>(`/api/sessions/${sessionId}/continue`, {
    method: "POST",
    body: JSON.stringify({ rounds })
  });
}

export function repairSession(sessionId: string, continueRun = true) {
  return request<{ session: DebateSession; repaired: boolean; continued: boolean; reason?: string }>(
    `/api/sessions/${sessionId}/repair`,
    {
      method: "POST",
      body: JSON.stringify({ continue: continueRun })
    }
  );
}

export function synthesizeSession(sessionId: string) {
  return request<{ session: DebateSession }>(`/api/sessions/${sessionId}/synthesize`, {
    method: "POST"
  });
}

export function sessionEventsUrl(sessionId: string) {
  return `${API_BASE}/api/sessions/${sessionId}/events`;
}

export function sessionDocumentUrl(sessionId: string) {
  return `${API_BASE}/api/sessions/${sessionId}/document`;
}
