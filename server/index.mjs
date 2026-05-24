import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 手动加载 .env（不用 dotenv 依赖，零外部包）
const envPath = join(rootDir, ".env");
try {
  const envRaw = readFileSync(envPath, "utf8");
  for (const line of envRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch (_) { /* .env 不存在或不可读，跳过 */ }

const configPath = resolve(process.env.AGENT_CONFIG || join(rootDir, "agents.config.json"));
const sessionsDir = resolve(process.env.SESSIONS_DIR || join(rootDir, "data", "sessions"));
const exportsDir = resolve(process.env.EXPORTS_DIR || join(rootDir, "data", "exports"));
const port = Number(process.env.PORT || 8787);

await mkdir(sessionsDir, { recursive: true });
await mkdir(exportsDir, { recursive: true });

const sessions = new Map();
const subscribers = new Map();
const defaultResearch = {
  enabled: true,
  maxResults: 5,
  timeoutMs: 8000
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    ...corsHeaders(),
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readAgentConfig() {
  let raw = "";
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    raw = await readFile(join(rootDir, "agents.config.example.json"), "utf8");
  }
  const parsed = JSON.parse(raw);
  return {
    agents: Array.isArray(parsed.agents) ? parsed.agents : [],
    research: { ...defaultResearch, ...(parsed.research || {}) }
  };
}

async function writeAgentConfig(agents) {
  let existing = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    existing = {};
  }
  const payload = `${JSON.stringify({ ...existing, agents }, null, 2)}\n`;
  await writeFile(configPath, payload, "utf8");
}

function publicAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title || "",
    mode: agent.mode || "mock",
    enabled: agent.enabled !== false,
    kind: agent.kind || "participant",
    color: agent.color || "#4f46e5",
    role: agent.role || "",
    stance: agent.stance || "",
    style: agent.style || "",
    mission: agent.mission || "",
    command: agent.command || "",
    args: Array.isArray(agent.args) ? agent.args : [],
    cwd: agent.cwd || "",
    timeoutMs: Number(agent.timeoutMs || 120000),
    shell: Boolean(agent.shell),
    stdin: typeof agent.stdin === "string" ? agent.stdin : "",
    stdoutMode: agent.stdoutMode || "stream",
    outputFile: Boolean(agent.outputFile),
    baseUrl: agent.baseUrl || "",
    model: agent.model || "",
    apiKeyEnv: agent.apiKeyEnv || "",
    temperature: agent.temperature,
    maxTokens: agent.maxTokens
  };
}

function displayAgentName(agent) {
  return agent.title || agent.role || agent.name || agent.id;
}

function sessionStoragePath(session) {
  return join(sessionsDir, `${session.id}.json`);
}

function sessionHtmlPath(session) {
  return join(exportsDir, `${session.id}.html`);
}

function isSafeSessionId(sessionId) {
  return /^[a-z0-9_-]+$/i.test(String(sessionId || ""));
}

function sessionStoragePathForId(sessionId) {
  return join(sessionsDir, `${sessionId}.json`);
}

function sessionHtmlPathForId(sessionId) {
  return join(exportsDir, `${sessionId}.html`);
}

function publicMessage(message) {
  return {
    id: message.id,
    type: message.type,
    round: message.round,
    agentId: message.agentId,
    agentName: message.agentName,
    agentTitle: message.agentTitle,
    agentColor: message.agentColor,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt,
    completedAt: message.completedAt,
    error: message.error,
    errorCode: message.errorCode || "",
    errorTitle: message.errorTitle || "",
    errorHint: message.errorHint || ""
  };
}

function publicSession(session) {
  return {
    id: session.id,
    mode: session.mode || "debate",
    topic: session.topic,
    context: session.context,
    goal: session.goal,
    maxRounds: session.maxRounds,
    minRounds: session.minRounds,
    currentRound: session.currentRound,
    status: session.status,
    phase: session.phase,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agents: session.agents.map(publicAgent),
    moderator: session.moderator ? publicAgent(session.moderator) : null,
    messages: session.messages.map(publicMessage),
    result: session.result,
    resultHtml: session.resultHtml || "",
    storagePath: sessionStoragePath(session),
    htmlPath: session.resultHtml ? sessionHtmlPath(session) : "",
    documentUrl: `/api/sessions/${session.id}/document`,
    debatePlan: session.debatePlan || [],
    debateOutcomes: session.debateOutcomes || [],
    discussionPlan: session.discussionPlan || [],
    discussionDecisions: session.discussionDecisions || [],
    research: session.research,
    error: session.error
  };
}

function summarizeSession(session) {
  return {
    id: session.id,
    mode: session.mode || "debate",
    topic: session.topic,
    status: session.status,
    currentRound: session.currentRound,
    maxRounds: session.maxRounds,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    result: session.result ? session.result.slice(0, 280) : ""
  };
}

async function persistSession(session) {
  if (session.deleted) return;
  session.updatedAt = new Date().toISOString();
  const file = sessionStoragePath(session);
  await writeFile(file, `${JSON.stringify(publicSession(session), null, 2)}\n`, "utf8");
  if (session.resultHtml) {
    await writeFile(sessionHtmlPath(session), session.resultHtml, "utf8");
  }
}

function getSubscribers(sessionId) {
  if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
  return subscribers.get(sessionId);
}

function emit(session, event, payload) {
  if (session.deleted) return;
  const clients = subscribers.get(session.id);
  if (!clients) return;
  const data = JSON.stringify(payload);
  for (const res of clients) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  }
}

async function setSessionPhase(session, status, phase = "") {
  session.status = status;
  session.phase = phase;
  await persistSession(session);
  emit(session, "session", publicSession(session));
}

function addMessage(session, message) {
  session.messages.push(message);
  emit(session, "message-start", publicMessage(message));
}

async function updateMessage(session, message, patch, event = "message-update") {
  Object.assign(message, patch);
  await persistSession(session);
  emit(session, event, publicMessage(message));
}

async function closeAbandonedStreamingMessages(session, reason = "服务重启或运行中断后已暂停，可继续本会话。") {
  const now = new Date().toISOString();
  let changed = false;
  for (const message of session.messages || []) {
    if (message.status === "streaming") {
      message.status = "stopped";
      message.completedAt = message.completedAt || now;
      message.errorHint = message.errorHint || reason;
      changed = true;
      emit(session, "message-complete", publicMessage(message));
    }
  }
  if (changed) await persistSession(session);
  return changed;
}

async function recoverAbandonedRunningSession(session) {
  if (session.status !== "running" || session.currentChild) return false;
  const changed = await closeAbandonedStreamingMessages(session);
  session.status = "stopped";
  session.phase = changed ? "运行已暂停，可继续" : "服务重启后已暂停，可继续";
  session.stopRequested = false;
  await persistSession(session);
  return true;
}

function renderTemplate(value, vars) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const next = vars[key];
    return next == null ? "" : String(next);
  });
}

function stripXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compactText(value, max = 900) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 18).trim()}...（已截断）`;
}

function cleanResearchSegment(value) {
  return String(value || "")
    .replace(/[“”"']/g, " ")
    .replace(/[\/|｜]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(请|帮我|帮忙|麻烦|把|将|当前|这个|本次|围绕|需要|我要|我想|给我|给出|做一个|做成|优化成)+/g, "")
    .replace(/^(一个|一些|几个|更加|更适合|请围绕)+/g, "")
    .trim();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildResearchQuery(topic, context) {
  const raw = [topic, context].filter(Boolean).join(" ");
  const normalized = String(raw || "")
    .replace(/[，。！？；;：:\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const segments = normalized
    .split(/[,.!?]+|\s{2,}/)
    .map(cleanResearchSegment)
    .filter((segment) => segment.length >= 6);
  const lead = segments.find((segment) => /[A-Za-z0-9\u4e00-\u9fff]/.test(segment)) || cleanResearchSegment(normalized);
  const englishTerms = uniqueValues(
    normalized.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || []
  )
    .filter((term) => !/^(the|and|for|with|into|this|that|from|your|about|please)$/i.test(term))
    .slice(0, 6);
  const terms = englishTerms.filter((term) => !lead.toLowerCase().includes(term.toLowerCase()));
  return compactText([lead, ...terms].join(" ").replace(/\s+/g, " ").trim() || normalized, 140);
}

function researchRelevanceTokens(query) {
  const english = (query.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}/g) || []).map((token) => token.toLowerCase());
  const chinese = query
    .split(/\s+/)
    .map((token) => token.replace(/[^\u4e00-\u9fff]/g, ""))
    .filter((token) => token.length >= 2 && token.length <= 12);
  return uniqueValues([...english, ...chinese]);
}

function isNoisyResearchItem(item, query) {
  const title = stripXml(item.title);
  const haystack = `${title} ${stripXml(item.snippet)} ${stripXml(item.url)}`.toLowerCase();
  const tokens = researchRelevanceTokens(query);
  const hasRelevantToken = tokens.some((token) => haystack.includes(token.toLowerCase()));
  const dictionaryNoise = /(_百度百科|汉典|拼音|笔顺|字典|词典|的意思|的解释|基本解释)/.test(title);
  if (dictionaryNoise && !/百科|定义|是什么意思|解释/.test(query)) return true;
  return tokens.length >= 2 && !hasRelevantToken;
}

function promptFullText(value, max = 20000) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n\n[系统提示：上一位回答超过 ${max} 字符，已在安全上限处截断。请明确指出仍需补全原文后再做最终判断。]`;
}

function classifyAgentError(error, agent = {}) {
  const raw = error?.message || String(error || "");
  const text = raw.toLowerCase();
  const agentLabel = displayAgentName(agent);

  if (/usage limit|hit your usage limit|get cursor pro|quota|rate limit|insufficient_quota|resource_exhausted/.test(text)) {
    return {
      code: "usage-limit",
      title: `${agentLabel} 额度耗尽`,
      hint: "该 agent 的后端账号或模型额度已用完。可以等待额度恢复、升级/更换账号，或在配置里把这个角色切到其他 CLI / 本地模型后继续。"
    };
  }

  if (/not logged in|login|oauth|auth|unauthorized|forbidden|401|403|api key|permission denied/.test(text)) {
    return {
      code: "auth",
      title: `${agentLabel} 登录或授权失效`,
      hint: "请先在对应 CLI 或模型服务里重新登录/配置 API Key。注意不同后端不会共享 Codex、Cursor、Hermes 的登录态。"
    };
  }

  if (/timed out|timeout|aborterror/.test(text)) {
    return {
      code: "timeout",
      title: `${agentLabel} 调用超时`,
      hint: "该 agent 在超时时间内没有完成输出。可以调大 timeoutMs、缩短题目/上下文、减少辩点/事项数量，或重试当前会话。"
    };
  }

  if (/enoent|not found|command not found|no such file or directory/.test(text)) {
    return {
      code: "command-not-found",
      title: `${agentLabel} 命令不存在`,
      hint: "请检查 agents.config.json 里的 command 路径是否正确，或改用 openai-compatible / local-model 配置。"
    };
  }

  if (/connection lost|econnreset|econnrefused|enotfound|epipe|network|socket|reconnecting/.test(text)) {
    return {
      code: "connection",
      title: `${agentLabel} 连接中断`,
      hint: "该 agent 后端连接不稳定或服务未启动。请确认本地服务/CLI 可用后再继续。"
    };
  }

  return {
    code: "agent-error",
    title: `${agentLabel} 调用失败`,
    hint: "请查看原始错误，修复对应 agent 配置或后端状态后再继续。"
  };
}

function formatAgentError(error, agent = {}) {
  const classified = classifyAgentError(error, agent);
  const raw = error?.message || String(error || "");
  return {
    ...classified,
    raw,
    content: [
      `Agent 调用失败：${classified.title}`,
      ``,
      classified.hint,
      ``,
      `原始错误：${raw}`
    ].join("\n")
  };
}

function assertAgentTurnComplete(message, label = "agent") {
  if (message?.status !== "error") return;
  const title = message.errorTitle || `${label} 调用失败`;
  const hint = message.errorHint ? ` ${message.errorHint}` : "";
  throw new Error(`${title}。${hint}`);
}

async function fetchWebResearch(topic, context, options = defaultResearch) {
  if (options.enabled === false) {
    return {
      enabled: false,
      query: "",
      updatedAt: new Date().toISOString(),
      items: [],
      error: "网络检索已关闭。"
    };
  }

  const query = buildResearchQuery(topic, context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || defaultResearch.timeoutMs));
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 Agent Meeting Studio"
      }
    });
    if (!response.ok) throw new Error(`Bing RSS returned HTTP ${response.status}`);

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: true,
      trimValues: true
    });
    const parsed = parser.parse(xml);
    const rawItems = parsed?.rss?.channel?.item;
    const items = (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [])
      .map((item) => ({
        title: stripXml(item.title),
        url: stripXml(item.link),
        snippet: stripXml(item.description)
      }))
      .filter((item) => item.title || item.snippet || item.url)
      .filter((item) => !isNoisyResearchItem(item, query))
      .slice(0, Number(options.maxResults || defaultResearch.maxResults));

    return {
      enabled: true,
      query,
      updatedAt: new Date().toISOString(),
      items,
      error: ""
    };
  } catch (error) {
    return {
      enabled: true,
      query,
      updatedAt: new Date().toISOString(),
      items: [],
      error: error.name === "AbortError" ? "网络检索超时。" : error.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function researchForPrompt(session) {
  const research = session.research;
  if (!research) return "（尚未检索。）";
  if (research.error && !research.items?.length) return `检索失败：${research.error}`;
  if (!research.items?.length) return "未检索到可用结果。";

  return [
    `检索时间：${research.updatedAt}`,
    `检索词：${research.query}`,
    ...research.items.map((item, index) => {
      return `${index + 1}. ${item.title}\n   ${item.snippet}\n   ${item.url}`;
    })
  ].join("\n");
}

function latestOtherMessage(session, agentId) {
  return [...session.messages]
    .reverse()
    .find((message) => message.type === "agent" && message.agentId !== agentId && message.status === "complete" && message.content.trim());
}

function latestOwnMessage(session, agentId) {
  return [...session.messages]
    .reverse()
    .find((message) => message.type === "agent" && message.agentId === agentId && message.status === "complete" && message.content.trim());
}

function roundSoFarForPrompt(session, round) {
  const messages = session.messages.filter(
    (message) => message.type === "agent" && message.round === round && message.status === "complete" && message.content.trim()
  );
  if (!messages.length) return "（你是本回合第一个发言者。）";
  return messages.map((message) => `【${message.agentName}】\n${compactText(message.content, 1200)}`).join("\n\n");
}

function transcriptForPrompt(session) {
  const completed = session.messages
    .filter((message) => message.status === "complete" && message.content.trim())
    .slice(-12);

  if (!completed.length) return "（暂无，当前是第一轮发言。）";

  return completed
    .map((message) => {
      const speaker = message.type === "result" ? "最终结果" : message.agentName || message.type;
      return `【${speaker}｜第 ${message.round || "-"} 回合】\n${compactText(message.content, 1200)}`;
    })
    .join("\n\n");
}

function discussionDecisionSummary(session, max = 900) {
  const decisions = Array.isArray(session.discussionDecisions) ? session.discussionDecisions : [];
  if (!decisions.length) return "（暂无已敲定事项。）";
  return decisions
    .map((decision, index) => {
      return `${index + 1}. ${decision.title}\n${compactText(decision.decision, max)}`;
    })
    .join("\n\n");
}

function discussionNaturalOutputRules() {
  return [
    `输出风格要求：`,
    `- 你必须先在内部按讨论会流程认真执行：理解总主题、读取上一位真实回答、确认自己的角色职责、结合网页线索、判断怎样服务最终方案。`,
    `- 但最终输出要像真人在方案会上发言，不要写成审计表、论文提纲、机械编号清单或固定栏目。`,
    `- 语言要短、清楚、有判断，可以保留少量方案名，但不要用大段表格，不要堆满“背景/框架/利弊/契合度/排序”这种模板词。`,
    `- 每次先说你真正的判断，再补必要理由；能用两段说完就不要写五段。`,
    `- 不要输出内心推理过程，不要说“作为 AI”。`
  ].join("\n");
}

function discussionIntroSourceLabel(introMessage) {
  return introMessage?.type === "system" ? "系统续跑给出的事项边界" : "主 agent 刚刚抛出的真实内容";
}

function buildDiscussionFallbackIntro(session, item, index, total, failedMessage) {
  const previousDecision = Array.isArray(session.discussionDecisions) ? session.discussionDecisions.at(-1) : null;
  const failureNote = failedMessage?.errorTitle || failedMessage?.error || "主 agent 本轮抛题未按时完成";
  return [
    `系统续跑提示：${failureNote}。这里不伪造主 agent 的观点，只按它已经拆出的事项继续推进，避免整场讨论卡死。`,
    ``,
    `第 ${index + 1}/${total} 个事项是「${item.title}」。这一步现在必须定，因为它会影响后续方案能否直接进入开发排期。`,
    `要解决的问题：${item.question}`,
    `判断标准：${item.acceptance}`,
    previousDecision ? `上一项已经拍板：${compactText(previousDecision.decision, 420)}` : "",
    ``,
    `请思路位直接给出 3 条差异明显、可开发落地的路线，并说明每条路线最适合的前提和最大风险。`
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function appendDiscussionFallbackIntro(session, item, index, total, failedMessage) {
  const now = new Date().toISOString();
  const message = {
    id: randomUUID(),
    type: "system",
    round: index + 1,
    agentId: "system-repair",
    agentName: "系统续跑",
    agentTitle: "系统续跑 / 抛出事项",
    agentColor: "#64748b",
    content: buildDiscussionFallbackIntro(session, item, index, total, failedMessage),
    status: "complete",
    createdAt: now,
    completedAt: now,
    error: "",
    errorCode: "",
    errorTitle: "",
    errorHint: ""
  };
  session.messages.push(message);
  await persistSession(session);
  emit(session, "message-start", publicMessage(message));
  emit(session, "message-complete", publicMessage(message));
  return message;
}

function buildDiscussionFallbackDecision(session, item, introMessage, ideasMessage, evaluationMessage, index, total, failedMessage) {
  const failureNote = failedMessage?.errorTitle || failedMessage?.error || "主 agent 本轮拍板未按时完成";
  const nextLine =
    index + 1 >= total
      ? "这已经是最后一个事项，后续可以直接汇总最终方案。"
      : `下一事项继续时，默认带着这个临时决策往前走；主 agent 恢复后仍可以重新覆盖这一项。`;
  return [
    `系统续跑决策：${failureNote}。这里不伪造主 agent 的判断，只按思路位和评估位的真实回答做一个可继续推进的临时收束。`,
    `当前事项：「${item.title}」。`,
    `评估位的真实建议是：${compactText(evaluationMessage.content, 520)}`,
    `因此本项先按评估位推荐的方向收束：优先选择最贴合主题、风险可控、能直接进入开发规划的路线；如果评估位建议组合方案，就采用组合方案，但把范围压到 MVP 能承受。`,
    `执行约束：不要新增超出本事项边界的大系统；所有结论必须能写入后续开发文档、内容表或 GitHub Issue。${nextLine}`
  ].join("\n\n");
}

async function appendDiscussionFallbackDecision(session, item, introMessage, ideasMessage, evaluationMessage, index, total, failedMessage) {
  const now = new Date().toISOString();
  const message = {
    id: randomUUID(),
    type: "system",
    round: index + 1,
    agentId: "system-repair",
    agentName: "系统续跑",
    agentTitle: "系统续跑 / 判断选择",
    agentColor: "#64748b",
    content: buildDiscussionFallbackDecision(session, item, introMessage, ideasMessage, evaluationMessage, index, total, failedMessage),
    status: "complete",
    createdAt: now,
    completedAt: now,
    error: "",
    errorCode: "",
    errorTitle: "",
    errorHint: ""
  };
  session.messages.push(message);
  await persistSession(session);
  emit(session, "message-start", publicMessage(message));
  emit(session, "message-complete", publicMessage(message));
  return message;
}

function findDiscussionStepMessage(session, round, titles) {
  const wanted = Array.isArray(titles) ? titles : [titles];
  return [...(session.messages || [])]
    .reverse()
    .find(
      (message) =>
        message.round === round &&
        wanted.includes(message.agentTitle) &&
        (message.status === "complete" || message.status === "error" || message.status === "stopped")
    );
}

function buildDiscussionPlanPrompt(session, agent) {
  return [
    `你是讨论模式的主 agent。请始终用中文回答。`,
    `你的任务不是辩论，而是把用户输入的“要讨论的事”拆成一组可以逐个敲定的事项。`,
    `后续流程固定为：你抛出事项 -> 思路 agent 提供多种方案 -> 评估 agent 分析利弊和主题契合度 -> 你判断并选择一个方案 -> 进入下一个事项。`,
    ``,
    `你的身份：${agent.name || agent.id}`,
    `你的风格：${agent.style || "清晰、结构化、可执行。"}`,
    `你的固定立场：${agent.stance || agent.role || "负责拆分、排序、拍板和最终方案一致性。"}`,
    ``,
    `总主题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    `事项数量要求：至少 ${session.minRounds} 个，最多 ${session.maxRounds} 个。`,
    ``,
    `公开网络检索摘要（只作为线索，不要编造不存在的信息）：`,
    researchForPrompt(session),
    ``,
    `请先用很短文字说明拆分逻辑，然后必须输出一个可解析 JSON 代码块，格式严格如下：`,
    "```json",
    `{"items":[{"title":"事项标题","question":"本事项要解决的具体问题","acceptance":"本事项敲定的判断标准"}]}`,
    "```",
    ``,
    `拆分要求：`,
    `- 每个事项必须能独立讨论并产生一个选择。`,
    `- 顺序要服务最终方案，从基础约束到关键选择再到执行细节。`,
    `- 不要把同一个问题换句话重复列出。`,
    `- 不要直接替用户拍最终方案，本轮只拆题。`
  ].join("\n");
}

function buildDiscussionItemIntroPrompt(session, agent, item, index, total) {
  return [
    `你是讨论模式的主 agent。请始终用中文回答。`,
    `现在进入第 ${index + 1}/${total} 个事项。你的任务是把这个事项正式抛出来，让下一位思路 agent 能提供多种方案。`,
    discussionNaturalOutputRules(),
    ``,
    `总主题：${session.topic}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    `已敲定事项：`,
    discussionDecisionSummary(session),
    ``,
    `当前事项：${item.title}`,
    `要解决的问题：${item.question}`,
    `判断标准：${item.acceptance}`,
    ``,
    `公开网络检索摘要：`,
    researchForPrompt(session),
    ``,
    `请自然开题：先说明这个事项为什么现在必须定，再把边界和判断标准说清楚，最后顺手把球传给思路位，让他给出几条真正不同的路线。控制在 300-500 中文字。`
  ].join("\n");
}

function buildDiscussionIdeasPrompt(session, agent, item, introMessage, index, total) {
  return [
    `你是讨论模式的第二 agent，负责提供多种思路。请始终用中文回答。`,
    `你不能拍板，也不要只给一个方案；你的价值是把可选路径打开，并让它们足够不同。`,
    discussionNaturalOutputRules(),
    ``,
    `你的身份：${agent.name || agent.id}`,
    `你的固定立场：${agent.stance || agent.role || "负责发散多种方案。"}`,
    `你的风格：${agent.style || "多角度、具体、可比较。"}`,
    ``,
    `总主题：${session.topic}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    `当前事项 ${index + 1}/${total}：${item.title}`,
    `问题：${item.question}`,
    `判断标准：${item.acceptance}`,
    ``,
    `${discussionIntroSourceLabel(introMessage)}：`,
    compactText(introMessage.content, 1800),
    ``,
    `已敲定事项：`,
    discussionDecisionSummary(session),
    ``,
    `公开网络检索摘要：`,
    researchForPrompt(session),
    ``,
    `请自然发散：给出 3 条明显不同的路线，每条都用短段讲清核心做法、适合什么前提、最大风险是什么；最后点出你希望评估位重点比较的差异。可以叫“路线 A/B/C”，但不要写成表格或长清单。控制在 700-1000 中文字。`
  ].join("\n");
}

function buildDiscussionEvaluationPrompt(session, agent, item, introMessage, ideasMessage, index, total) {
  return [
    `你是讨论模式的第三 agent，负责分析各种思路的利弊与主题契合度。请始终用中文回答。`,
    `你不能泛泛总结，必须基于第二 agent 的真实方案逐项评估。`,
    discussionNaturalOutputRules(),
    ``,
    `你的身份：${agent.name || agent.id}`,
    `你的固定立场：${agent.stance || agent.role || "负责利弊、风险、契合度和排序。"}`,
    `你的风格：${agent.style || "直接、可验证、决策导向。"}`,
    ``,
    `总主题：${session.topic}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    `当前事项 ${index + 1}/${total}：${item.title}`,
    `判断标准：${item.acceptance}`,
    ``,
    `${discussionIntroSourceLabel(introMessage)}：`,
    compactText(introMessage.content, 1200),
    ``,
    `思路 agent 的真实方案：`,
    promptFullText(ideasMessage.content, 7000),
    ``,
    `已敲定事项：`,
    discussionDecisionSummary(session),
    ``,
    `请自然评估：不要重写方案全文，直接说哪条路线最贴主题、哪条路线风险最大、哪条可以作为备选或组合。你要明确建议主理人选什么，并说清必须附带的约束。控制在 700-1000 中文字。`
  ].join("\n");
}

function buildDiscussionDecisionPrompt(session, agent, item, introMessage, ideasMessage, evaluationMessage, index, total) {
  return [
    `你是讨论模式的主 agent。请始终用中文回答。`,
    `现在你要基于思路 agent 和评估 agent 的真实回答，对当前事项做判断，选择一个方案或一个组合方案。`,
    discussionNaturalOutputRules(),
    ``,
    `总主题：${session.topic}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    `当前事项 ${index + 1}/${total}：${item.title}`,
    `判断标准：${item.acceptance}`,
    ``,
    `本事项的开题边界：`,
    compactText(introMessage.content, 1000),
    ``,
    `思路 agent 的真实回答：`,
    promptFullText(ideasMessage.content, 7000),
    ``,
    `评估 agent 的真实回答：`,
    promptFullText(evaluationMessage.content, 7000),
    ``,
    `已敲定事项：`,
    discussionDecisionSummary(session),
    ``,
    `请自然拍板：先明确选哪条路线或组合路线，再用简短理由说明为什么。最后留下执行约束，并告诉下一事项要带着什么前提继续；如果已经到最后，就说准备汇总最终方案。控制在 500-800 中文字。`
  ].join("\n");
}

function buildDiscussionHtmlPrompt(session, agent) {
  return [
    `你是讨论模式的主 agent。请始终用中文回答。`,
    `所有事项已经逐项讨论并由你敲定。现在请汇总最终方案，并形成一个可以直接展示的 HTML 文档。`,
    ``,
    `总主题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `最终目标：${session.goal || "形成最终方案。"}`,
    ``,
    `已敲定事项：`,
    discussionDecisionSummary(session, 520),
    ``,
    `输出要求：`,
    `- 先输出 SUMMARY: 后跟 3-5 条中文摘要，每条都要像给人看的结论句，不要写流程痕迹。`,
    `- 再输出 HTML: 后跟完整 HTML 文档，必须包含 <!doctype html>、<html>、<head>、<style>、<body>。`,
    `- HTML 要用于展示最终方案，不是代码说明；视觉上要有标题、核心方案、分事项决策、执行步骤、风险与验收标准，但文案要像产品方案页，不要像会议纪要。`,
    `- 只根据“已敲定事项”提炼，不要回看或复述原始长对话。控制 HTML 正文在 1200-1800 中文字。`,
    `- 使用内联 CSS，不依赖外部资源，不使用脚本。`,
    `- 不要把所有原始讨论全文塞进 HTML；只提炼最终方案。`,
    `【重要】HTML 必须直接内嵌在回复中，不要写到外部文件。不要使用 write_file 或任何文件写入工具。`
  ].join("\n");
}

function defaultGameBriefItems() {
  return [
    {
      title: "MVP范围与产品定位",
      question: "首版到底要做成什么体验：一句话定位、目标平台、单局时长、玩家核心乐趣和明确不做的内容是什么？",
      acceptance: "能形成一条可写进方案文档的游戏定位，并列出首版必须做、明确延后的范围边界。"
    },
    {
      title: "核心玩法循环",
      question: "玩家从开局到通关或失败的完整循环如何组织：选职业、走路线、战斗、拿牌、拿法宝、事件、Boss、结算分别如何衔接？",
      acceptance: "能描述一条完整局内循环，并确认每一步都有可开发的输入、输出和奖励。"
    },
    {
      title: "修仙世界观转译规则",
      question: "如何把境界、宗门、灵根、功法、法宝、丹药、心魔、秘境、天劫转成玩法系统，而不是只停留在设定文案？",
      acceptance: "每个核心修仙概念都能对应至少一个游戏机制或内容类型，同时避开直接复制现有作品表达。"
    },
    {
      title: "原创职业体系框架",
      question: "首发职业数量是多少，如何借鉴职业设计方法而不使用现成职业名，并让每个职业有清晰资源、定位和卡组差异？",
      acceptance: "确定首版职业数量、原创职业命名方向、每个职业的战斗定位和资源机制入口。"
    },
    {
      title: "首发职业细化",
      question: "每个首发职业的资源机制、核心牌组方向、关键词、代表性卡牌类型和成长路径如何定义？",
      acceptance: "每个首发职业都能产出可配置的卡牌设计约束，包括资源、关键词、流派和至少一个核心循环。"
    },
    {
      title: "卡牌系统规则",
      question: "卡牌类型、稀有度、费用、升级、删牌、强化、流派、关键词和卡牌生成规模应如何设定，才能既有构筑深度又适合 AI 批量生产？",
      acceptance: "形成一套可写入数据表的卡牌字段规范，并确定首版卡牌数量和关键词清单。"
    },
    {
      title: "战斗系统骨架",
      question: "回合结构、抽牌弃牌、敌人意图、伤害、防御、状态、资源恢复、胜负条件和 Boss 机制应如何设计？",
      acceptance: "得到一份程序可实现的战斗规则说明，覆盖玩家回合、敌人回合、状态结算和异常边界。"
    },
    {
      title: "Rogue路线与奖励系统",
      question: "地图节点、普通战斗、精英、事件、休整、商店、Boss、奖励池和路线选择压力如何组成首版关卡？",
      acceptance: "确定首版地图层数、节点类型、奖励类型和一次完整流程所需的敌人、事件、Boss 数量。"
    },
    {
      title: "局外成长与平衡边界",
      question: "局外成长可以保留哪些内容，哪些内容会破坏 Rogue 公平性，需要限制或延后？",
      acceptance: "明确首版局外成长清单、禁止项和解锁节奏，保证成长提供变化而不是纯数值碾压。"
    },
    {
      title: "MVP内容规模",
      question: "首版到底需要多少职业、卡牌、敌人、Boss、事件、法宝、丹药和关卡，才能可玩且不失控？",
      acceptance: "产出一张首版内容规模表，区分必须完成、可选增强和后续版本。"
    },
    {
      title: "技术方案与数据结构",
      question: "初版 PC/Web 单机应选择什么框架，引擎、状态管理、存档、卡牌配置、战斗日志和调试工具如何设计？",
      acceptance: "确定可由 AI 高效开发的技术栈，并列出核心数据结构、配置文件格式和本地存档方案。"
    },
    {
      title: "AI开发流程与里程碑",
      question: "如何把策划、程序、数值、文案、测试、README 和 GitHub Issues 拆成 AI 可执行任务，并安排 4 周开发计划？",
      acceptance: "形成阶段交付物、验收标准、风险清单和可直接拆成 GitHub Issues 的任务粒度。"
    }
  ];
}

function normalizeBriefItems(items, limit, fallbackItems = []) {
  const maxItems = Math.max(1, Math.min(Number(limit || 6), 12));
  const source = Array.isArray(items) && items.length ? items : fallbackItems;
  return source
    .map((item, index) => {
      if (typeof item === "string") {
        const title = item.trim();
        return {
          title: title || `事项 ${index + 1}`,
          question: title || `事项 ${index + 1} 需要解决什么？`,
          acceptance: "能够形成一个明确选择，并服务最终方案。"
        };
      }
      const title = String(item?.title || item?.name || item?.topic || `事项 ${index + 1}`).trim();
      return {
        title,
        question: String(item?.question || item?.problem || item?.description || title).trim(),
        acceptance: String(item?.acceptance || item?.criteria || item?.standard || "能够形成一个明确选择，并服务最终方案。").trim()
      };
    })
    .filter((item) => item.title)
    .slice(0, maxItems);
}

function normalizeBriefQuestions(questions, fallbackQuestions = []) {
  const source = Array.isArray(questions) && questions.length ? questions : fallbackQuestions;
  return source
    .map((question, index) => {
      const options = (Array.isArray(question?.options) ? question.options : [])
        .map((option) => ({
          label: String(option?.label || option?.name || option || "").trim(),
          effect: String(option?.effect || option?.value || option?.description || "").trim()
        }))
        .filter((option) => option.label)
        .slice(0, 3);
      return {
        id: String(question?.id || `q${index + 1}`).replace(/[^\w-]/g, "") || `q${index + 1}`,
        question: String(question?.question || question?.title || "").trim(),
        options
      };
    })
    .filter((question) => question.question && question.options.length >= 2)
    .slice(0, 3);
}

function fallbackBriefAssist(body) {
  const rawTopic = String(body.topic || "").trim();
  const rawContext = String(body.context || "").trim();
  const topicLower = `${rawTopic} ${rawContext}`.toLowerCase();
  const isGameBrief = /卡牌|rogue|肉鸽|杀戮之塔|slay the spire|修仙|魔兽|职业|技能|游戏/.test(topicLower);
  const wantsDebate = /是否|应该|要不要|利弊|正反|辩论|debate/.test(topicLower);
  if (isGameBrief) {
    const items = defaultGameBriefItems();
    return {
      mode: "discussion",
      topic: "修仙卡牌 Rogue 游戏 MVP 开发方案",
      context: [
        rawTopic,
        rawContext,
        "方向约束：参考《杀戮之塔》的卡牌 Rogue 闭环，使用修仙背景；借鉴魔兽世界职业和技能设计方法，但必须原创命名、机制和表达；开发过程尽量拆成 AI 可执行任务。"
      ]
        .filter(Boolean)
        .join("\n"),
      goal: "产出一份可以直接进入开发的方案文档：包含玩法定位、系统规则、内容规模、技术结构、数据表字段、AI 开发里程碑和 GitHub Issue 粒度任务。",
      minRounds: 8,
      maxRounds: Math.min(12, Math.max(8, items.length)),
      summary: "这是一个复杂产品方案题，适合先由主理人预拆事项，再让三位 agent 逐项讨论并沉淀 HTML 开发文档。",
      items,
      questions: [
        {
          id: "platform",
          question: "首版更偏向哪种开发路径？",
          options: [
            { label: "Web 单机 MVP", effect: "优先使用 Web/PC 单机技术栈，重视调试效率、数据驱动和快速发布。" },
            { label: "Unity/Godot 客户端", effect: "优先考虑传统游戏引擎，重视后续扩展、美术管线和平台发布。" },
            { label: "先做可玩原型", effect: "先牺牲表现力，把战斗、路线、奖励和存档闭环跑通。" }
          ]
        },
        {
          id: "focus",
          question: "MVP 第一优先级是什么？",
          options: [
            { label: "玩法闭环", effect: "先证明战斗、构筑、路线和奖励选择有趣。" },
            { label: "职业差异", effect: "优先把多个原创职业的资源机制和卡组差异做清楚。" },
            { label: "修仙风味", effect: "优先把境界、天劫、法宝、心魔等概念转成系统体验。" }
          ]
        },
        {
          id: "meta",
          question: "局外成长希望怎么处理？",
          options: [
            { label: "只解锁内容", effect: "局外成长只解锁职业、卡牌、事件和法宝，不给永久数值碾压。" },
            { label: "轻数值成长", effect: "允许少量永久成长，但必须设置上限，避免破坏 Rogue 公平性。" },
            { label: "MVP 暂缓", effect: "首版不做局外成长，只做单局闭环和内容解锁占位。" }
          ]
        }
      ]
    };
  }

  const items = [
    {
      title: "目标与边界",
      question: "这件事真正要解决什么，哪些内容必须做，哪些内容先不做？",
      acceptance: "形成一句清晰目标和一组范围边界。"
    },
    {
      title: "可选路线",
      question: "有哪些明显不同的解决路径，各自适合什么前提？",
      acceptance: "至少得到 3 条可比较路线。"
    },
    {
      title: "风险与取舍",
      question: "每条路线的成本、风险、依赖和不可逆点是什么？",
      acceptance: "能判断哪条路线最贴合当前目标。"
    },
    {
      title: "执行计划",
      question: "选定方向后，如何拆成阶段、任务、验收标准和下一步动作？",
      acceptance: "产出可执行的任务清单和验收口径。"
    }
  ];
  return {
    mode: wantsDebate ? "debate" : "discussion",
    topic: rawTopic,
    context: rawContext || "请先补齐背景、约束、资源和失败线，再进入正式讨论。",
    goal: String(body.goal || "").trim() || "形成可执行方案、关键取舍和下一步动作。",
    minRounds: wantsDebate ? 2 : 4,
    maxRounds: wantsDebate ? 3 : 6,
    summary: wantsDebate ? "这个题目带有明显正反判断，适合先走辩论模式。" : "这个题目更适合方案讨论，先拆事项再逐项拍板。",
    items,
    questions: [
      {
        id: "outcome",
        question: "你最想拿到哪种结果？",
        options: [
          { label: "可执行方案", effect: "输出重点放在阶段计划、任务拆解和验收标准。" },
          { label: "方向判断", effect: "输出重点放在选择哪条路线和为什么。" },
          { label: "风险清单", effect: "输出重点放在反例、失败线和规避动作。" }
        ]
      }
    ]
  };
}

function buildBriefAssistPrompt(body, agent, fallback) {
  return [
    `你是这个多 agent 工具里的主理人，现在要充当启动助手。请始终用中文回答。`,
    `用户会输入一个很粗糙的议题。你的任务不是正式讨论，而是把它整理成可以直接启动辩论或讨论的 brief。`,
    `如果题目是产品、游戏、创业、技术方案、创作规划，优先建议 discussion；如果题目是明确的“是否应该/赞成反对”，才建议 debate。`,
    ``,
    `用户原始议题：${body.topic || "无"}`,
    `已有背景：${body.context || "无"}`,
    `期望结果：${body.goal || "无"}`,
    `当前模式：${body.mode || "discussion"}`,
    ``,
    `请输出且只输出一个 JSON 对象，不要 Markdown，不要解释。字段严格如下：`,
    `{"mode":"discussion","topic":"整理后的短标题","context":"补全后的背景与约束","goal":"最终希望产出的东西","minRounds":4,"maxRounds":8,"summary":"为什么这样拆","items":[{"title":"事项标题","question":"本事项要解决的问题","acceptance":"敲定标准"}],"questions":[{"id":"short_id","question":"需要用户选择的问题","options":[{"label":"选项名","effect":"选择后会影响 brief 的方向"}]}]}`,
    ``,
    `要求：`,
    `- items 是后续讨论事项，不是普通建议。每项都要能被思路位和评估位讨论。`,
    `- questions 只给 1-3 个最关键的选择题，每题 2-3 个选项。`,
    `- 如果是复杂开发方案，items 6-12 个；如果是小问题，items 3-5 个。`,
    `- 不要复制 IP 名称做游戏内容；可以说借鉴设计方法，但要求原创表达。`,
    `- 如果不确定，就保守地沿用这个兜底拆分：${JSON.stringify(fallback.items.slice(0, 6))}`
  ].join("\n");
}

function parseBriefAssistDraft(content, fallback) {
  const raw = String(content || "").trim();
  const candidates = [
    raw.match(/```json\s*([\s\S]*?)```/i)?.[1],
    raw.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const mode = String(parsed.mode || fallback.mode) === "debate" ? "debate" : "discussion";
      const maxRounds = Math.max(1, Math.min(Number(parsed.maxRounds || fallback.maxRounds), 12));
      const minRounds = Math.min(maxRounds, Math.max(1, Math.min(Number(parsed.minRounds || fallback.minRounds), 12)));
      return {
        mode,
        topic: String(parsed.topic || fallback.topic).trim(),
        context: String(parsed.context || fallback.context).trim(),
        goal: String(parsed.goal || fallback.goal).trim(),
        minRounds,
        maxRounds,
        summary: String(parsed.summary || fallback.summary || "").trim(),
        items: normalizeBriefItems(parsed.items, maxRounds, fallback.items),
        questions: normalizeBriefQuestions(parsed.questions, fallback.questions)
      };
    } catch {
      // Keep trying candidates.
    }
  }
  return fallback;
}

async function runBriefAssist(body) {
  const fallback = fallbackBriefAssist(body);
  if (body.useAgent === false) {
    return { draft: fallback, source: "fallback" };
  }
  const config = await readAgentConfig();
  const selected = new Set(Array.isArray(body.agentIds) ? body.agentIds : []);
  const participants = config.agents.filter((agent) => agent.enabled !== false && (agent.kind || "participant") !== "moderator");
  const mainAgent = participants.find((agent) => selected.has(agent.id)) || participants[0];

  if (!mainAgent || (mainAgent.mode || "mock") === "mock") {
    return { draft: fallback, source: "fallback" };
  }

  const prompt = buildBriefAssistPrompt(body, mainAgent, fallback);
  const timeoutMs = Math.min(Number(mainAgent.timeoutMs || 120000), 120000);
  const assistAgent = { ...mainAgent, timeoutMs };
  try {
    let output = "";
    if ((assistAgent.mode || "mock") === "command") {
      const tempSession = {
        id: `brief-${randomUUID()}`,
        topic: String(body.topic || ""),
        context: String(body.context || ""),
        goal: String(body.goal || ""),
        currentChild: null,
        stopRequested: false,
        deleted: false
      };
      const tempMessage = { id: randomUUID(), content: "" };
      output = await executeCommandAgent(assistAgent, prompt, tempSession, tempMessage, {
        prompt,
        topic: tempSession.topic,
        context: tempSession.context,
        goal: tempSession.goal,
        round: 0,
        maxRounds: fallback.maxRounds,
        agentId: assistAgent.id,
        agentName: assistAgent.name || assistAgent.id
      });
    } else if (assistAgent.mode === "openai-compatible" || assistAgent.mode === "local-model") {
      output = await executeOpenAICompatibleAgent(assistAgent, prompt);
    } else {
      return { draft: fallback, source: "fallback" };
    }
    return { draft: parseBriefAssistDraft(output, fallback), source: "agent" };
  } catch (error) {
    return {
      draft: fallback,
      source: "fallback",
      warning: `主理人启动助手未完成，已使用本地兜底拆分：${error.message || String(error)}`
    };
  }
}

function buildAgentPrompt(session, agent, round) {
  const other = latestOtherMessage(session, agent.id);
  const own = latestOwnMessage(session, agent.id);
  const agentStance = agent.stance || agent.role || "从你的专业角度参与讨论，并主动推进主题。";
  return [
    `你正在参与一个真实的多 agent 讨论会。请始终用中文回答。`,
    `重要：你必须基于其他 agent 的真实原文继续推进，不允许重新开题、不允许泛泛复述、不允许输出模板废话。`,
    `你可以先在内部仔细思考，但不要输出内心推理过程；最终只输出高密度、可检查的发言。`,
    ``,
    `你的身份：${agent.name || agent.id}`,
    `你的固定立场：${agentStance}`,
    `你的风格：${agent.style || "清晰、具体、可执行。"}`,
    `你的讨论任务：${agent.mission || "回应上一位发言者，暴露分歧，提出推进主题的下一步。"}`,
    ``,
    `主题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `期望结果：${session.goal || "形成可执行结论、关键分歧和下一步建议。"}`,
    `当前回合：${round}/${session.maxRounds}`,
    ``,
    `公开网络检索摘要（只能作为线索，不要编造不存在的信息；如主题不需要外部信息，请说明其边界）：`,
    researchForPrompt(session),
    ``,
    `上一位其他 agent 的真实回答：`,
    other ? `【${other.agentName}｜第 ${other.round} 回合】\n${compactText(other.content, 1600)}` : "（暂无，你是第一个发言者。）",
    ``,
    `你自己上一轮的真实回答：`,
    own ? `【${own.agentName}｜第 ${own.round} 回合】\n${compactText(own.content, 1200)}` : "（暂无，这是你第一次发言。）",
    ``,
    `本回合你之前已经发生的真实发言：`,
    roundSoFarForPrompt(session, round),
    ``,
    `完整近程讨论记录：`,
    transcriptForPrompt(session),
    ``,
    `发言前你必须在内部完成这些检查：`,
    `- 主题到底要求解决什么问题？`,
    `- 上一位 agent 具体说了什么？哪些点有价值，哪些点有漏洞？`,
    `- 你自己上一轮说过什么？本轮需要修正、坚持或推进什么？`,
    `- 你的固定立场如何与当前证据、全网线索和讨论目标结合？`,
    `- 你的回答如何帮助讨论向结果靠近？`,
    ``,
    `请按以下结构输出，保持简洁但具体：`,
    `1. 主题推进判断：一句话说当前讨论最该解决的点。`,
    `2. 回应上一位：点名上一位 agent 的一个具体观点，并同意/反驳/修正。`,
    `3. 我的立场：从你的固定立场给出判断，不要中立漂移。`,
    `4. 网络线索：说明你使用了哪些检索线索，或为什么本轮不依赖外部信息。`,
    `5. 新增推进：给出本轮新增的决策、反例、实验、标准或行动。`,
    `6. 交给下一位：提出下一位 agent 必须处理的一个问题。`,
    `7. 收敛状态：写“终局判断：CONTINUE”或“终局判断：FINAL”，并给一句理由。`,
    ``,
    `硬性要求：必须服务主题；必须引用真实上一位回答中的具体内容；不能虚构其他 agent 没说过的话；不能用“作为AI模型”等空话。`
  ].join("\n");
}

function buildModeratorPrompt(session, round) {
  return [
    `你是一个多 agent 辩论主持人。请始终用中文回答。`,
    `你要判断讨论是否已经足够收敛。`,
    ``,
    `主题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `期望结果：${session.goal || "形成可执行结论、关键分歧和下一步建议。"}`,
    `当前回合：${round}/${session.maxRounds}`,
    `最少回合：${session.minRounds}`,
    ``,
    `讨论记录：`,
    transcriptForPrompt(session),
    ``,
    `请只输出一个 JSON 对象，不要包裹代码块：`,
    `{"status":"continue 或 final","summary":"如果 final，写最终结论；如果 continue，写下一轮需要解决的问题"}`,
    ``,
    `当核心判断、执行路径和主要风险已经明确时，status 设为 final。`
  ].join("\n");
}

function debateNaturalOutputRules() {
  return [
    `输出风格要求：`,
    `- 你必须先在内部按讨论会/辩论赛流程认真思考：主题是什么、对方说了什么、自己立场是什么、全网线索能支持什么、怎样服务最终判断。`,
    `- 但最终输出不要像表格或任务清单，不要机械使用“1、2、3”模板。`,
    `- 像真实辩手/主持人在现场发言：自然、有立场、有情绪张力，但仍然具体、克制、可检查。`,
    `- 可以分成少量短段落；除非必须，不要使用 Markdown 表格、长编号列表或固定栏目。`,
    `- 控制篇幅：立论与反驳尽量 500-800 中文字，阶段裁决 800 字内，最终裁决 1200 字内；先给判断，不铺陈背景。`,
    `- 不要输出内心推理过程，不要说“作为 AI”。`
  ].join("\n");
}

function buildDebatePlanPrompt(session, agent) {
  return [
    `你是辩论模式的主 agent，职责类似主席、赛制设计者和最终裁判。请始终用中文回答。`,
    `你现在不要替双方辩护，而是把用户议题拆成若干个适合辩论的辩点，并为每个辩点设定正方立场和反方立场。`,
    ``,
    `你的身份：${displayAgentName(agent)}`,
    `你的固定职责：拆题、设定正反方、控制辩论边界、最后裁决。`,
    ``,
    `总议题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `期望结果：${session.goal || "形成可执行结论、关键分歧和下一步建议。"}`,
    `辩点数量要求：至少 ${session.minRounds} 个，最多 ${session.maxRounds} 个。`,
    ``,
    `公开网络检索摘要（只作为线索，不要编造不存在的信息）：`,
    researchForPrompt(session),
    ``,
    `请先用自然语言简短说明你如何拆题，然后必须输出一个可解析 JSON 代码块，格式严格如下：`,
    "```json",
    `{"items":[{"title":"辩点标题","question":"本辩点真正要争的问题","affirmative":"正方必须捍卫的立场","negative":"反方必须捍卫的立场","criteria":"主 agent 最后裁决时看的标准"}]}`,
    "```",
    ``,
    `拆题要求：`,
    `- 每个辩点都必须有真实冲突，不能只是换句话重复。`,
    `- 正方和反方都要有可辩护空间，不要把一方设成稻草人。`,
    `- 辩点顺序要从定义/目标到路径/风险再到落地取舍。`,
    `- 本轮只拆题和设定立场，不要提前宣布最终答案。`
  ].join("\n");
}

function buildDebateMotionIntroPrompt(session, agent, item, index, total) {
  return [
    `你是辩论模式的主 agent。现在进入第 ${index + 1}/${total} 个辩点，请像辩论赛主席一样开题。`,
    debateNaturalOutputRules(),
    ``,
    `总议题：${session.topic}`,
    `辩点：${item.title}`,
    `要争的问题：${item.question}`,
    `正方立场：${item.affirmative}`,
    `反方立场：${item.negative}`,
    `裁决标准：${item.criteria}`,
    ``,
    `此前辩点裁决：`,
    debateOutcomeSummary(session),
    ``,
    `公开网络检索摘要：`,
    researchForPrompt(session),
    ``,
    `请自然地讲清楚这个辩点为什么关键、正反双方各自必须守住什么边界、下一位正方辩手应该优先证明什么。`
  ].join("\n");
}

function buildDebateConstructivePrompt(session, agent, item, introMessage, side, index, total, priorMessage = null) {
  const sideName = side === "affirmative" ? "正方" : "反方";
  const stance = side === "affirmative" ? item.affirmative : item.negative;
  const opponent = side === "affirmative" ? item.negative : item.affirmative;
  const priorSideName = side === "affirmative" ? "反方" : "正方";
  return [
    `你是正式辩论模式里的${sideName}辩手。请始终用中文回答。`,
    `你的任务不是中立分析，而是为自己的立场做最强辩护，同时预判对方最可能攻击的地方。`,
    debateNaturalOutputRules(),
    ``,
    `你的身份：${displayAgentName(agent)}`,
    `你的风格：${agent.style || "有立场、具体、推进主题。"}`,
    ``,
    `总议题：${session.topic}`,
    `当前辩点 ${index + 1}/${total}：${item.title}`,
    `本方立场：${stance}`,
    `对方立场：${opponent}`,
    `裁决标准：${item.criteria}`,
    ``,
    `主 agent 刚刚开题的真实内容：`,
    promptFullText(introMessage.content, 5000),
    ``,
    priorMessage
      ? [
          `${priorSideName}刚才的真实发言：`,
          promptFullText(priorMessage.content, 3500),
          ``
        ].join("\n")
      : "",
    `公开网络检索摘要：`,
    researchForPrompt(session),
    ``,
    `请像一辩立论一样发言：先亮明本方判断，再给出两到三个最有力理由，主动承认一个薄弱处并把它化解；如果前面已有对手发言，必须点名回应其中一个关键判断。控制在 500-800 中文字，输出要自然、有现场感，不要写成表格。`
  ].join("\n");
}

function buildDebateRebuttalPrompt(session, agent, item, introMessage, ownMessage, opponentMessage, side, index, total) {
  const sideName = side === "affirmative" ? "正方" : "反方";
  const stance = side === "affirmative" ? item.affirmative : item.negative;
  return [
    `你是正式辩论模式里的${sideName}辩手，现在进入攻辩/反驳环节。请始终用中文回答。`,
    `你必须基于对方真实发言反击，不能重新开题，不能无视对方最强观点。`,
    debateNaturalOutputRules(),
    ``,
    `总议题：${session.topic}`,
    `当前辩点 ${index + 1}/${total}：${item.title}`,
    `本方立场：${stance}`,
    `裁决标准：${item.criteria}`,
    ``,
    `主 agent 开题：`,
    compactText(introMessage.content, 1400),
    ``,
    `你方刚才的真实立论：`,
    promptFullText(ownMessage.content, 4500),
    ``,
    `对方刚才的真实立论：`,
    promptFullText(opponentMessage.content, 5000),
    ``,
    `请自然地回应：抓住对方一个核心漏洞，保护本方最重要的论证，再把裁决标准往本方方向拉。控制在 500-800 中文字，不要套模板，不要长篇罗列。`
  ].join("\n");
}

function buildDebateJudgePrompt(session, agent, item, introMessage, affirmativeMessage, negativeMessage, affirmativeRebuttal, negativeRebuttal, index, total) {
  return [
    `你是辩论模式的主 agent，现在要对第 ${index + 1}/${total} 个辩点做阶段裁决。请始终用中文回答。`,
    `你不是简单总结员，要判断哪一方更好地服务总议题，并说明这个裁决如何推进后续辩点。`,
    debateNaturalOutputRules(),
    ``,
    `总议题：${session.topic}`,
    `当前辩点：${item.title}`,
    `裁决标准：${item.criteria}`,
    ``,
    `你的开题：`,
    compactText(introMessage.content, 1200),
    ``,
    `正方立论：`,
    promptFullText(affirmativeMessage.content, 4000),
    ``,
    `反方立论：`,
    promptFullText(negativeMessage.content, 4000),
    ``,
    `正方反驳：`,
    promptFullText(affirmativeRebuttal.content, 3500),
    ``,
    `反方反驳：`,
    promptFullText(negativeRebuttal.content, 3500),
    ``,
    `请用自然语言给出裁决：哪一方在本辩点略占上风、为什么、另一方留下了什么必须处理的问题、下一个辩点应该带着什么前提继续。控制在 800 中文字内，不要输出 JSON，不要表格。`
  ].join("\n");
}

function buildDebateFinalPrompt(session, agent) {
  return [
    `你是辩论模式的主 agent。所有辩点已经完成，现在请给出最终裁决。请始终用中文回答。`,
    `你要综合正反双方真实发言，而不是机械折中。`,
    debateNaturalOutputRules(),
    ``,
    `总议题：${session.topic}`,
    `补充背景：${session.context || "无"}`,
    `期望结果：${session.goal || "形成可执行结论、关键分歧和下一步建议。"}`,
    ``,
    `各辩点阶段裁决：`,
    debateOutcomeSummary(session),
    ``,
    `近程完整辩论记录：`,
    transcriptForPrompt(session),
    ``,
    `请像赛后主席总结一样输出最终判断：先把争论真正的核心说透，再说明正反双方各自赢在哪里、输在哪里，最后落到一个可执行结论或下一步行动。控制在 1000-1200 中文字，输出要有温度、有判断，不要写成报告模板。`
  ].join("\n");
}

function mockAgentText(agent, session, round) {
  const topic = session.topic.trim();
  const contextLine = session.context.trim() ? `我会把补充背景里的限制纳入判断：${session.context.trim()}` : "目前没有额外背景，我会先按通用约束处理。";
  const finalLine = round >= Math.min(session.maxRounds, Math.max(session.minRounds, 2)) ? "终局判断：FINAL" : "终局判断：CONTINUE";

  if (agent.id.includes("critic")) {
    return [
      `### ${agent.name} / 第 ${round} 回合`,
      ``,
      `立场：这个议题“${topic}”可以讨论，但现在最容易出错的是把愿望当成结论。${contextLine}`,
      ``,
      `关键反驳：`,
      `- 先验证最关键假设，而不是扩大讨论范围。`,
      `- 如果需要落地，必须定义失败线：什么信号出现时暂停、换路或缩小目标。`,
      `- 任何“大家都同意”的点都要转成可观察的验收标准。`,
      ``,
      `推进建议：让下一轮只处理两个问题：最大风险是什么，以及最低成本的验证动作是什么。`,
      ``,
      finalLine
    ].join("\n");
  }

  if (agent.id.includes("synth")) {
    return [
      `### ${agent.name} / 第 ${round} 回合`,
      ``,
      `立场：我倾向于把“${topic}”拆成判断、实验、决策三层，而不是直接争输赢。`,
      ``,
      `归纳：`,
      `- 共识雏形：先做小闭环，再决定是否扩大投入。`,
      `- 主要分歧：目标优先级与风险承受度还需要更明确。`,
      `- 可执行动作：定义一个 24-72 小时内能完成的试验，并记录证据。`,
      ``,
      `下一步：如果下一轮仍没有新的反例，就可以输出结论、风险清单和执行方案。`,
      ``,
      finalLine
    ].join("\n");
  }

  return [
    `### ${agent.name} / 第 ${round} 回合`,
    ``,
    `立场：我认为“${topic}”应该先用最小可行路径推进，而不是等待完全确定。${contextLine}`,
    ``,
    `关键论证：`,
    `- 先明确结果形态：最后要的是判断、方案、清单，还是可执行任务。`,
    `- 让每个 agent 只守一个视角，可以减少互相重复。`,
    `- 每轮结束由主持人判断是否已经达到“足够好”的结论。`,
    ``,
    `执行建议：先跑 2 轮，第二轮要求所有 agent 回应上一轮最强反对意见，再生成最终版。`,
    ``,
    finalLine
  ].join("\n");
}

function mockModeratorText(session, round) {
  const ready = round >= Math.min(session.maxRounds, Math.max(session.minRounds, 2));
  if (!ready) {
    return JSON.stringify({
      status: "continue",
      summary: "第一轮已经形成初步分工，但还缺少对最强反对意见的回应。下一轮应压缩分歧并给出验收标准。"
    });
  }
  return JSON.stringify({
    status: "final",
    summary: synthesizeResult(session)
  });
}

async function streamMockText(text, onChunk, session) {
  const chunks = text.match(/[\s\S]{1,72}/g) || [];
  for (const chunk of chunks) {
    if (session.stopRequested) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 18));
    onChunk(chunk);
  }
}

async function executeCommandAgent(agent, prompt, session, message, vars) {
  if (!agent.command) {
    throw new Error(`Agent ${agent.name || agent.id} is missing command`);
  }
  const outputFile = agent.outputFile ? join(tmpdir(), `agent-meeting-${session.id}-${message.id}.txt`) : "";
  const commandVars = { ...vars, outputFile };
  const args = Array.isArray(agent.args) ? agent.args.map((arg) => renderTemplate(arg, commandVars)) : [];
  const timeoutMs = Number(agent.timeoutMs || 120000);
  const cwd = agent.cwd ? resolve(rootDir, renderTemplate(agent.cwd, commandVars)) : rootDir;
  const env = { ...process.env, ...(agent.env || {}) };
  const stdoutMode = agent.stdoutMode || "stream";

  return await new Promise((resolveCommand, rejectCommand) => {
    let settled = false;
    let output = "";
    let stderr = "";
    const child = spawn(agent.command, args, {
      cwd,
      env,
      shell: Boolean(agent.shell),
      stdio: ["pipe", "pipe", "pipe"]
    });
    session.currentChild = child;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      session.currentChild = null;
      rejectCommand(new Error(`Agent timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      output += text;
      if (stdoutMode !== "ignore") {
        message.content += text;
        emit(session, "message-delta", { id: message.id, chunk: text });
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      session.currentChild = null;
      rejectCommand(error);
    });

    child.on("close", async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      session.currentChild = null;
      if (session.stopRequested) {
        resolveCommand(output || `已停止。${signal ? `signal=${signal}` : ""}`);
        return;
      }
      let fileOutput = "";
      if (outputFile) {
        try {
          fileOutput = (await readFile(outputFile, "utf8")).trim();
        } catch {
          fileOutput = "";
        }
        await unlink(outputFile).catch(() => {});
      }
      const finalOutput = fileOutput || (stdoutMode === "ignore" ? "" : output.trim()) || stderr.trim();
      if (code) {
        rejectCommand(new Error(finalOutput.trim() || `Agent exited with code ${code}`));
        return;
      }
      resolveCommand(finalOutput || "（agent 没有输出内容）");
    });

    const stdinTemplate = typeof agent.stdin === "string" && agent.stdin.length ? agent.stdin : "";
    if (stdinTemplate) {
      child.stdin.end(renderTemplate(stdinTemplate, commandVars));
    } else {
      child.stdin.end();
    }
  });
}

function chatCompletionsUrl(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) throw new Error("OpenAI-compatible agent is missing baseUrl");
  if (cleaned.endsWith("/chat/completions")) return cleaned;
  return `${cleaned}/chat/completions`;
}

async function executeOpenAICompatibleAgent(agent, prompt) {
  if (!agent.model) {
    throw new Error(`Agent ${agent.name || agent.id} is missing model`);
  }

  const timeoutMs = Number(agent.timeoutMs || 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = agent.apiKeyEnv ? process.env[agent.apiKeyEnv] : "";
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(chatCompletionsUrl(agent.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: agent.model,
        messages: [
          {
            role: "system",
            content: "你是 Agent Meeting Studio 中的一个本地 agent。请严格按用户提示工作，用中文输出，不要透露系统实现。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: typeof agent.temperature === "number" ? agent.temperature : 0.4,
        max_tokens: Number(agent.maxTokens || 4096),
        stream: false
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `OpenAI-compatible endpoint returned HTTP ${response.status}`);
    }

    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      return text.trim();
    }

    const content = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.message?.content || "";
    return String(content || "").trim() || "（本地模型没有输出内容）";
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`OpenAI-compatible agent timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runAgentTurn(session, agent, round, kind = "agent", promptOverride = "", messageOverrides = {}) {
  const message = {
    id: randomUUID(),
    type: messageOverrides.type || kind,
    round,
    agentId: agent.id,
    agentName: messageOverrides.agentName || displayAgentName(agent),
    agentTitle: messageOverrides.agentTitle ?? agent.title ?? "",
    agentColor: messageOverrides.agentColor || agent.color || "#4f46e5",
    content: "",
    status: "streaming",
    createdAt: new Date().toISOString(),
    completedAt: null,
    error: "",
    errorCode: "",
    errorTitle: "",
    errorHint: ""
  };
  addMessage(session, message);
  await persistSession(session);

  const prompt = promptOverride || (kind === "moderator" ? buildModeratorPrompt(session, round) : buildAgentPrompt(session, agent, round));
  const vars = {
    prompt,
    topic: session.topic,
    context: session.context,
    goal: session.goal,
    round,
    maxRounds: session.maxRounds,
    agentId: agent.id,
    agentName: agent.name || agent.id
  };

  try {
    if ((agent.mode || "mock") === "command") {
      const output = await executeCommandAgent(agent, prompt, session, message, vars);
      if (!message.content.trim()) message.content = output;
    } else if (agent.mode === "openai-compatible" || agent.mode === "local-model") {
      const output = await executeOpenAICompatibleAgent(agent, prompt);
      message.content = output;
    } else {
      const text = kind === "moderator" ? mockModeratorText(session, round) : mockAgentText(agent, session, round);
      await streamMockText(
        text,
        (chunk) => {
          message.content += chunk;
          emit(session, "message-delta", { id: message.id, chunk });
        },
        session
      );
    }

    const finalStatus = session.stopRequested ? "stopped" : "complete";
    await updateMessage(
      session,
      message,
      {
        content: message.content.trim(),
        status: finalStatus,
        completedAt: new Date().toISOString()
      },
      "message-complete"
    );
    return message;
  } catch (error) {
    const formatted = formatAgentError(error, agent);
    await updateMessage(
      session,
      message,
      {
        content: message.content.trim() || formatted.content,
        status: "error",
        completedAt: new Date().toISOString(),
        error: formatted.raw,
        errorCode: formatted.code,
        errorTitle: formatted.title,
        errorHint: formatted.hint
      },
      "message-complete"
    );
    return message;
  }
}

function parseModeratorVerdict(content, session, round) {
  const raw = content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const status = String(parsed.status || "").toLowerCase().includes("final") ? "final" : "continue";
      return {
        status,
        summary: String(parsed.summary || "").trim()
      };
    } catch {
      // Fall through to text heuristics.
    }
  }

  const lower = raw.toLowerCase();
  const looksFinal = lower.includes("final") || raw.includes("最终") || raw.includes("结论") || raw.includes("收敛");
  const forcedFinal = round >= session.maxRounds;
  return {
    status: looksFinal || forcedFinal ? "final" : "continue",
    summary: raw || (forcedFinal ? synthesizeResult(session) : "继续下一轮。")
  };
}

function synthesizeResult(session) {
  const lastAgentMessage = [...session.messages]
    .reverse()
    .find((message) => message.type === "agent" && message.status === "complete" && message.content.trim());
  if (lastAgentMessage) {
    return lastAgentMessage.content.trim();
  }

  const agentMessages = session.messages
    .filter((message) => message.type === "agent" && message.status === "complete")
    .slice(-Math.max(session.agents.length, 1));
  const namedPoints = agentMessages
    .map((message) => {
      const firstUsefulLine =
        message.content
          .split("\n")
          .map((line) => line.replace(/^[-#*\s]+/, "").trim())
          .find((line) => {
            if (!line) return false;
            if (line.startsWith("终局判断")) return false;
            if (line.includes(`/ 第 ${message.round} 回合`)) return false;
            if (/^第\s*\d+\s*回合/.test(line)) return false;
            return true;
          }) || "保留该视角的判断。";
      return `- ${message.agentName}：${firstUsefulLine}`;
    })
    .join("\n");

  return [
    `## 最终结果`,
    ``,
    `**议题**：${session.topic}`,
    ``,
    `**真实发言摘录**：`,
    namedPoints || `- 各 agent 尚未形成足够输出，但可以先补充背景后续跑一轮。`,
    ``,
    `**说明**：没有可用的最终 agent 发言，以上只来自已有真实发言摘录。`
  ].join("\n");
}

function lastRoundWantsFinal(session, round) {
  const last = [...session.messages]
    .reverse()
    .find((message) => message.type === "agent" && message.round === round && message.status === "complete" && message.content.trim());
  if (!last) return false;
  const text = last.content.toLowerCase();
  return text.includes("终局判断：final") || text.includes("终局判断: final") || text.includes("收敛状态：final");
}

function appendResultMessage(session, result, round) {
  const resultMessage = {
    id: randomUUID(),
    type: "result",
    round,
    agentId: "result",
    agentName: "最终结果",
    agentTitle: "",
    agentColor: "#101828",
    content: result,
    status: "complete",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: "",
    errorCode: "",
    errorTitle: "",
    errorHint: ""
  };
  session.messages.push(resultMessage);
  emit(session, "message-start", publicMessage(resultMessage));
  emit(session, "message-complete", publicMessage(resultMessage));
}

function debateOutcomeSummary(session) {
  const outcomes = Array.isArray(session.debateOutcomes) ? session.debateOutcomes : [];
  if (!outcomes.length) return "（暂无阶段裁决。）";
  return outcomes
    .map((outcome, index) => {
      return `${index + 1}. ${outcome.title}\n${compactText(outcome.judgment, 900)}`;
    })
    .join("\n\n");
}

function parseDebateItems(content, limit, session) {
  const maxItems = Math.max(1, Number(limit || 1));
  const raw = String(content || "").trim();
  const jsonCandidates = [
    raw.match(/```json\s*([\s\S]*?)```/i)?.[1],
    raw.match(/\{[\s\S]*"items"[\s\S]*\}/)?.[0],
    raw.match(/\[[\s\S]*\]/)?.[0]
  ].filter(Boolean);

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.motions) ? parsed.motions : [];
      const items = list
        .map((item, index) => {
          if (typeof item === "string") {
            const title = item.trim();
            return {
              title,
              question: title,
              affirmative: `正方认为：${title} 应该成立，且更能服务总议题。`,
              negative: `反方认为：${title} 不应直接成立，或其风险与代价被低估。`,
              criteria: "谁更能解释现实约束、风险和可执行路径。"
            };
          }
          const title = String(item.title || item.name || item.topic || `辩点 ${index + 1}`).trim();
          const question = String(item.question || item.problem || item.description || title).trim();
          return {
            title,
            question,
            affirmative: String(item.affirmative || item.pro || item.positive || item.for || `正方支持：${question}`).trim(),
            negative: String(item.negative || item.con || item.opposition || item.against || `反方反对或限制：${question}`).trim(),
            criteria: String(item.criteria || item.standard || item.acceptance || "谁更能服务总议题并给出可执行判断。").trim()
          };
        })
        .filter((item) => item.title && item.question)
        .slice(0, maxItems);
      if (items.length) return items;
    } catch {
      // Try the next parsing strategy.
    }
  }

  const lineItems = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、)]|辩点\s*\d+[:：]?)\s*/, "").trim())
    .filter((line) => line.length > 4 && !line.includes("```") && !line.startsWith("{") && !line.startsWith("}"))
    .slice(0, maxItems)
    .map((line, index) => ({
      title: line.slice(0, 64) || `辩点 ${index + 1}`,
      question: line,
      affirmative: `正方认为这个判断应当成立，并且能推动目标实现。`,
      negative: `反方认为这个判断过早、过强或风险被低估，必须收窄或反对。`,
      criteria: session.goal || "谁更能形成可执行结论。"
    }));

  if (lineItems.length) return lineItems;

  return [
    {
      title: session.topic,
      question: session.context || session.topic,
      affirmative: "正方认为该议题中的主张应当成立，并应进入执行路径。",
      negative: "反方认为该主张风险、成本或前提不足，不能直接成立。",
      criteria: session.goal || "形成最终判断。"
    }
  ];
}

function parseDiscussionItems(content, limit, session) {
  const maxItems = Math.max(1, Number(limit || 1));
  const raw = String(content || "").trim();
  const jsonCandidates = [
    raw.match(/```json\s*([\s\S]*?)```/i)?.[1],
    raw.match(/\{[\s\S]*"items"[\s\S]*\}/)?.[0],
    raw.match(/\[[\s\S]*\]/)?.[0]
  ].filter(Boolean);

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.tasks) ? parsed.tasks : [];
      const items = list
        .map((item, index) => {
          if (typeof item === "string") {
            return {
              title: item.trim(),
              question: item.trim(),
              acceptance: "能够形成一个明确选择，并服务最终方案。"
            };
          }
          const title = String(item.title || item.name || item.topic || `事项 ${index + 1}`).trim();
          return {
            title,
            question: String(item.question || item.problem || item.description || title).trim(),
            acceptance: String(item.acceptance || item.criteria || item.standard || "能够形成一个明确选择，并服务最终方案。").trim()
          };
        })
        .filter((item) => item.title)
        .slice(0, maxItems);
      if (items.length) return items;
    } catch {
      // Try the next parsing strategy.
    }
  }

  const lineItems = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、)]|事项\s*\d+[:：]?)\s*/, "").trim())
    .filter((line) => line.length > 4 && !line.includes("```") && !line.startsWith("{") && !line.startsWith("}"))
    .slice(0, maxItems)
    .map((line, index) => ({
      title: line.slice(0, 64),
      question: line,
      acceptance: "能够形成一个明确选择，并服务最终方案。"
    }));

  if (lineItems.length) return lineItems;

  return [
    {
      title: session.topic,
      question: session.context || session.topic,
      acceptance: session.goal || "形成最终方案。"
    }
  ];
}

function normalizeSeededDiscussionPlan(items, limit) {
  return normalizeBriefItems(items, limit, []);
}

function createSystemMessage({ round = 0, agentName = "系统记录", agentTitle = "", content = "" }) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    type: "system",
    round,
    agentId: "system",
    agentName,
    agentTitle,
    agentColor: "#64748b",
    content,
    status: "complete",
    createdAt: now,
    completedAt: now,
    error: "",
    errorCode: "",
    errorTitle: "",
    errorHint: ""
  };
}

function extractHtmlDocument(content, session) {
  const raw = String(content || "").trim();
  const fenced = raw.match(/```html\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;

  const htmlStart = raw.search(/<!doctype html>|<html[\s>]/i);
  if (htmlStart >= 0) {
    const extracted = raw.slice(htmlStart).trim();
    // 兜底：如果提取的 HTML 不足 800 字符且包含 .html 文件路径，尝试读文件
    if (extracted.length < 800) {
      const fileMatch = extracted.match(/([\w./-]+\.html)/i);
      if (fileMatch) {
        try {
          const filePath = fileMatch[1];
          if (existsSync(filePath)) {
            return readFileSync(filePath, "utf8").trim();
          }
        } catch {
          // 读文件失败，继续用提取结果
        }
      }
    }
    return extracted;
  }

  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${session.topic.replace(/</g, "").replace(/>/g, "")} - 最终方案</title>`,
    "<style>",
    "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#f6f8fb;color:#172331;line-height:1.7}",
    "main{max-width:920px;margin:0 auto;padding:40px 22px}",
    "article{background:white;border:1px solid #dde5ee;border-radius:12px;padding:28px;box-shadow:0 18px 45px rgba(31,44,58,.08)}",
    "h1{font-size:28px;line-height:1.25;margin:0 0 18px}pre{white-space:pre-wrap;font:inherit}",
    "</style>",
    "</head>",
    "<body><main><article>",
    `<h1>${session.topic.replace(/</g, "").replace(/>/g, "")}</h1>`,
    `<pre>${escaped}</pre>`,
    "</article></main></body></html>"
  ].join("");
}

function extractDiscussionSummary(content, session) {
  const raw = String(content || "").trim();
  const summaryMatch = raw.match(/SUMMARY[:：]\s*([\s\S]*?)(?:HTML[:：]|```html|<!doctype html>|<html[\s>]|$)/i);
  const summary = summaryMatch?.[1]?.trim();
  if (summary) return summary;

  const decisions = Array.isArray(session.discussionDecisions) ? session.discussionDecisions : [];
  if (decisions.length) {
    return [
      `## 讨论模式最终方案`,
      ``,
      `议题：${session.topic}`,
      ``,
      `### 已敲定事项`,
      ...decisions.map((decision, index) => `${index + 1}. ${decision.title}：${compactText(decision.decision, 280)}`),
      ``,
      `HTML 文档已生成，可在右侧结果区预览或打开。`
    ].join("\n");
  }

  return `HTML 文档已生成，可在右侧结果区预览或打开。\n\n${compactText(raw, 1000)}`;
}

function stripMarkdownText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "- ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactPlainText(value, max = 320) {
  return compactText(stripMarkdownText(value).replace(/\s+/g, " "), max);
}

function extractDecisionPart(decisionText, label, max = 420) {
  const raw = String(decisionText || "");
  const labels = ["主 agent 判断", "选择方案", "取舍理由", "落地约束", "下一事项"];
  const start = raw.search(new RegExp(`(?:^|\\n)\\s*\\d+[.、]\\s*(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:：]?`, "i"));
  if (start < 0) return "";
  const afterStart = raw.slice(start).replace(new RegExp(`^\\s*\\d+[.、]\\s*(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:：]?`, "i"), "");
  const nextMarkers = labels.filter((item) => item !== label).join("|");
  const next = afterStart.search(new RegExp(`\\n\\s*\\d+[.、]\\s*(?:\\*\\*)?(?:${nextMarkers})(?:\\*\\*)?\\s*[:：]?`, "i"));
  return compactPlainText(next >= 0 ? afterStart.slice(0, next) : afterStart, max);
}

function decisionDigest(decision, index) {
  const judgment = extractDecisionPart(decision.decision, "主 agent 判断", 300);
  const choice = extractDecisionPart(decision.decision, "选择方案", 520);
  const constraints = extractDecisionPart(decision.decision, "落地约束", 520);
  return {
    number: index + 1,
    title: decision.title || `事项 ${index + 1}`,
    question: decision.question || "",
    judgment: judgment || compactPlainText(decision.decision, 300),
    choice: choice || compactPlainText(decision.decision, 520),
    constraints
  };
}

function firstDecisionByTitle(decisions, pattern) {
  return decisions.find((decision) => pattern.test(decision.title || ""));
}

function extractLabeledBlock(value, label, nextLabels = [], max = 220) {
  const raw = stripMarkdownText(value);
  const start = raw.search(new RegExp(`${label}\\s*[:：]`, "i"));
  if (start < 0) return "";
  const after = raw.slice(start).replace(new RegExp(`^[\\s\\S]*?${label}\\s*[:：]`, "i"), "");
  const next = nextLabels.length ? after.search(new RegExp(`\\n\\s*(?:${nextLabels.join("|")})\\s*[:：]`, "i")) : -1;
  return compactPlainText(next >= 0 ? after.slice(0, next) : after, max);
}

function extractPhaseCards(decisionText) {
  const clean = stripMarkdownText(decisionText);
  const cards = [];
  const regex = /Phase\s*(\d+)[：:]\s*([^\n]+)([\s\S]*?)(?=\n\s*Phase\s*\d+[：:]|$)/gi;
  let match;
  while ((match = regex.exec(clean)) && cards.length < 4) {
    const body = match[3] || "";
    cards.push({
      phase: `Phase ${match[1]}`,
      title: match[2].trim(),
      changes: extractLabeledBlock(body, "具体改动", ["验收标准", "主要风险"], 260) || compactPlainText(body, 260),
      acceptance: extractLabeledBlock(body, "验收标准", ["主要风险"], 220),
      risk: extractLabeledBlock(body, "主要风险", [], 180)
    });
  }
  return cards;
}

function fallbackDocumentTitle(session) {
  const topic = String(session.topic || "").trim();
  if (/Agent Meeting Studio|GitHub|README|agent/i.test(topic)) return "Agent Meeting Studio GitHub Launch Plan";
  if (topic.length > 72) return "讨论模式最终方案";
  return topic || "讨论模式最终方案";
}

function fallbackPriorities(session, digests) {
  const decisions = Array.isArray(session.discussionDecisions) ? session.discussionDecisions : [];
  if (/Agent Meeting Studio|GitHub|README|agent/i.test(session.topic || "") || decisions.some((decision) => /README|GitHub|首屏|首次/.test(decision.title || ""))) {
    return [
      "把产品定位为 local-first multi-agent workflow studio，首屏承诺聚焦 structured debates and discussions。",
      "默认走 mock-first quickstart，保证 fresh clone 用户不配置模型也能跑完一次完整 workflow。",
      "把升级路径写清楚：Mock 验证流程，Local model 验证真实推理，CLI agent 验证核心产品承诺。",
      "首屏明确区分 Discussion 和 Debate：Discussion 生成并比较方案，Debate 对一个 proposal 做对抗压测。",
      "运行结束默认展示 Result Artifact，而不是聊天记录；JSON 做事实源，HTML/Markdown 做复用出口。",
      "真实 runtime 失败时保留 partial artifact，并给出错误类型、下一步动作和可复制诊断信息。"
    ];
  }
  const positioning = firstDecisionByTitle(decisions, /定位|承诺|position/i);
  const firstRun = firstDecisionByTitle(decisions, /首次|运行|Quickstart|新用户/i);
  const artifact = firstDecisionByTitle(decisions, /结果|沉淀|导出|artifact/i);
  const error = firstDecisionByTitle(decisions, /错误|恢复|timeout|失败/i);
  const roadmap = firstDecisionByTitle(decisions, /路线图|阶段|phase/i);
  return [
    positioning ? `把产品定位为 ${extractDecisionPart(positioning.decision, "选择方案", 160) || "local-first multi-agent workflow studio"}。` : "",
    firstRun ? `先保证首次运行成功：${extractDecisionPart(firstRun.decision, "选择方案", 170)}` : "",
    `首屏要直接区分 Discussion 与 Debate：Discussion 负责发散比较，Debate 负责对抗压测。`,
    artifact ? `结果默认沉淀为 artifact：${extractDecisionPart(artifact.decision, "选择方案", 170)}` : "",
    error ? `真实 runtime 失败时要保留 partial artifact，并给出清晰恢复动作。` : "",
    roadmap ? `落地顺序按 Phase 0 到 Phase 3 推进，先首跑和 GitHub 转化，再补真实 runtime 与恢复能力。` : ""
  ]
    .filter(Boolean)
    .slice(0, 6)
    .map((item) => compactPlainText(item, 190) || item);
}

function fallbackDiscussionSummary(session, reason = "") {
  const decisions = Array.isArray(session.discussionDecisions) ? session.discussionDecisions : [];
  const digests = decisions.map(decisionDigest);
  const priorities = fallbackPriorities(session, digests);
  const lines = [
    `## 讨论模式最终方案`,
    ``,
    `标题：${fallbackDocumentTitle(session)}`,
    ``,
    `这轮讨论已经完成 ${decisions.length} 个事项的逐项拍板，最终文档根据已敲定事项整理为可执行路线图。`,
    reason ? `生成说明：${reason}` : "",
    ``,
    `### 核心优先级`,
    ...(priorities.length ? priorities.map((item, index) => `${index + 1}. ${item}`) : [`1. 先把已敲定事项转成可执行任务。`]),
    ``,
    `### 决策索引`,
    ...(digests.length ? digests.map((item) => `${item.number}. ${item.title}：${item.judgment}`) : [`1. 暂无结构化事项，可重新生成或补充背景后再跑。`]),
    ``,
    `### 下一步`,
    `优先把这些决定转成 README、默认示例、Agent 配置体验、错误处理和结果文档展示的具体改动。`
  ].filter(Boolean);
  return lines.join("\n");
}

function fallbackDiscussionHtml(session, reason = "") {
  const decisions = Array.isArray(session.discussionDecisions) ? session.discussionDecisions : [];
  const digests = decisions.map(decisionDigest);
  const priorities = fallbackPriorities(session, digests);
  const roadmapDecision = firstDecisionByTitle(decisions, /路线图|阶段|phase/i);
  const phaseCards = roadmapDecision ? extractPhaseCards(roadmapDecision.decision) : [];
  const title = fallbackDocumentTitle(session);
  const decisionCards = digests.length
    ? digests
        .map((decision) => {
          return [
            `<section class="card">`,
            `<p class="eyebrow">Decision ${decision.number}</p>`,
            `<h2>${escapeHtml(decision.title)}</h2>`,
            `<p class="question">${escapeHtml(decision.question || "")}</p>`,
            `<p class="judgment">${escapeHtml(decision.judgment)}</p>`,
            decision.choice ? `<p>${escapeHtml(decision.choice)}</p>` : "",
            decision.constraints ? `<details><summary>执行约束</summary><p>${escapeHtml(decision.constraints)}</p></details>` : "",
            `</section>`
          ].join("");
        })
        .join("")
    : `<section class="card"><h2>暂无已敲定事项</h2><p>可以回到应用继续讨论或重新生成方案。</p></section>`;
  const priorityList = priorities.length
    ? priorities.map((item, index) => `<li><strong>${index + 1}</strong><span>${escapeHtml(item)}</span></li>`).join("")
    : `<li><strong>1</strong><span>先把已敲定事项转成可执行任务。</span></li>`;
  const roadmapCards = phaseCards.length
    ? phaseCards
        .map((phase) => {
          return [
            `<article class="phase">`,
            `<span>${escapeHtml(phase.phase)}</span>`,
            `<h3>${escapeHtml(phase.title)}</h3>`,
            phase.changes ? `<p><b>改动</b>${escapeHtml(phase.changes)}</p>` : "",
            phase.acceptance ? `<p><b>验收</b>${escapeHtml(phase.acceptance)}</p>` : "",
            phase.risk ? `<p><b>风险</b>${escapeHtml(phase.risk)}</p>` : "",
            `</article>`
          ].join("");
        })
        .join("")
    : "";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)} - 最终方案</title>`,
    "<style>",
    ":root{color:#172331;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif}",
    "*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172331;line-height:1.68}",
    "main{max-width:1120px;margin:0 auto;padding:42px 22px 64px}",
    ".hero{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:26px;align-items:end;padding:30px 0 28px;border-bottom:1px solid #d8e1ea}",
    ".label,.eyebrow{margin:0 0 8px;color:#24735c;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
    "h1{max-width:820px;margin:0;font-size:38px;line-height:1.12;letter-spacing:0}",
    ".goal{max-width:820px;margin:16px 0 0;color:#405064;font-size:16px}",
    ".hero-card{padding:18px;border:1px solid #d8e1ea;border-radius:8px;background:#fff;box-shadow:0 12px 30px rgba(31,44,58,.07)}",
    ".metric{display:grid;gap:2px;margin-bottom:12px}.metric strong{font-size:25px}.metric span{color:#64748b;font-size:12px}",
    ".notice{margin:12px 0 0;padding:11px 12px;border:1px solid #ead7aa;border-radius:8px;background:#fff9ea;color:#70531b;font-size:13px}",
    ".section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}",
    ".section-head h2{margin:0;font-size:24px}.section-head p{max-width:560px;margin:0;color:#64748b;font-size:14px}",
    ".priorities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}",
    ".priorities li{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:start;padding:15px;border:1px solid #d8e1ea;border-radius:8px;background:#fff}",
    ".priorities strong{display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:#172331;color:#fff;font-size:13px}",
    ".priorities span{color:#263647;font-size:14px}",
    ".roadmap{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.phase{padding:16px;border:1px solid #d8e1ea;border-radius:8px;background:#fff}.phase span{color:#c45336;font-size:12px;font-weight:800}.phase h3{margin:6px 0 10px;font-size:16px}.phase p{margin:0 0 9px;color:#4b5b6d;font-size:13px}.phase b{display:block;margin-bottom:2px;color:#172331;font-size:12px}",
    ".grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}",
    ".card{padding:18px;border:1px solid #d8e1ea;border-radius:8px;background:#fff;box-shadow:0 10px 24px rgba(31,44,58,.05)}",
    ".card h2{margin:0 0 8px;font-size:19px;line-height:1.3}.question{margin:0 0 12px;color:#64748b;font-size:13px}.judgment{margin:0 0 10px;color:#172331;font-weight:760}.card p{margin:0 0 10px;color:#334155;font-size:14px}",
    "details{margin-top:10px;padding-top:10px;border-top:1px solid #edf1f5}summary{cursor:pointer;color:#24735c;font-size:13px;font-weight:800}details p{margin-top:8px}",
    ".next{margin-top:28px;padding:22px;border-radius:8px;background:#172331;color:#fff}.next h2{margin:0;color:#fff}.next p{margin:8px 0 0;color:#dce6ef}",
    "@media(max-width:860px){main{padding:28px 16px 46px}.hero,.grid,.priorities,.roadmap{grid-template-columns:1fr}h1{font-size:30px}}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    '<section class="hero">',
    "<div>",
    '<p class="label">Final Plan</p>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="goal">${escapeHtml(session.goal || "形成最终方案。")}</p>`,
    reason ? `<p class="notice">主 agent 最终 HTML 汇总未按时完成，因此本文档根据已敲定事项自动生成。原因：${escapeHtml(reason)}</p>` : "",
    "</div>",
    '<aside class="hero-card">',
    `<div class="metric"><strong>${decisions.length}</strong><span>decisions settled</span></div>`,
    `<div class="metric"><strong>${phaseCards.length || 4}</strong><span>delivery phases</span></div>`,
    `<div class="metric"><strong>Local-first</strong><span>mock → local model → CLI agents</span></div>`,
    "</aside>",
    "</section>",
    '<section class="section">',
    '<div class="section-head"><h2>Highest Priorities</h2><p>把这份讨论先压成最影响 GitHub 转化和首次成功率的行动顺序。</p></div>',
    `<ol class="priorities">${priorityList}</ol>`,
    "</section>",
    roadmapCards
      ? `<section class="section"><div class="section-head"><h2>Delivery Roadmap</h2><p>按风险和用户价值排序，先做能让新用户跑通并相信产品价值的部分。</p></div><div class="roadmap">${roadmapCards}</div></section>`
      : "",
    '<section class="section">',
    '<div class="section-head"><h2>Decision Index</h2><p>每个决策保留判断、选择和约束，方便后续拆成 issues 或 PR。</p></div>',
    `<div class="grid">${decisionCards}</div>`,
    "</section>",
    '<section class="next">',
    "<h2>建议下一步</h2>",
    "<p>先把 Phase 0 拆成小 PR：README 首屏、mock-first quickstart、Discussion/Debate 文案、artifact 完成页和最小错误恢复。完成后再补真实 runtime 的向导与 metadata。</p>",
    "</section>",
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

async function completeDiscussionWithFallback(session, round, reason = "") {
  const safeRound = round || session.currentRound + 1;
  const result = fallbackDiscussionSummary(session, reason);
  const html = fallbackDiscussionHtml(session, reason);
  session.result = result;
  session.resultHtml = html;
  session.error = "";
  appendResultMessage(session, `${result}\n\nHTML 文档已根据已敲定事项自动生成，可在右侧预览或打开。`, safeRound);
  await setSessionPhase(session, "complete", reason ? "HTML 文档已自动生成" : "HTML 最终方案已生成");
  emit(session, "result", { result, resultHtml: true });
  return { result, html };
}

async function runDebateSession(session) {
  if (session.status === "running") return;
  await setSessionPhase(session, "running", "准备正式辩论");
  session.stopRequested = false;

  const [mainAgent, affirmativeAgent, negativeAgent] = session.agents;
  if (!mainAgent || !affirmativeAgent || !negativeAgent) {
    session.error = "辩论模式需要至少 3 个 participant agent：主 agent、正方辩手、反方辩手。";
    await setSessionPhase(session, "error", "辩论模式 agent 不足");
    return;
  }

  try {
    if (!session.research) {
      await setSessionPhase(session, "running", "检索公开网络信息");
      session.research = await fetchWebResearch(session.topic, session.context, session.researchOptions || defaultResearch);
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (!Array.isArray(session.debatePlan) || !session.debatePlan.length) {
      await setSessionPhase(session, "running", `${displayAgentName(mainAgent)} 拆分辩题`);
      const planMessage = await runAgentTurn(session, mainAgent, 0, "agent", buildDebatePlanPrompt(session, mainAgent), {
        agentTitle: "主 agent / 拆题设辩"
      });
      assertAgentTurnComplete(planMessage, "主 agent");
      session.debatePlan = parseDebateItems(planMessage.content, session.maxRounds, session);
      session.debateOutcomes = [];
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (!Array.isArray(session.debateOutcomes)) session.debateOutcomes = [];
    const items = session.debatePlan.slice(0, session.maxRounds);
    const startIndex = session.debateOutcomes.length;
    for (let index = startIndex; index < items.length; index += 1) {
      if (session.stopRequested) break;
      const item = items[index];
      const round = index + 1;
      session.currentRound = round;
      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：主 agent 开题`);

      const introMessage = await runAgentTurn(session, mainAgent, round, "agent", buildDebateMotionIntroPrompt(session, mainAgent, item, index, items.length), {
        agentTitle: "主 agent / 开题"
      });
      assertAgentTurnComplete(introMessage, "主 agent");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：正方立论`);
      const affirmativeMessage = await runAgentTurn(
        session,
        affirmativeAgent,
        round,
        "agent",
        buildDebateConstructivePrompt(session, affirmativeAgent, item, introMessage, "affirmative", index, items.length),
        { agentTitle: "正方辩手 / 立论" }
      );
      assertAgentTurnComplete(affirmativeMessage, "正方辩手");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：反方立论`);
      const negativeMessage = await runAgentTurn(
        session,
        negativeAgent,
        round,
        "agent",
        buildDebateConstructivePrompt(session, negativeAgent, item, introMessage, "negative", index, items.length, affirmativeMessage),
        { agentTitle: "反方辩手 / 立论" }
      );
      assertAgentTurnComplete(negativeMessage, "反方辩手");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：正方反驳`);
      const affirmativeRebuttal = await runAgentTurn(
        session,
        affirmativeAgent,
        round,
        "agent",
        buildDebateRebuttalPrompt(session, affirmativeAgent, item, introMessage, affirmativeMessage, negativeMessage, "affirmative", index, items.length),
        { agentTitle: "正方辩手 / 反驳" }
      );
      assertAgentTurnComplete(affirmativeRebuttal, "正方辩手");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：反方反驳`);
      const negativeRebuttal = await runAgentTurn(
        session,
        negativeAgent,
        round,
        "agent",
        buildDebateRebuttalPrompt(session, negativeAgent, item, introMessage, negativeMessage, affirmativeMessage, "negative", index, items.length),
        { agentTitle: "反方辩手 / 反驳" }
      );
      assertAgentTurnComplete(negativeRebuttal, "反方辩手");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `辩点 ${round}/${items.length}：主 agent 裁决`);
      const judgeMessage = await runAgentTurn(
        session,
        mainAgent,
        round,
        "agent",
        buildDebateJudgePrompt(session, mainAgent, item, introMessage, affirmativeMessage, negativeMessage, affirmativeRebuttal, negativeRebuttal, index, items.length),
        { agentTitle: "主 agent / 阶段裁决" }
      );
      assertAgentTurnComplete(judgeMessage, "主 agent");
      session.debateOutcomes.push({
        title: item.title,
        question: item.question,
        affirmative: item.affirmative,
        negative: item.negative,
        criteria: item.criteria,
        judgment: judgeMessage.content.trim()
      });
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (session.stopRequested) {
      await setSessionPhase(session, "stopped", "已停止");
      return;
    }

    await setSessionPhase(session, "running", `${displayAgentName(mainAgent)} 总结裁决`);
    const finalMessage = await runAgentTurn(session, mainAgent, session.currentRound + 1, "agent", buildDebateFinalPrompt(session, mainAgent), {
      agentTitle: "主 agent / 最终裁决"
    });
    assertAgentTurnComplete(finalMessage, "主 agent");
    session.result = finalMessage.content.trim();
    appendResultMessage(session, session.result, session.currentRound + 1);
    await setSessionPhase(session, "complete", "辩论裁决已形成");
    emit(session, "result", { result: session.result });
  } catch (error) {
    session.error = error.message || String(error);
    await setSessionPhase(session, "error", session.error || "运行失败");
  }
}

async function runDiscussionSession(session) {
  if (session.status === "running") return;
  await setSessionPhase(session, "running", "准备讨论模式");
  session.stopRequested = false;
  session.error = "";

  const [mainAgent, ideaAgent, evaluationAgent] = session.agents;
  if (!mainAgent || !ideaAgent || !evaluationAgent) {
    session.error = "讨论模式需要至少 3 个 participant agent：主 agent、思路 agent、评估 agent。";
    await setSessionPhase(session, "error", "讨论模式 agent 不足");
    return;
  }

  try {
    if (!session.research) {
      await setSessionPhase(session, "running", "检索公开网络信息");
      session.research = await fetchWebResearch(session.topic, session.context, session.researchOptions || defaultResearch);
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (!Array.isArray(session.discussionPlan) || !session.discussionPlan.length) {
      await setSessionPhase(session, "running", `${displayAgentName(mainAgent)} 拆分议题`);
      const planMessage = await runAgentTurn(session, mainAgent, 0, "agent", buildDiscussionPlanPrompt(session, mainAgent), {
        agentTitle: "主 agent / 拆题"
      });
      assertAgentTurnComplete(planMessage, "主 agent");
      session.discussionPlan = parseDiscussionItems(planMessage.content, session.maxRounds, session);
      session.discussionDecisions = [];
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (!Array.isArray(session.discussionDecisions)) session.discussionDecisions = [];
    const items = session.discussionPlan.slice(0, session.maxRounds);
    const startIndex = Array.isArray(session.discussionDecisions) ? session.discussionDecisions.length : 0;
    for (let index = startIndex; index < items.length; index += 1) {
      if (session.stopRequested) break;
      const item = items[index];
      const round = index + 1;
      session.currentRound = round;
      await setSessionPhase(session, "running", `事项 ${round}/${items.length}：主 agent 抛题`);
      let introMessage = findDiscussionStepMessage(session, round, ["主 agent / 抛出事项", "系统续跑 / 抛出事项"]);
      if (introMessage?.status === "complete") {
        // Reuse a completed intro when resuming from a prior interrupted run.
      } else if (introMessage?.status === "error" || introMessage?.status === "stopped") {
        introMessage = await appendDiscussionFallbackIntro(session, item, index, items.length, introMessage);
      } else {
        introMessage = await runAgentTurn(session, mainAgent, round, "agent", buildDiscussionItemIntroPrompt(session, mainAgent, item, index, items.length), {
          agentTitle: "主 agent / 抛出事项"
        });
        if (session.stopRequested) break;
        if (introMessage.status === "error" || introMessage.status === "stopped") {
          introMessage = await appendDiscussionFallbackIntro(session, item, index, items.length, introMessage);
        }
      }
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `事项 ${round}/${items.length}：${displayAgentName(ideaAgent)} 发散`);
      let ideasMessage = findDiscussionStepMessage(session, round, "思路 agent / 多方案");
      if (ideasMessage?.status === "complete") {
        // Reuse completed ideas after manual repair or server restart.
      } else {
        ideasMessage = await runAgentTurn(session, ideaAgent, round, "agent", buildDiscussionIdeasPrompt(session, ideaAgent, item, introMessage, index, items.length), {
          agentTitle: "思路 agent / 多方案"
        });
      }
      assertAgentTurnComplete(ideasMessage, "思路 agent");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `事项 ${round}/${items.length}：${displayAgentName(evaluationAgent)} 评估`);
      let evaluationMessage = findDiscussionStepMessage(session, round, "评估 agent / 利弊契合");
      if (evaluationMessage?.status === "complete") {
        // Reuse completed evaluation after manual repair or server restart.
      } else {
        evaluationMessage = await runAgentTurn(
          session,
          evaluationAgent,
          round,
          "agent",
          buildDiscussionEvaluationPrompt(session, evaluationAgent, item, introMessage, ideasMessage, index, items.length),
          { agentTitle: "评估 agent / 利弊契合" }
        );
      }
      assertAgentTurnComplete(evaluationMessage, "评估 agent");
      if (session.stopRequested) break;

      await setSessionPhase(session, "running", `事项 ${round}/${items.length}：主 agent 拍板`);
      let decisionMessage = findDiscussionStepMessage(session, round, ["主 agent / 判断选择", "系统续跑 / 判断选择"]);
      if (decisionMessage?.status === "complete") {
        // Reuse completed decision after manual repair or server restart.
      } else if (decisionMessage?.status === "error" || decisionMessage?.status === "stopped") {
        decisionMessage = await appendDiscussionFallbackDecision(session, item, introMessage, ideasMessage, evaluationMessage, index, items.length, decisionMessage);
      } else {
        decisionMessage = await runAgentTurn(
          session,
          mainAgent,
          round,
          "agent",
          buildDiscussionDecisionPrompt(session, mainAgent, item, introMessage, ideasMessage, evaluationMessage, index, items.length),
          { agentTitle: "主 agent / 判断选择" }
        );
        if (session.stopRequested) break;
        if (decisionMessage.status === "error" || decisionMessage.status === "stopped") {
          decisionMessage = await appendDiscussionFallbackDecision(session, item, introMessage, ideasMessage, evaluationMessage, index, items.length, decisionMessage);
        }
      }
      if (session.stopRequested) break;
      session.discussionDecisions.push({
        title: item.title,
        question: item.question,
        acceptance: item.acceptance,
        decision: decisionMessage.content.trim()
      });
      await persistSession(session);
      emit(session, "session", publicSession(session));
    }

    if (session.stopRequested) {
      await setSessionPhase(session, "stopped", "已停止");
      return;
    }

    await setSessionPhase(session, "running", `${displayAgentName(mainAgent)} 汇总 HTML 文档`);
    const finalMessage = await runAgentTurn(session, mainAgent, session.currentRound + 1, "agent", buildDiscussionHtmlPrompt(session, mainAgent), {
      agentTitle: "主 agent / HTML 文档"
    });
    if (finalMessage.status === "error") {
      await completeDiscussionWithFallback(session, session.currentRound + 1, finalMessage.errorTitle || finalMessage.error || "主 agent 最终 HTML 汇总超时");
      return;
    }
    assertAgentTurnComplete(finalMessage, "主 agent");
    const result = extractDiscussionSummary(finalMessage.content, session);
    const html = extractHtmlDocument(finalMessage.content, session);
    session.result = result;
    session.resultHtml = html;
    appendResultMessage(session, `${result}\n\nHTML 文档已生成，可在右侧预览或打开。`, session.currentRound + 1);
    await setSessionPhase(session, "complete", "HTML 最终方案已生成");
    emit(session, "result", { result, resultHtml: Boolean(html) });
  } catch (error) {
    session.error = error.message || String(error);
    await setSessionPhase(session, "error", session.error || "讨论模式运行失败");
  }
}

async function runSession(session) {
  if ((session.mode || "debate") === "discussion") {
    return await runDiscussionSession(session);
  }
  return await runDebateSession(session);
}

async function createSession(body) {
  const config = await readAgentConfig();
  const enabled = config.agents.filter((agent) => agent.enabled !== false);
  const selected = new Set(Array.isArray(body.agentIds) ? body.agentIds : []);
  const mode = String(body.mode || "debate") === "discussion" ? "discussion" : "debate";
  const participantPool = enabled.filter((agent) => (agent.kind || "participant") !== "moderator");
  const agents = participantPool.filter((agent) => (selected.size ? selected.has(agent.id) : true));
  const fallbackAgents = agents.length ? agents : participantPool.slice(0, 3);
  const sessionAgents = mode === "discussion" || mode === "debate" ? fallbackAgents.slice(0, 3) : fallbackAgents;
  const moderator =
    enabled.find((agent) => agent.id === body.moderatorId) ||
    enabled.find((agent) => (agent.kind || "participant") === "moderator") ||
    null;

  if (!fallbackAgents.length) {
    throw new Error("没有可用 participant agent。请在 agents.config.json 中启用至少一个 agent。");
  }
  if (mode === "debate" && fallbackAgents.length < 3) {
    throw new Error("辩论模式需要至少 3 个 participant agent：主 agent、正方辩手、反方辩手。");
  }
  if (mode === "discussion" && fallbackAgents.length < 3) {
    throw new Error("讨论模式需要至少 3 个 participant agent：主 agent、思路 agent、评估 agent。");
  }

  const now = new Date().toISOString();
  const maxRounds = Math.max(1, Math.min(Number(body.maxRounds || 3), 12));
  const minRounds = Math.min(maxRounds, Math.max(1, Math.min(Number(body.minRounds || 2), 12)));
  const seededDiscussionPlan = mode === "discussion" ? normalizeSeededDiscussionPlan(body.discussionPlan, maxRounds) : [];
  const session = {
    id: randomUUID(),
    mode,
    topic: String(body.topic || "").trim(),
    context: String(body.context || "").trim(),
    goal: String(body.goal || "形成可执行结论、关键分歧和下一步建议。").trim(),
    maxRounds,
    minRounds,
    currentRound: 0,
    status: "queued",
    phase: "排队中",
    createdAt: now,
    updatedAt: now,
    agents: sessionAgents,
    moderator: mode === "discussion" ? null : moderator,
    messages: [],
    result: "",
    resultHtml: "",
    debatePlan: [],
    debateOutcomes: [],
    discussionPlan: seededDiscussionPlan,
    discussionDecisions: [],
    research: null,
    researchOptions: config.research,
    error: "",
    stopRequested: false,
    currentChild: null
  };

  if (!session.topic) {
    throw new Error("主题不能为空。");
  }

  if (seededDiscussionPlan.length) {
    session.messages.push(
      createSystemMessage({
        round: 0,
        agentName: "启动助手",
        agentTitle: "启动助手 / 预拆事项",
        content: [
          `已使用启动助手预拆 ${seededDiscussionPlan.length} 个讨论事项。正式讨论将从第 1 个事项开始，不再额外等待主 agent 拆题。`,
          ``,
          ...seededDiscussionPlan.map((item, index) => `${index + 1}. ${item.title}：${item.question}`)
        ].join("\n")
      })
    );
  }

  sessions.set(session.id, session);
  await persistSession(session);
  runSession(session);
  return session;
}

async function listPersistedSessionSummaries() {
  const files = await readdir(sessionsDir).catch(() => []);
  const summaries = [];
  for (const file of files.filter((name) => name.endsWith(".json")).slice(-40)) {
    try {
      const parsed = JSON.parse(await readFile(join(sessionsDir, file), "utf8"));
      summaries.push({
        id: parsed.id,
        mode: parsed.mode || "debate",
        topic: parsed.topic,
        status: parsed.status,
        currentRound: parsed.currentRound,
        maxRounds: parsed.maxRounds,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        result: parsed.result ? parsed.result.slice(0, 280) : ""
      });
    } catch {
      // Ignore malformed snapshots.
    }
  }
  return summaries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function getSessionById(sessionId) {
  const live = sessions.get(sessionId);
  if (live) return live;

  const file = join(sessionsDir, `${sessionId}.json`);
  if (!existsSync(file)) return null;

  const parsed = JSON.parse(await readFile(file, "utf8"));
  const session = {
    ...parsed,
    mode: parsed.mode || "debate",
    resultHtml: parsed.resultHtml || "",
    debatePlan: parsed.debatePlan || [],
    debateOutcomes: parsed.debateOutcomes || [],
    discussionPlan: parsed.discussionPlan || [],
    discussionDecisions: parsed.discussionDecisions || [],
    researchOptions: parsed.researchOptions || defaultResearch,
    stopRequested: false,
    currentChild: null
  };
  if (session.resultHtml) {
    await writeFile(sessionHtmlPath(session), session.resultHtml, "utf8").catch(() => {});
  }
  sessions.set(session.id, session);
  await recoverAbandonedRunningSession(session);
  return session;
}

function stopSessionProcess(session) {
  if (!session) return;
  session.deleted = true;
  session.stopRequested = true;
  if (session.currentChild) {
    session.currentChild.kill("SIGTERM");
    session.currentChild = null;
  }
}

function closeSessionSubscribers(sessionId) {
  const clients = subscribers.get(sessionId);
  if (!clients) return;
  for (const res of clients) {
    res.write(`event: deleted\n`);
    res.write(`data: {"id":${JSON.stringify(sessionId)}}\n\n`);
    res.end();
  }
  subscribers.delete(sessionId);
}

async function deleteSessionById(sessionId) {
  const live = sessions.get(sessionId);
  stopSessionProcess(live);
  sessions.delete(sessionId);
  closeSessionSubscribers(sessionId);
  await Promise.all([
    unlink(sessionStoragePathForId(sessionId)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    }),
    unlink(sessionHtmlPathForId(sessionId)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    })
  ]);
}

async function clearSessionHistory() {
  const ids = new Set([...sessions.keys()]);
  const files = await readdir(sessionsDir).catch(() => []);
  for (const file of files) {
    if (file.endsWith(".json")) ids.add(file.replace(/\.json$/, ""));
  }

  for (const sessionId of ids) {
    if (isSafeSessionId(sessionId)) await deleteSessionById(sessionId);
  }

  const exportFiles = await readdir(exportsDir).catch(() => []);
  await Promise.all(
    exportFiles
      .filter((file) => file.endsWith(".html"))
      .map((file) =>
        unlink(join(exportsDir, file)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        })
      )
  );

  return ids.size;
}

function attachEventStream(req, res, session) {
  res.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`event: snapshot\n`);
  res.write(`data: ${JSON.stringify(publicSession(session))}\n\n`);

  const clients = getSubscribers(session.id);
  clients.add(res);
  req.on("close", () => {
    clients.delete(res);
  });
}

async function serveStatic(url, res) {
  const distDir = join(rootDir, "dist");
  if (!existsSync(distDir)) {
    sendText(res, 200, "Agent Meeting Studio backend is running. Start the frontend with npm run client.");
    return;
  }

  const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  let filePath = resolve(distDir, safePath || "index.html");
  if (!filePath.startsWith(distDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(distDir, "index.html");
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": mimeTypes[ext] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing URL" });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, configPath, sessionsDir });
      return;
    }

    if (url.pathname === "/api/agents" && req.method === "GET") {
      const config = await readAgentConfig();
      sendJson(res, 200, { configPath, agents: config.agents.map(publicAgent) });
      return;
    }

    if (url.pathname === "/api/agents" && req.method === "PUT") {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.agents)) throw new Error("agents must be an array");
      await writeAgentConfig(body.agents);
      const config = await readAgentConfig();
      sendJson(res, 200, { configPath, agents: config.agents.map(publicAgent) });
      return;
    }

    if (url.pathname === "/api/brief-assist" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (!String(body.topic || "").trim()) throw new Error("主题不能为空。");
      const payload = await runBriefAssist(body);
      sendJson(res, 200, payload);
      return;
    }

    if (url.pathname === "/api/sessions" && req.method === "GET") {
      const persisted = await listPersistedSessionSummaries();
      const live = [...sessions.values()].map(summarizeSession);
      const byId = new Map([...persisted, ...live].map((session) => [session.id, session]));
      sendJson(res, 200, { sessions: [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) });
      return;
    }

    if (url.pathname === "/api/sessions" && req.method === "DELETE") {
      const deleted = await clearSessionHistory();
      sendJson(res, 200, { ok: true, deleted });
      return;
    }

    if (url.pathname === "/api/sessions" && req.method === "POST") {
      const body = await readJsonBody(req);
      const session = await createSession(body);
      sendJson(res, 201, { session: publicSession(session) });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/([^/]+))?$/);
    if (sessionMatch) {
      const [, sessionId, action] = sessionMatch;
      if (!isSafeSessionId(sessionId)) {
        sendJson(res, 400, { error: "Invalid session id." });
        return;
      }
      const session = await getSessionById(sessionId);
      if (!session) {
        sendJson(res, 404, { error: "Session not found or server restarted. Check data/sessions for saved snapshots." });
        return;
      }

      if (!action && req.method === "GET") {
        sendJson(res, 200, { session: publicSession(session) });
        return;
      }

      if (!action && req.method === "DELETE") {
        await deleteSessionById(sessionId);
        sendJson(res, 200, { ok: true, deleted: 1 });
        return;
      }

      if (action === "events" && req.method === "GET") {
        attachEventStream(req, res, session);
        return;
      }

      if (action === "document" && req.method === "GET") {
        if (!session.resultHtml && (session.mode || "debate") === "discussion" && session.discussionDecisions?.length) {
          session.result = session.result || fallbackDiscussionSummary(session, "手动打开文档时自动补全文档。");
          session.resultHtml = fallbackDiscussionHtml(session, "手动打开文档时自动补全文档。");
          await persistSession(session);
        }
        const html = session.resultHtml || extractHtmlDocument(session.result || synthesizeResult(session), session);
        if (session.resultHtml) {
          await writeFile(sessionHtmlPath(session), session.resultHtml, "utf8").catch(() => {});
        }
        res.writeHead(200, {
          ...corsHeaders(),
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:;"
        });
        res.end(html);
        return;
      }

      if (action === "stop" && req.method === "POST") {
        session.stopRequested = true;
        if (session.currentChild) session.currentChild.kill("SIGTERM");
        await closeAbandonedStreamingMessages(session, "用户停止后已暂停，可继续本会话。");
        await setSessionPhase(session, "stopped", "已请求停止");
        sendJson(res, 200, { session: publicSession(session) });
        return;
      }

      if (action === "repair" && req.method === "POST") {
        const body = await readJsonBody(req);
        const hasActiveChild = Boolean(session.currentChild && !session.currentChild.killed);
        if (session.status === "running" && hasActiveChild) {
          sendJson(res, 200, {
            session: publicSession(session),
            repaired: false,
            continued: false,
            reason: "active-child"
          });
          return;
        }

        const hadAbandonedMessages = await closeAbandonedStreamingMessages(session, "已执行自修复，残留发言已暂停。");
        let repaired = hadAbandonedMessages;
        if (session.status === "running" || session.status === "queued") {
          repaired = true;
          session.stopRequested = false;
          await setSessionPhase(session, "stopped", hadAbandonedMessages ? "已修复卡住状态，可继续" : "运行已暂停，可继续");
        } else if (hadAbandonedMessages) {
          await persistSession(session);
          emit(session, "session", publicSession(session));
        }

        const shouldContinue = Boolean(body.continue) && session.status !== "complete";
        if (shouldContinue) {
          session.status = "queued";
          session.stopRequested = false;
          await persistSession(session);
          emit(session, "session", publicSession(session));
          runSession(session);
          sendJson(res, 200, { session: publicSession(session), repaired, continued: true });
          return;
        }

        sendJson(res, 200, { session: publicSession(session), repaired, continued: false });
        return;
      }

      if (action === "continue" && req.method === "POST") {
        const body = await readJsonBody(req);
        await closeAbandonedStreamingMessages(session);
        session.maxRounds = Math.max(session.maxRounds, session.currentRound + Number(body.rounds || 1));
        session.status = "queued";
        session.stopRequested = false;
        runSession(session);
        sendJson(res, 200, { session: publicSession(session) });
        return;
      }

      if (action === "synthesize" && req.method === "POST") {
        if ((session.mode || "debate") === "discussion") {
          await completeDiscussionWithFallback(session, session.currentRound + 1, "手动归纳：根据已敲定事项生成最终方案文档。");
          sendJson(res, 200, { session: publicSession(session) });
          return;
        }
        session.result = synthesizeResult(session);
        await setSessionPhase(session, "complete", "手动归纳完成");
        sendJson(res, 200, { session: publicSession(session) });
        return;
      }
    }

    if (req.method === "GET") {
      await serveStatic(url, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Agent Meeting Studio API: http://127.0.0.1:${port}`);
});
