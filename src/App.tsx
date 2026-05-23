import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  FileJson2,
  FileText,
  FlaskConical,
  History,
  ListTree,
  Loader2,
  Languages,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Workflow
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  continueSession,
  createSession,
  clearSessions,
  deleteSession,
  getAgents,
  getSession,
  assistBrief,
  listSessions,
  repairSession,
  saveAgents,
  sessionDocumentUrl,
  sessionEventsUrl,
  stopSession,
  synthesizeSession
} from "./api";
import type { AgentConfig, BriefAssistDraft, DebateMessage, DebateSession, DiscussionPlanItem, SessionMode, SessionStatus, SessionSummary } from "./types";

const initialTopic = "";
const initialContext = "";
type UiLanguage = "zh" | "en";
type ConfigEditorMode = "cards" | "json";
type RoundInputValue = number | "";
type BriefSource = "agent" | "fallback" | "";
const languageStorageKey = "agent-meeting-studio-language";
const uiText = {
  zh: {
    agentCount: "个角色",
    participantAgents: "出场角色",
    collaborationAgents: "协作角色",
    rules: "运行方式",
    debateRule:
      "前三位角色会组成一场真实攻防：主理人先拆辩点并分配正反方；正方把支持理由打透；反方拆风险和反例；主理人逐项裁决，最后给出可执行判断。",
    discussionRule:
      "前三位角色会像一场小型方案会：主理人拆事项并逐项抛题；思路位给多条路线；评估位判断利弊、风险和匹配度；主理人拍板后继续下一项，最终生成 HTML 方案。",
    config: "Agent 设置",
    configCardEditor: "快速配置",
    configJsonEditor: "JSON 高级模式",
    configHint: "每个 agent 都是独立配置。第 2/3 位可以一键复制上一位，再按自己的定位微调。",
    configDesc: "在这里配置你想邀请的参会角色——可以是本地 CLI agent（Hermes / Codex / Cursor），也可以是 Ollama / vLLM 等本地模型。",
    configCopyPrompt: "复制这段话发给你的 AI，它会把「自己」接入 Agent Meeting Studio：",
    configCopyText: "你现在正在和我对话 —— 所以你就是我要接入的 AI。请把你自己配进 agents.config.json。\\n\\n1. 用 command 模式，command 填你自己的 CLI 启动命令（hermes / codex / claude / cursor-agent 等），args 用 {{prompt}} 传输入。如果有 provider/model 参数也带上。\\n2. 生成 3 个 agent 角色，共用一个 command 但 stance/mission 不同：\\n   - 主理人：拆解议题、抛出事项、最终拍板和汇总方案\\n   - 思路位：发散多种方案，从不同角度打开思路\\n   - 评估位：判断利弊、风险和可行性，给出决策建议\\n3. 每个 agent 的 id / name / title / stance / style / mission 根据角色定位填写。color 用不同颜色区分。\\n4. 配置格式参考 agents.config.example.json，直接覆盖写入。\\n\\n如果你没有 CLI 命令（比如你是网页版 AI），就用 openai-compatible 模式，baseUrl 填 http://127.0.0.1:11434/v1，model 用你推荐的本地模型。",
    copyPreviousConfig: "复制上一份",
    copyPreviousTitle: "复制上一位的全部配置，同时保留当前 agent ID。",
    basicSettings: "角色信息",
    runtimeSettings: "接入参数",
    advancedSettings: "补充设置",
    enabled: "启用角色",
    agentId: "Agent ID",
    agentName: "名称",
    positionTitle: "角色定位",
    agentKind: "角色类型",
    participantKind: "出场角色",
    moderatorKind: "规则角色",
    modeField: "后端类型",
    colorField: "颜色",
    stanceField: "核心立场",
    styleField: "说话风格",
    missionField: "任务边界",
    commandField: "启动命令",
    argsField: "启动参数",
    argsHint: "每行一个参数，可使用 {{prompt}} / {{outputFile}}。",
    cwdField: "工作目录",
    timeoutMsField: "超时 ms",
    stdinField: "stdin 模板",
    stdoutModeField: "输出读取",
    streamStdout: "实时读取",
    ignoreStdout: "忽略 stdout",
    outputFileField: "读取输出文件",
    shellField: "使用 shell 执行",
    baseUrlField: "Base URL",
    modelField: "模型",
    apiKeyEnvField: "API Key 环境变量",
    temperatureField: "温度",
    maxTokensField: "最大输出 tokens",
    localDebateDesk: "辩论工作台",
    localDiscussionDesk: "方案讨论室",
    createTopic: "发起一个议题",
    currentTopic: "正在推进",
    editTopic: "调整议题",
    chooseMode: "选择工作流",
    debateMode: "辩论",
    debateModeLabel: "对抗裁决",
    debateModeHint: "主理人拆题，正反方真实攻防，最后裁决。",
    discussionMode: "讨论",
    discussionModeLabel: "协作方案",
    discussionModeHint: "拆事项、发散方案、评估取舍，产出 HTML 方案。",
    topic: "辩题",
    discussionTopic: "讨论主题",
    context: "背景与约束",
    goal: "希望得到的结果",
    minRounds: "最少辩点",
    maxRounds: "最多辩点",
    minItems: "最少事项",
    maxItems: "最多事项",
    startDebate: "发起辩论",
    startDiscussion: "发起讨论",
    briefAssistant: "启动助手",
    briefAssistantHint: "输入粗略想法后，让主理人先整理成可讨论的 brief、选择题和事项清单。",
    prepareBrief: "主理人整理",
    preparingBrief: "整理中",
    applyBrief: "应用到议题",
    briefSourceAgent: "主理人已整理",
    briefSourceFallback: "本地兜底拆分",
    briefQuestions: "方向选择",
    briefAgenda: "预拆事项",
    briefMode: "建议模式",
    seededAgenda: "已预拆",
    stop: "停止",
    continueRound: "追加一轮",
    repairRun: "修复并继续",
    synthesize: "生成归纳",
    turnOrder: "推进节奏",
    debateFlow: "攻防进度",
    collaborationFlow: "讨论进度",
    serialHint: "主理人 / 正方 / 反方",
    discussionFlowHint: "主理人 / 思路位 / 评估位",
    itemIndex: "事项导航",
    debateIndex: "辩点导航",
    discussionIndex: "讨论导航",
    result: "结论区",
    research: "网页线索",
    htmlPlan: "方案文档",
    generatedByMain: "主理人已汇总",
    openDocument: "打开方案",
    resultEmpty: "完成后，这里会沉淀最终结论和方案。",
    recentSessions: "历史记录",
    refreshSessions: "刷新历史",
    clearHistory: "清空",
    deleteSession: "删除",
    historyEmpty: "暂无历史记录",
    confirmDeleteSession: "确定删除这条历史记录吗？相关会话存档和 HTML 文件都会移除。",
    confirmClearHistory: "确定清空所有历史记录吗？这会停止正在运行的会话，并删除本地会话存档和 HTML 文件。",
    closeConfig: "关闭设置",
    cancel: "取消",
    save: "保存",
    waiting: "准备开场",
    indexEmpty: "开始后，每一次真实发言都会在这里排好。",
    completed: "已完成",
    queued: "排队中",
    running: "推进中",
    stopped: "已停止",
    error: "异常",
    outputting: "生成中",
    stoppedStatus: "已停止",
    debate: "辩论",
    discussion: "讨论",
    finalResult: "最终结论",
    finalConvergence: "最终裁决",
    htmlFinalPlan: "方案文档",
    generatedDocument: "主理人生成的可展示方案",
    lastRealAgentResult: "最后一位角色的真实结论",
    item: "事项",
    motion: "辩点",
    round: "第",
    roundSuffix: "回合",
    planning: "拆解中",
    systemEvent: "系统记录",
    discussionGroupDetail: "抛题 / 发散 / 评估 / 拍板",
    debateGroupDetail: "开题 / 立论 / 反驳 / 裁决",
    messages: "条",
    finalOutput: "最终输出",
    mainAgent: "主理人",
    ideasAgent: "思路位",
    evaluationAgent: "评估位",
    affirmativeAgent: "正方",
    negativeAgent: "反方",
    localCommand: "本地命令",
    mock: "演示角色",
    intro: "先说结论",
    body: "正文",
    languageToggle: "English",
    copy: "复制",
    copied: "已复制",
    documentUrl: "在线地址",
    htmlPath: "HTML 路径",
    storagePath: "会话存档",
    noHtmlPath: "暂未生成",
    clues: "条线索",
    times: "次发言",
    speaking: "发言中",
    turn: "第",
    turnSuffix: "位",
    agentError: "角色调用失败",
    errorHint: "可尝试"
  },
  en: {
    agentCount: "roles",
    participantAgents: "Active Roles",
    collaborationAgents: "Workshop Roles",
    rules: "How It Runs",
    debateRule:
      "Debate turns a broad prompt into motions. The lead frames the ground, the affirmative defends the strongest case, the negative attacks assumptions and risk, then the lead lands a verdict you can act on.",
    discussionRule:
      "Discussion works like a strategy room. The lead turns the brief into concrete decisions, Ideas opens up possible routes, Evaluation tests fit and tradeoffs, then the lead locks the plan into an HTML document.",
    config: "Agent Setup",
    configCardEditor: "Quick Setup",
    configJsonEditor: "Advanced JSON",
    configHint: "Each agent is configured independently. Roles 2 and 3 can copy the previous role, then tune their own positioning.",
    configDesc: "Configure the participants you want to invite — local CLI agents (Hermes / Codex / Cursor), or local models via Ollama / vLLM.",
    configCopyPrompt: "Copy this and send it to your AI — it will wire itself into Agent Meeting Studio:",
    configCopyText: "You are the AI I'm talking to right now — so you are the backend I want to configure. Please plug yourself into agents.config.json.\\n\\n1. Use command mode. Set \\\"command\\\" to your own CLI launch command (hermes / codex / claude / cursor-agent etc.), with args containing {{prompt}}. Include any provider/model flags you use.\\n2. Create 3 agent roles sharing the same command but with different stance/mission:\\n   - Lead: decomposes topics, throws items, makes final decisions, compiles the plan\\n   - Ideator: generates diverse approaches from different angles\\n   - Evaluator: judges pros/cons, risks, feasibility, gives decision recommendations\\n3. Fill id / name / title / stance / style / mission for each role. Use distinct colors.\\n4. Match the format in agents.config.example.json. Overwrite directly.\\n\\nIf you don't have a CLI command (e.g. you're a web-based AI), fall back to openai-compatible mode with baseUrl http://127.0.0.1:11434/v1 and a recommended local model.",
    copyPreviousConfig: "Copy Previous",
    copyPreviousTitle: "Copy the previous role while keeping this agent ID.",
    basicSettings: "Role Profile",
    runtimeSettings: "Connection",
    advancedSettings: "Extras",
    enabled: "Enabled role",
    agentId: "Agent ID",
    agentName: "Name",
    positionTitle: "Role Positioning",
    agentKind: "Role Type",
    participantKind: "Active role",
    moderatorKind: "Rules role",
    modeField: "Backend Type",
    colorField: "Color",
    stanceField: "Core Stance",
    styleField: "Voice",
    missionField: "Mission Boundary",
    commandField: "Launch Command",
    argsField: "Launch Args",
    argsHint: "One argument per line. Supports {{prompt}} / {{outputFile}}.",
    cwdField: "Working Directory",
    timeoutMsField: "Timeout ms",
    stdinField: "stdin Template",
    stdoutModeField: "Output Source",
    streamStdout: "Read stream",
    ignoreStdout: "Ignore stdout",
    outputFileField: "Read output file",
    shellField: "Use shell",
    baseUrlField: "Base URL",
    modelField: "Model",
    apiKeyEnvField: "API Key env var",
    temperatureField: "Temperature",
    maxTokensField: "Max output tokens",
    localDebateDesk: "Debate Workspace",
    localDiscussionDesk: "Strategy Workshop",
    createTopic: "Start a new topic",
    currentTopic: "Current run",
    editTopic: "Refine topic",
    chooseMode: "Choose workflow",
    debateMode: "Debate",
    debateModeLabel: "Adversarial",
    debateModeHint: "Lead frames the motion, both sides clash, verdict follows.",
    discussionMode: "Discussion",
    discussionModeLabel: "Collaborative",
    discussionModeHint: "Break work down, explore options, evaluate tradeoffs, ship HTML.",
    topic: "Debate Prompt",
    discussionTopic: "Discussion Brief",
    context: "Context & Constraints",
    goal: "Desired Outcome",
    minRounds: "Min Motions",
    maxRounds: "Max Motions",
    minItems: "Min Items",
    maxItems: "Max Items",
    startDebate: "Launch Debate",
    startDiscussion: "Launch Discussion",
    briefAssistant: "Launch Assistant",
    briefAssistantHint: "Type a rough idea, then let the lead turn it into a brief, choices, and a discussion agenda.",
    prepareBrief: "Prepare Brief",
    preparingBrief: "Preparing",
    applyBrief: "Apply Brief",
    briefSourceAgent: "Prepared by lead",
    briefSourceFallback: "Local fallback",
    briefQuestions: "Direction Checks",
    briefAgenda: "Agenda",
    briefMode: "Suggested Mode",
    seededAgenda: "Agenda seeded",
    stop: "Stop",
    continueRound: "Add One Round",
    repairRun: "Repair & Continue",
    synthesize: "Generate Summary",
    turnOrder: "Run Rhythm",
    debateFlow: "Debate Progress",
    collaborationFlow: "Workshop Progress",
    serialHint: "Lead / Affirmative / Negative",
    discussionFlowHint: "Lead / Ideas / Evaluation",
    itemIndex: "Item Navigator",
    debateIndex: "Motion Navigator",
    discussionIndex: "Discussion Navigator",
    result: "Outcome",
    research: "Web Signals",
    htmlPlan: "Plan Document",
    generatedByMain: "Compiled by the lead",
    openDocument: "Open Plan",
    resultEmpty: "The final verdict or plan will appear here after the run.",
    recentSessions: "History",
    refreshSessions: "Refresh history",
    clearHistory: "Clear",
    deleteSession: "Delete",
    historyEmpty: "No history yet",
    confirmDeleteSession: "Delete this history item? Its session archive and HTML export will be removed.",
    confirmClearHistory: "Clear all history? Running sessions will be stopped, and local session archives plus HTML exports will be deleted.",
    closeConfig: "Close setup",
    cancel: "Cancel",
    save: "Save",
    waiting: "Ready to start",
    indexEmpty: "Once launched, every real agent turn is listed here in order.",
    completed: "Completed",
    queued: "Queued",
    running: "In progress",
    stopped: "Stopped",
    error: "Error",
    outputting: "Generating",
    stoppedStatus: "Stopped",
    debate: "Debate",
    discussion: "Discussion",
    finalResult: "Final Outcome",
    finalConvergence: "Final Verdict",
    htmlFinalPlan: "Plan Document",
    generatedDocument: "Presentation-ready plan from the lead",
    lastRealAgentResult: "Last real role response",
    item: "Item",
    motion: "Motion",
    round: "Round",
    roundSuffix: "",
    planning: "Breaking down",
    systemEvent: "System Log",
    discussionGroupDetail: "Prompt / Explore / Evaluate / Decide",
    debateGroupDetail: "Frame / Case / Rebuttal / Verdict",
    messages: "turns",
    finalOutput: "Final output",
    mainAgent: "Lead",
    ideasAgent: "Ideas",
    evaluationAgent: "Evaluation",
    affirmativeAgent: "Affirmative",
    negativeAgent: "Negative",
    localCommand: "Local command",
    mock: "Demo role",
    intro: "Quick Take",
    body: "Body",
    languageToggle: "中文",
    copy: "Copy",
    copied: "Copied",
    documentUrl: "Live URL",
    htmlPath: "HTML Path",
    storagePath: "Session Archive",
    noHtmlPath: "Not generated yet",
    clues: "signals",
    times: "turns",
    speaking: "Speaking",
    turn: "Turn",
    turnSuffix: "",
    agentError: "Agent call failed",
    errorHint: "Try"
  }
} satisfies Record<UiLanguage, Record<string, string>>;
const structuredHeadings = [
  "主题推进判断",
  "回应上一位",
  "我的立场",
  "网络线索",
  "新增推进",
  "交给下一位",
  "收敛状态",
  "终局判断",
  "当前事项",
  "问题边界",
  "判断标准",
  "交给思路 agent",
  "思路总览",
  "方案 A",
  "方案 B",
  "方案 C",
  "变体组合",
  "留给评估 agent",
  "评估框架",
  "利弊分析",
  "主题契合度",
  "推荐排序",
  "交给主 agent",
  "主 agent 判断",
  "选择方案",
  "取舍理由",
  "落地约束",
  "下一事项",
  "已敲定事项",
  "关键分歧",
  "可执行结论",
  "下一步",
  "结论"
];
const structuredHeadingPattern = new RegExp(
  `^\\s*(?:#{1,3}\\s*)?(?:\\d+[.、]\\s*)?(?:\\*\\*)?(${structuredHeadings.join("|")})(?:\\*\\*)?\\s*[：:]?\\s*(.*)$`
);

interface TextSection {
  title: string;
  body: string;
}

interface TimelineGroup {
  key: string;
  label: string;
  detail: string;
  messages: DebateMessage[];
}

function statusLabel(status: SessionStatus, language: UiLanguage) {
  const ui = uiText[language];
  const labels: Record<SessionStatus, string> = {
    queued: ui.queued,
    running: ui.running,
    complete: ui.completed,
    stopped: ui.stopped,
    error: ui.error
  };
  return labels[status];
}

function statusTone(status: SessionStatus) {
  if (status === "running" || status === "queued") return "live";
  if (status === "complete") return "done";
  if (status === "error") return "danger";
  return "neutral";
}

function modeLabel(mode: SessionMode | undefined, language: UiLanguage) {
  const ui = uiText[language];
  return mode === "discussion" ? ui.discussion : ui.debate;
}

const englishPresetText: Record<string, string> = {
  "原则 / 结构 / 可执行": "Principles / Structure / Execution",
  "反证 / 风险 / 破局": "Counterpoint / Risk / Breakthrough",
  "决策 / 综合 / 下一步": "Decision / Synthesis / Next Step",
  "主理人": "Lead",
  "正方": "Affirmative",
  "反方": "Negative",
  "思路位": "Ideas",
  "评估位": "Evaluation",
  "主 agent / 拆题设辩": "Lead / Frame motions",
  "主 agent / 开题": "Lead / Opening frame",
  "正方辩手 / 立论": "Affirmative / Case",
  "反方辩手 / 立论": "Negative / Case",
  "正方辩手 / 反驳": "Affirmative / Rebuttal",
  "反方辩手 / 反驳": "Negative / Rebuttal",
  "主 agent / 阶段裁决": "Lead / Stage verdict",
  "主 agent / 最终裁决": "Lead / Final verdict",
  "主 agent / 拆题": "Lead / Break down",
  "主 agent / 抛出事项": "Lead / Next item",
  "思路 agent / 多方案": "Ideas / Options",
  "评估 agent / 利弊契合": "Evaluation / Fit and tradeoffs",
  "主 agent / 判断选择": "Lead / Decision",
  "主 agent / HTML 文档": "Lead / HTML plan"
};

function displayText(value: string | undefined, language: UiLanguage) {
  if (!value) return "";
  return language === "en" ? englishPresetText[value.trim()] || value : value;
}

function agentPosition(agent: Pick<AgentConfig, "name" | "title" | "role" | "stance" | "id">, language: UiLanguage = "zh") {
  const stanceLead = agent.stance?.split(/[。；;\n]/)[0]?.trim();
  return displayText(agent.title || agent.role || stanceLead || agent.name || agent.id, language);
}

function agentDetail(agent: Pick<AgentConfig, "role" | "style" | "mission" | "stance" | "id">, language: UiLanguage = "zh") {
  return displayText(agent.role || agent.style || agent.mission || agent.stance || agent.id, language);
}

function messageSpeaker(message: DebateMessage, language: UiLanguage, agents: AgentConfig[] = []) {
  const ui = uiText[language];
  if (message.type === "result") return ui.finalResult;
  if (message.type === "system") return ui.systemEvent;
  const agent = agents.find((item) => item.id === message.agentId);
  return agent ? agentPosition(agent, language) : displayText(message.agentTitle || message.agentName || message.agentId, language);
}

function upsertMessage(messages: DebateMessage[], next: DebateMessage) {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  const copy = [...messages];
  copy[index] = { ...copy[index], ...next };
  return copy;
}

function appendMessageChunk(messages: DebateMessage[], id: string, chunk: string) {
  return messages.map((message) => (message.id === id ? { ...message, content: `${message.content}${chunk}` } : message));
}

function formatTime(value: string, language: UiLanguage) {
  if (!value) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatElapsed(startedAt: string, now: number) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "00:00";
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
}

function splitStructuredText(content: string, language: UiLanguage): TextSection[] {
  const ui = uiText[language];
  const lines = content.trim().split(/\r?\n/);
  const sections: TextSection[] = [];
  const intro: string[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.match(structuredHeadingPattern);
    if (match) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      } else if (intro.join("").trim()) {
        sections.push({ title: ui.intro, body: intro.join("\n").trim() });
      }
      current = { title: match[1], lines: [] };
      if (match[2]?.trim()) current.lines.push(match[2].trim());
      continue;
    }

    if (current) current.lines.push(line);
    else intro.push(line);
  }

  if (current) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  else if (intro.join("").trim()) sections.push({ title: ui.body, body: intro.join("\n").trim() });

  return sections.filter((section) => section.title || section.body);
}

function buildTimelineGroups(messages: DebateMessage[], mode: SessionMode, language: UiLanguage): TimelineGroup[] {
  const ui = uiText[language];
  return messages.reduce<TimelineGroup[]>((groups, message) => {
    const key = message.type === "result" ? "result" : message.round ? `round-${message.round}` : "system";
    let group = groups.find((item) => item.key === key);
    if (!group) {
      const discussion = mode === "discussion";
      group = {
        key,
        label:
          message.type === "result"
            ? discussion
              ? ui.htmlFinalPlan
              : ui.finalConvergence
            : message.round
              ? discussion
                ? `${ui.item} ${message.round}`
                : `${ui.motion} ${message.round}`
              : discussion
                ? ui.planning
                : ui.systemEvent,
        detail:
          message.type === "result"
            ? discussion
              ? ui.generatedDocument
              : ui.lastRealAgentResult
            : discussion
              ? ui.discussionGroupDetail
              : ui.debateGroupDetail,
        messages: []
      };
      groups.push(group);
    }
    group.messages.push(message);
    return groups;
  }, []);
}

function messageStatusText(message: DebateMessage, language: UiLanguage, now = Date.now()) {
  const ui = uiText[language];
  if (message.status === "streaming") return `${ui.speaking} ${formatElapsed(message.createdAt, now)}`;
  if (message.status === "error") return message.errorTitle || ui.error;
  if (message.status === "stopped") return ui.stoppedStatus;
  return formatTime(message.completedAt || message.createdAt, language);
}

function phaseLabel(phase: string, language: UiLanguage) {
  if (!phase) return "";
  if (language === "zh") {
    return phase
      .replace("准备发言", "准备发言")
      .replace("准备正式辩论", "准备搭建辩题")
      .replace("准备讨论模式", "准备拆解事项")
      .replace("检索公开网络信息", "检索网页线索")
      .replace("HTML 最终方案已生成", "方案文档已生成")
      .replace("辩论裁决已形成", "最终裁决已生成")
      .replace("已形成结果", "结论已生成")
      .replace("已请求停止", "正在停止")
      .replace("运行失败", "运行异常")
      .replace("讨论模式运行失败", "讨论异常")
      .replace(/辩点\s*(\d+)\/(\d+)：主 agent 开题/g, "辩点 $1/$2：主理人开题")
      .replace(/辩点\s*(\d+)\/(\d+)：主 agent 裁决/g, "辩点 $1/$2：主理人裁决")
      .replace(/事项\s*(\d+)\/(\d+)：主 agent 抛题/g, "事项 $1/$2：主理人抛题")
      .replace(/事项\s*(\d+)\/(\d+)：(.+?) 发散/g, "事项 $1/$2：$3 发散方案")
      .replace(/事项\s*(\d+)\/(\d+)：(.+?) 评估/g, "事项 $1/$2：$3 评估取舍")
      .replace(/事项\s*(\d+)\/(\d+)：主 agent 拍板/g, "事项 $1/$2：主理人拍板")
      .replace(/拆分辩题/g, "拆解辩点")
      .replace(/总结裁决/g, "生成最终裁决")
      .replace(/拆分议题/g, "拆解事项")
      .replace(/汇总 HTML 文档/g, "生成方案文档");
  }

  return phase
    .replace("排队中", "Queued")
    .replace("准备发言", "Preparing turns")
    .replace("准备正式辩论", "Framing debate")
    .replace("准备讨论模式", "Breaking down discussion")
    .replace("检索公开网络信息", "Fetching web signals")
    .replace("HTML 最终方案已生成", "Plan document ready")
    .replace("辩论裁决已形成", "Final verdict ready")
    .replace("已形成结果", "Outcome ready")
    .replace("已停止", "Stopped")
    .replace("已请求停止", "Stop requested")
    .replace("运行失败", "Run error")
    .replace("讨论模式运行失败", "Discussion error")
    .replace(/第\s*(\d+)\s*回合/g, "Round $1")
    .replace(/辩点\s*(\d+)\/(\d+)：主 agent 开题/g, "Motion $1/$2: lead frames")
    .replace(/辩点\s*(\d+)\/(\d+)：正方立论/g, "Motion $1/$2: affirmative case")
    .replace(/辩点\s*(\d+)\/(\d+)：反方立论/g, "Motion $1/$2: negative case")
    .replace(/辩点\s*(\d+)\/(\d+)：正方反驳/g, "Motion $1/$2: affirmative rebuttal")
    .replace(/辩点\s*(\d+)\/(\d+)：反方反驳/g, "Motion $1/$2: negative rebuttal")
    .replace(/辩点\s*(\d+)\/(\d+)：主 agent 裁决/g, "Motion $1/$2: lead verdict")
    .replace(/事项\s*(\d+)\/(\d+)：主 agent 抛题/g, "Item $1/$2: lead opens")
    .replace(/事项\s*(\d+)\/(\d+)：(.+?) 发散/g, "Item $1/$2: $3 explores options")
    .replace(/事项\s*(\d+)\/(\d+)：(.+?) 评估/g, "Item $1/$2: $3 evaluates fit")
    .replace(/事项\s*(\d+)\/(\d+)：主 agent 拍板/g, "Item $1/$2: lead decides")
    .replace(/拆分辩题/g, "framing motions")
    .replace(/总结裁决/g, "final verdict")
    .replace(/拆分议题/g, "breaking down items")
    .replace(/汇总 HTML 文档/g, "generating plan document");
}

function absoluteUrl(path: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, window.location.origin).href;
}

function cloneAgentConfig(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    args: Array.isArray(agent.args) ? [...agent.args] : []
  };
}

function parseAgentConfigText(text: string): AgentConfig[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed as AgentConfig[];
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown }).agents)) {
    return (parsed as { agents: AgentConfig[] }).agents;
  }
  throw new Error("JSON 需要是 agent 数组，或包含 agents 数组。");
}

function validateAgentConfigs(nextAgents: AgentConfig[]) {
  const ids = nextAgents.map((agent) => String(agent.id || "").trim());
  if (ids.some((id) => !id)) throw new Error("每个 agent 都需要唯一的 ID。");
  const duplicated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicated) throw new Error(`Agent ID 不能重复：${duplicated}`);
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-button copy-btn"
      type="button"
      title={label}
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <CheckCircle2 size={14} /> : <Copy size={14} />}
    </button>
  );
}

function roundInputNumber(value: RoundInputValue) {
  if (value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampRoundInput(value: RoundInputValue, fallback: number) {
  const numeric = roundInputNumber(value) ?? fallback;
  return Math.max(1, Math.min(Math.trunc(numeric), 12));
}

function updateRoundInput(value: string, setter: (value: RoundInputValue) => void) {
  if (value === "") {
    setter("");
    return;
  }
  if (!/^\d{1,2}$/.test(value)) return;
  setter(Number(value));
}

function configSlotLabel(index: number, language: UiLanguage) {
  const zh = ["角色 1", "角色 2", "角色 3"];
  const en = ["Role 1", "Role 2", "Role 3"];
  return (language === "zh" ? zh : en)[index] || (language === "zh" ? `角色 ${index + 1}` : `Role ${index + 1}`);
}

function safeColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value || "#4f46e5" : "#4f46e5";
}

function App() {
  const [language, setLanguage] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") return "zh";
    return window.localStorage.getItem(languageStorageKey) === "en" ? "en" : "zh";
  });
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [configPath, setConfigPath] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState<DebateSession | null>(null);
  const [mode, setMode] = useState<SessionMode>("debate");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topic, setTopic] = useState(initialTopic);
  const [topicTouched, setTopicTouched] = useState(false);
  const [context, setContext] = useState(initialContext);
  const [goal, setGoal] = useState("");
  const [maxRounds, setMaxRounds] = useState<RoundInputValue>(3);
  const [minRounds, setMinRounds] = useState<RoundInputValue>(2);
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefDraft, setBriefDraft] = useState<BriefAssistDraft | null>(null);
  const [briefSource, setBriefSource] = useState<BriefSource>("");
  const [briefWarning, setBriefWarning] = useState("");
  const [briefAnswers, setBriefAnswers] = useState<Record<string, number>>({});
  const [seededDiscussionPlan, setSeededDiscussionPlan] = useState<DiscussionPlanItem[]>([]);
  const [error, setError] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [configText, setConfigText] = useState("");
  const [configDraftAgents, setConfigDraftAgents] = useState<AgentConfig[]>([]);
  const [configEditorMode, setConfigEditorMode] = useState<ConfigEditorMode>("cards");
  const [configError, setConfigError] = useState("");
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [copiedDoc, setCopiedDoc] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState("");
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});

  const participants = useMemo(() => agents.filter((agent) => (agent.kind || "participant") !== "moderator"), [agents]);
  const moderator = useMemo(() => agents.find((agent) => (agent.kind || "participant") === "moderator") || null, [agents]);
  const selectedAgents = useMemo(
    () => participants.filter((agent) => selectedIds.includes(agent.id)),
    [participants, selectedIds]
  );
  const activeMode = session?.mode || mode;
  const ui = uiText[language];
  const timelineGroups = useMemo(() => buildTimelineGroups(session?.messages || [], activeMode, language), [session?.messages, activeMode, language]);
  const hasStreamingMessage = Boolean(session?.messages.some((message) => message.status === "streaming"));
  const showBriefAssistant = topicTouched && !session && !composerCollapsed && topic.trim().length >= 10;

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language]);

  useEffect(() => {
    if (!hasStreamingMessage) return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasStreamingMessage]);

  const setMessageNode = useCallback((messageId: string, node: HTMLElement | null) => {
    messageRefs.current[messageId] = node;
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    messageRefs.current[messageId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const loadAgents = useCallback(async () => {
    const payload = await getAgents();
    setAgents(payload.agents);
    setConfigPath(payload.configPath);
    setSelectedIds((current) => {
      const available = payload.agents
        .filter((agent) => agent.enabled && (agent.kind || "participant") !== "moderator")
        .map((agent) => agent.id);
      return current.length ? current.filter((id) => available.includes(id)) : available;
    });
  }, []);

  const loadSessions = useCallback(async () => {
    const payload = await listSessions();
    setSessions(payload.sessions);
  }, []);

  useEffect(() => {
    void Promise.all([loadAgents(), loadSessions()]).catch((loadError) => setError(loadError.message));
  }, [loadAgents, loadSessions]);

  useEffect(() => {
    if (!session?.id) return undefined;
    setComposerCollapsed(true);
    eventSourceRef.current?.close();
    const source = new EventSource(sessionEventsUrl(session.id));
    eventSourceRef.current = source;

    source.addEventListener("snapshot", (event) => {
      setSession(JSON.parse((event as MessageEvent).data));
    });
    source.addEventListener("session", (event) => {
      setSession(JSON.parse((event as MessageEvent).data));
    });
    source.addEventListener("message-start", (event) => {
      const message = JSON.parse((event as MessageEvent).data) as DebateMessage;
      setSession((current) => (current ? { ...current, messages: upsertMessage(current.messages, message) } : current));
    });
    source.addEventListener("message-delta", (event) => {
      const delta = JSON.parse((event as MessageEvent).data) as { id: string; chunk: string };
      setSession((current) => (current ? { ...current, messages: appendMessageChunk(current.messages, delta.id, delta.chunk) } : current));
    });
    source.addEventListener("message-complete", (event) => {
      const message = JSON.parse((event as MessageEvent).data) as DebateMessage;
      setSession((current) => (current ? { ...current, messages: upsertMessage(current.messages, message) } : current));
    });
    source.addEventListener("result", () => {
      void loadSessions();
    });
    source.addEventListener("deleted", () => {
      setSession(null);
      setComposerCollapsed(false);
      void loadSessions();
      source.close();
    });
    source.onerror = () => {
      if (session.status === "running") setError("事件流断开，后端仍可能在运行。刷新页面可重新连接。");
    };

    return () => {
      source.close();
    };
  }, [session?.id, loadSessions]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline || !session?.messages.length) return;
    const distanceFromBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight;
    const lastMessage = session.messages[session.messages.length - 1];
    if (distanceFromBottom < 260 || lastMessage?.status === "streaming") {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
    }
  }, [session?.messages]);

  function updateTopic(value: string) {
    setTopicTouched(true);
    setTopic(value);
    setSeededDiscussionPlan([]);
    if (briefDraft && value.trim() !== briefDraft.topic.trim()) {
      setBriefDraft(null);
      setBriefSource("");
      setBriefWarning("");
      setBriefAnswers({});
    }
  }

  function selectedBriefLines(draft = briefDraft) {
    if (!draft) return [];
    return draft.questions
      .map((question) => {
        const selected = briefAnswers[question.id];
        const option = typeof selected === "number" ? question.options[selected] : null;
        return option ? `- ${question.question}：${option.label}。${option.effect}` : "";
      })
      .filter(Boolean);
  }

  function agendaLines(items: DiscussionPlanItem[]) {
    return items.map((item, index) => `${index + 1}. ${item.title}：${item.question}；敲定标准：${item.acceptance}`);
  }

  async function prepareBrief() {
    const safeMinRounds = clampRoundInput(minRounds, 1);
    const safeMaxRounds = clampRoundInput(maxRounds, Math.max(safeMinRounds, 1));
    setError("");
    setBriefWarning("");
    setBriefLoading(true);
    try {
      const payload = await assistBrief({
        mode,
        topic,
        context,
        goal,
        minRounds: Math.min(safeMinRounds, safeMaxRounds),
        maxRounds: safeMaxRounds,
        agentIds: selectedIds
      });
      setBriefDraft(payload.draft);
      setBriefSource(payload.source);
      setBriefWarning(payload.warning || "");
      setBriefAnswers({});
    } catch (briefError) {
      setError(briefError instanceof Error ? briefError.message : String(briefError));
    } finally {
      setBriefLoading(false);
    }
  }

  function applyBrief() {
    if (!briefDraft) return;
    const chosenLines = selectedBriefLines(briefDraft);
    const itemLines = agendaLines(briefDraft.items);
    const nextContext = [
      briefDraft.context,
      chosenLines.length ? `启动调查选择：\n${chosenLines.join("\n")}` : "",
      itemLines.length ? `主理人预拆事项：\n${itemLines.join("\n")}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    setMode(briefDraft.mode);
    setTopic(briefDraft.topic);
    setContext(nextContext);
    setGoal(briefDraft.goal);
    setMinRounds(briefDraft.minRounds);
    setMaxRounds(briefDraft.maxRounds);
    setSeededDiscussionPlan(briefDraft.mode === "discussion" ? briefDraft.items : []);
  }

  async function startDebate() {
    setError("");
    setBusy(true);
    try {
      const safeMinRounds = clampRoundInput(minRounds, 1);
      const safeMaxRounds = clampRoundInput(maxRounds, Math.max(safeMinRounds, 1));
      const payload = await createSession({
        mode,
        topic,
        context,
        goal,
        maxRounds: safeMaxRounds,
        minRounds: Math.min(safeMinRounds, safeMaxRounds),
        agentIds: selectedIds,
        discussionPlan: mode === "discussion" ? seededDiscussionPlan : []
      });
      setMinRounds(Math.min(safeMinRounds, safeMaxRounds));
      setMaxRounds(safeMaxRounds);
      setSession(payload.session);
      setComposerCollapsed(true);
      setSeededDiscussionPlan([]);
      await loadSessions();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setBusy(false);
    }
  }

  async function stopCurrentSession() {
    if (!session) return;
    setError("");
    try {
      const payload = await stopSession(session.id);
      setSession(payload.session);
      await loadSessions();
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : String(stopError));
    }
  }

  async function continueCurrentSession() {
    if (!session) return;
    setError("");
    try {
      const payload = await continueSession(session.id, 1);
      setSession(payload.session);
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : String(continueError));
    }
  }

  async function repairCurrentSession() {
    if (!session) return;
    setError("");
    setRepairing(true);
    try {
      const payload = await repairSession(session.id, true);
      setSession(payload.session);
      await loadSessions();
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : String(repairError));
    } finally {
      setRepairing(false);
    }
  }

  async function synthesizeCurrentSession() {
    if (!session) return;
    setError("");
    try {
      const payload = await synthesizeSession(session.id);
      setSession(payload.session);
      await loadSessions();
    } catch (synthError) {
      setError(synthError instanceof Error ? synthError.message : String(synthError));
    }
  }

  async function openSavedSession(sessionId: string) {
    setError("");
    try {
      const payload = await getSession(sessionId);
      setSession(payload.session);
      setMode(payload.session.mode || "debate");
      setTopic(payload.session.topic);
      setContext(payload.session.context);
      setGoal(payload.session.goal);
      setMinRounds(payload.session.minRounds);
      setMaxRounds(payload.session.maxRounds);
      setTopicTouched(false);
      setSeededDiscussionPlan([]);
      setComposerCollapsed(true);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
    }
  }

  async function deleteSavedSession(sessionId: string) {
    if (!window.confirm(ui.confirmDeleteSession)) return;
    setError("");
    setDeletingSessionId(sessionId);
    try {
      await deleteSession(sessionId);
      if (session?.id === sessionId) {
        eventSourceRef.current?.close();
        setSession(null);
        setComposerCollapsed(false);
      }
      await loadSessions();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingSessionId("");
    }
  }

  async function clearHistory() {
    if (!sessions.length || !window.confirm(ui.confirmClearHistory)) return;
    setError("");
    setClearingHistory(true);
    try {
      await clearSessions();
      eventSourceRef.current?.close();
      setSession(null);
      setComposerCollapsed(false);
      await loadSessions();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setClearingHistory(false);
    }
  }

  function toggleAgent(agentId: string) {
    setSelectedIds((current) => (current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]));
  }

  function openConfig() {
    setConfigError("");
    const draft = agents.map(cloneAgentConfig);
    setConfigDraftAgents(draft);
    setConfigText(JSON.stringify({ agents: draft }, null, 2));
    setConfigEditorMode("cards");
    setConfigOpen(true);
  }

  function updateConfigAgent(index: number, patch: Partial<AgentConfig>) {
    setConfigDraftAgents((current) => current.map((agent, agentIndex) => (agentIndex === index ? { ...agent, ...patch } : agent)));
  }

  function copyPreviousConfigAgent(index: number) {
    if (index < 1) return;
    setConfigDraftAgents((current) =>
      current.map((agent, agentIndex) => {
        if (agentIndex !== index) return agent;
        const previous = current[index - 1];
        if (!previous) return agent;
        return {
          ...cloneAgentConfig(previous),
          id: agent.id
        };
      })
    );
  }

  function switchConfigMode(nextMode: ConfigEditorMode) {
    setConfigError("");
    if (nextMode === "json") {
      setConfigText(JSON.stringify({ agents: configDraftAgents }, null, 2));
      setConfigEditorMode("json");
      return;
    }

    try {
      const nextAgents = parseAgentConfigText(configText).map(cloneAgentConfig);
      validateAgentConfigs(nextAgents);
      setConfigDraftAgents(nextAgents);
      setConfigEditorMode("cards");
    } catch (switchError) {
      setConfigError(switchError instanceof Error ? switchError.message : String(switchError));
    }
  }

  async function saveConfig() {
    setConfigError("");
    try {
      const nextAgents =
        configEditorMode === "json" ? parseAgentConfigText(configText).map(cloneAgentConfig) : configDraftAgents.map(cloneAgentConfig);
      validateAgentConfigs(nextAgents);
      const payload = await saveAgents(nextAgents);
      setAgents(payload.agents);
      setConfigPath(payload.configPath);
      setSelectedIds((current) => {
        const available = payload.agents
          .filter((agent) => agent.enabled && (agent.kind || "participant") !== "moderator")
          .map((agent) => agent.id);
        const kept = current.filter((id) => available.includes(id));
        return kept.length ? kept : available;
      });
      setConfigOpen(false);
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  const running = session?.status === "running" || session?.status === "queued";
  const minRoundValue = roundInputNumber(minRounds);
  const maxRoundValue = roundInputNumber(maxRounds);
  const roundsValid =
    minRoundValue !== null &&
    maxRoundValue !== null &&
    minRoundValue >= 1 &&
    maxRoundValue <= 12 &&
    minRoundValue <= maxRoundValue;
  const canStart = topic.trim() && selectedIds.length >= 3 && roundsValid && !busy;
  const canRepair = Boolean(session && session.status !== "complete" && !repairing);
  const documentReady = Boolean(session?.mode === "discussion" && session.resultHtml && session.status === "complete");
  const documentUrl = documentReady && session ? absoluteUrl(session.documentUrl || sessionDocumentUrl(session.id)) : "";
  const htmlPath = documentReady ? session?.htmlPath || "" : "";
  const storagePath = session?.storagePath || "";

  async function copyDocumentInfo(value: string, key: string) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopiedDoc(key);
    window.setTimeout(() => setCopiedDoc((current) => (current === key ? "" : current)), 1400);
  }

  return (
    <main className={`app-shell mode-${activeMode}`}>
      <aside className="left-rail">
        <div className="brand-block">
          <div className="brand-mark">
            <Workflow size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Agent Meeting Studio</h1>
            <p>{participants.length} {ui.agentCount} / {modeLabel(activeMode, language)}</p>
          </div>
          <button
            className="language-toggle"
            type="button"
            onClick={() => setLanguage((current) => (current === "zh" ? "en" : "zh"))}
            aria-label={ui.languageToggle}
          >
            <Languages size={15} />
            {ui.languageToggle}
          </button>
        </div>

        <section className="rail-section">
          <div className="section-title">
            <Bot size={16} />
            <span>{activeMode === "discussion" ? ui.collaborationAgents : ui.participantAgents}</span>
          </div>
          <div className="agent-stack">
            {participants.map((agent, index) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedIds.includes(agent.id)}
                language={language}
                roleLabel={
                  activeMode === "discussion"
                    ? [ui.mainAgent, ui.ideasAgent, ui.evaluationAgent][index]
                    : [ui.mainAgent, ui.affirmativeAgent, ui.negativeAgent][index]
                }
                onToggle={() => toggleAgent(agent.id)}
              />
            ))}
          </div>
        </section>

        <section className="rail-section moderator-card">
          <div className="section-title">
            <Sparkles size={16} />
            <span>{ui.rules}</span>
          </div>
          {moderator ? (
            <div className="moderator-row">
              <span className="agent-dot" style={{ background: moderator.color || "#2f6bff" }} />
              <div>
                <strong>{agentPosition(moderator, language)}</strong>
                <small>{moderator.mode === "command" ? ui.localCommand : ui.mock}</small>
              </div>
            </div>
          ) : (
            <p className="muted">
              {activeMode === "discussion" ? ui.discussionRule : ui.debateRule}
            </p>
          )}
        </section>

        <button className="ghost-button full" type="button" onClick={openConfig}>
          <FileJson2 size={16} />
          {ui.config}
        </button>
        <p className="config-sidebar-desc muted">{ui.configDesc}</p>
        <div className="sidebar-copy-section">
          <p className="sidebar-copy-label">{ui.configCopyPrompt}</p>
          <div className="sidebar-copy-box">
            <code className="sidebar-copy-code">{ui.configCopyText}</code>
            <CopyButton text={ui.configCopyText} label={ui.copy} />
          </div>
        </div>
      </aside>

      <section className="workbench">
        <header className="topbar">
          <div>
            <div className="eyeless-label">{activeMode === "discussion" ? ui.localDiscussionDesk : ui.localDebateDesk}</div>
            <h2>{session?.topic || ui.createTopic}</h2>
          </div>
          {session ? <StatusPill status={session.status} phase={session.phase} language={language} /> : null}
        </header>

        {session ? (
          <div className="mode-desc-banner">
            {activeMode === "debate" ? (
              <p>
                <strong>{ui.debateMode}模式</strong>
                <span>{ui.debateRule}</span>
              </p>
            ) : (
              <p>
                <strong>{ui.discussionMode}模式</strong>
                <span>{ui.discussionRule}</span>
              </p>
            )}
          </div>
        ) : null}

        {session && composerCollapsed ? (
          <div className="topic-summary-bar">
            <div>
              <span>{ui.currentTopic}</span>
              <strong>{session.topic}</strong>
              <small>{session.goal}</small>
            </div>
            <button className="quiet-button" type="button" onClick={() => setComposerCollapsed(false)}>
              <Settings size={16} />
              {ui.editTopic}
            </button>
          </div>
        ) : (
          <div className={`composer-grid ${session ? "is-compact" : ""}`}>
            <div className="mode-switch span-2" role="group" aria-label={ui.chooseMode}>
              <button className={mode === "debate" ? "active" : ""} type="button" disabled={running} onClick={() => setMode("debate")}>
                <ModeGlyph mode="debate" />
                <span className="mode-kicker">{ui.debateModeLabel}</span>
                <strong>{ui.debateMode}</strong>
                <span>{ui.debateModeHint}</span>
              </button>
              <button className={mode === "discussion" ? "active" : ""} type="button" disabled={running} onClick={() => setMode("discussion")}>
                <ModeGlyph mode="discussion" />
                <span className="mode-kicker">{ui.discussionModeLabel}</span>
                <strong>{ui.discussionMode}</strong>
                <span>{ui.discussionModeHint}</span>
              </button>
            </div>
            <label className="field span-2">
              <span>{mode === "discussion" ? ui.discussionTopic : ui.topic}</span>
              <textarea value={topic} onChange={(event) => updateTopic(event.target.value)} rows={3} />
            </label>
            {showBriefAssistant ? (
              <BriefAssistantPanel
                draft={briefDraft}
                source={briefSource}
                warning={briefWarning}
                loading={briefLoading}
                answers={briefAnswers}
                seededCount={seededDiscussionPlan.length}
                language={language}
                onPrepare={prepareBrief}
                onApply={applyBrief}
                onSelectAnswer={(questionId, optionIndex) => setBriefAnswers((current) => ({ ...current, [questionId]: optionIndex }))}
              />
            ) : null}
            <label className="field span-2">
              <span>{ui.context}</span>
              <textarea value={context} onChange={(event) => setContext(event.target.value)} rows={4} />
            </label>
            <label className="field">
              <span>{ui.goal}</span>
              <input value={goal} onChange={(event) => setGoal(event.target.value)} />
            </label>
            <div className="round-controls">
              <label className="field compact">
                <span>{mode === "discussion" ? ui.minItems : ui.minRounds}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={minRounds}
                  onChange={(event) => updateRoundInput(event.target.value, setMinRounds)}
                  onBlur={() => setMinRounds((value) => clampRoundInput(value, 1))}
                />
              </label>
              <label className="field compact">
                <span>{mode === "discussion" ? ui.maxItems : ui.maxRounds}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxRounds}
                  onChange={(event) => updateRoundInput(event.target.value, setMaxRounds)}
                  onBlur={() => setMaxRounds((value) => clampRoundInput(value, 3))}
                />
              </label>
            </div>
          </div>
        )}

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="action-row">
          <button className="primary-button" type="button" disabled={!canStart} onClick={startDebate}>
            {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
            {mode === "discussion" ? ui.startDiscussion : ui.startDebate}
          </button>
          <button className="quiet-button" type="button" disabled={!running} onClick={stopCurrentSession}>
            <Square size={16} />
            {ui.stop}
          </button>
          <button className="quiet-button" type="button" disabled={!session || running || activeMode === "discussion"} onClick={continueCurrentSession}>
            <Plus size={16} />
            {ui.continueRound}
          </button>
          <button className="quiet-button" type="button" disabled={!canRepair} onClick={repairCurrentSession}>
            {repairing ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {ui.repairRun}
          </button>
          <button className="quiet-button" type="button" disabled={!session || running} onClick={synthesizeCurrentSession}>
            <CheckCircle2 size={16} />
            {ui.synthesize}
          </button>
        </div>

        <DebateFlowBar
          session={session}
          selectedAgents={selectedAgents}
          mode={activeMode}
          language={language}
          now={clockNow}
          onSelectMessage={scrollToMessage}
        />

        <div ref={timelineRef} className="timeline">
          {timelineGroups.length ? (
            <div className="round-stack">
              {timelineGroups.map((group) => (
                <section className="round-block" key={group.key} aria-label={group.label}>
                  <div className="round-divider">
                    <div>
                      <strong>{group.label}</strong>
                      <span>{group.detail}</span>
                    </div>
                    <small>{group.messages.length} {ui.messages}</small>
                  </div>
                  {group.messages.map((message, index) => (
                    <MessageCard
                      key={message.id}
                      message={message}
                      messageRef={(node) => setMessageNode(message.id, node)}
                      turnIndex={index + 1}
                      turnTotal={group.messages.length}
                      language={language}
                      agents={session?.agents || selectedAgents}
                      now={clockNow}
                    />
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <EmptyState selectedAgents={selectedAgents} language={language} />
          )}
        </div>
      </section>

      <aside className="right-panel">
        <section className="debate-map-panel">
          <div className="section-title">
            <ListTree size={16} />
            <span>{activeMode === "discussion" ? ui.itemIndex : ui.debateIndex}</span>
          </div>
          <DiscussionIndex messages={session?.messages || []} agents={session?.agents || selectedAgents} onSelect={scrollToMessage} language={language} />
        </section>

        <section className="result-panel">
          <div className="section-title">
            <CheckCircle2 size={16} />
            <span>{ui.result}</span>
          </div>
          {session?.research?.items?.length ? (
            <div className="research-strip">
              <div className="research-strip-head">
                <strong>{ui.research}</strong>
                <span>{session.research.items.length} {ui.clues} / {session.research.query}</span>
              </div>
              <ul>
                {session.research.items.slice(0, 3).map((item) => (
                  <li key={item.url}>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {documentReady ? (
            <div className="html-document-box">
              <div className="document-toolbar">
                <div>
                  <strong>{ui.htmlPlan}</strong>
                  <small>{ui.generatedByMain}</small>
                </div>
                <a className="document-link" href={documentUrl} target="_blank" rel="noreferrer">
                  <FileText size={15} />
                  {ui.openDocument}
                </a>
              </div>
              <div className="document-paths">
                <PathRow
                  label={ui.documentUrl}
                  value={documentUrl}
                  copied={copiedDoc === "documentUrl"}
                  copyLabel={ui.copy}
                  copiedLabel={ui.copied}
                  onCopy={() => void copyDocumentInfo(documentUrl, "documentUrl")}
                />
                <PathRow
                  label={ui.htmlPath}
                  value={htmlPath || ui.noHtmlPath}
                  copied={copiedDoc === "htmlPath"}
                  copyLabel={ui.copy}
                  copiedLabel={ui.copied}
                  onCopy={() => void copyDocumentInfo(htmlPath, "htmlPath")}
                  disabled={!htmlPath}
                />
                <PathRow
                  label={ui.storagePath}
                  value={storagePath}
                  copied={copiedDoc === "storagePath"}
                  copyLabel={ui.copy}
                  copiedLabel={ui.copied}
                  onCopy={() => void copyDocumentInfo(storagePath, "storagePath")}
                  disabled={!storagePath}
                />
              </div>
              <iframe className="document-frame" title={ui.htmlPlan} src={documentUrl} sandbox="" />
            </div>
          ) : null}
          {session?.result ? <div className="result-body"><StructuredText content={session.result} compact language={language} /></div> : <p className="muted">{ui.resultEmpty}</p>}
        </section>

        <section className="history-panel">
          <div className="section-title">
            <History size={16} />
            <span>{ui.recentSessions}</span>
            <div className="history-actions">
              <button className="icon-button" type="button" onClick={() => void loadSessions()} aria-label={ui.refreshSessions} title={ui.refreshSessions}>
                <RefreshCw size={15} />
              </button>
              <button
                className="clear-history-button"
                type="button"
                onClick={() => void clearHistory()}
                disabled={!sessions.length || clearingHistory}
                aria-label={ui.clearHistory}
                title={ui.clearHistory}
              >
                <Trash2 size={14} />
                <span>{ui.clearHistory}</span>
              </button>
            </div>
          </div>
          <div className="session-list">
            {sessions.length ? (
              sessions.slice(0, 8).map((item) => (
                <div className="session-row" key={item.id}>
                  <button className="session-open" type="button" onClick={() => void openSavedSession(item.id)}>
                    <div>
                      <strong>{item.topic}</strong>
                      <small>
                        {modeLabel(item.mode, language)} / {statusLabel(item.status, language)} / {item.currentRound || 0}-{item.maxRounds} / {formatTime(item.updatedAt, language)}
                      </small>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    className="session-delete"
                    type="button"
                    onClick={() => void deleteSavedSession(item.id)}
                    disabled={clearingHistory || deletingSessionId === item.id}
                    aria-label={`${ui.deleteSession}: ${item.topic}`}
                    title={ui.deleteSession}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="history-empty">{ui.historyEmpty}</p>
            )}
          </div>
        </section>
      </aside>

      {configOpen ? (
        <div className="modal-backdrop">
          <section className="config-modal">
            <header>
              <div>
                <h3>{ui.config}</h3>
                <p>{configPath}</p>
                <small>{ui.configHint}</small>
              </div>
              <button className="icon-button" type="button" onClick={() => setConfigOpen(false)} aria-label={ui.closeConfig}>
                <Pause size={16} />
              </button>
            </header>
            <div className="config-mode-switch" role="group" aria-label={ui.config}>
              <button className={configEditorMode === "cards" ? "active" : ""} type="button" onClick={() => switchConfigMode("cards")}>
                <Settings size={14} />
                {ui.configCardEditor}
              </button>
              <button className={configEditorMode === "json" ? "active" : ""} type="button" onClick={() => switchConfigMode("json")}>
                <FileJson2 size={14} />
                {ui.configJsonEditor}
              </button>
            </div>
            {configEditorMode === "cards" ? (
              <div className="config-agent-grid">
                {configDraftAgents.map((agent, index) => (
                  <ConfigAgentCard
                    key={agent.id || index}
                    agent={agent}
                    index={index}
                    language={language}
                    onChange={(patch) => updateConfigAgent(index, patch)}
                    onCopyPrevious={index > 0 ? () => copyPreviousConfigAgent(index) : undefined}
                  />
                ))}
              </div>
            ) : (
              <textarea className="config-json-textarea" value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
            )}
            {configError ? <div className="error-banner">{configError}</div> : null}
            <footer>
              <button className="quiet-button" type="button" onClick={() => setConfigOpen(false)}>
                {ui.cancel}
              </button>
              <button className="primary-button" type="button" onClick={saveConfig}>
                <Settings size={16} />
                {ui.save}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function BriefAssistantPanel({
  draft,
  source,
  warning,
  loading,
  answers,
  seededCount,
  language,
  onPrepare,
  onApply,
  onSelectAnswer
}: {
  draft: BriefAssistDraft | null;
  source: BriefSource;
  warning: string;
  loading: boolean;
  answers: Record<string, number>;
  seededCount: number;
  language: UiLanguage;
  onPrepare: () => void;
  onApply: () => void;
  onSelectAnswer: (questionId: string, optionIndex: number) => void;
}) {
  const ui = uiText[language];
  return (
    <section className="brief-assistant span-2">
      <div className="brief-assistant-head">
        <div>
          <span className="eyeless-label">{ui.briefAssistant}</span>
          <p>{ui.briefAssistantHint}</p>
        </div>
        <button className="quiet-button" type="button" disabled={loading} onClick={onPrepare}>
          {loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {loading ? ui.preparingBrief : ui.prepareBrief}
        </button>
      </div>

      {draft ? (
        <div className="brief-draft">
          <div className="brief-meta-row">
            <span>{source === "agent" ? ui.briefSourceAgent : ui.briefSourceFallback}</span>
            <span>
              {ui.briefMode}: {draft.mode === "discussion" ? ui.discussionMode : ui.debateMode}
            </span>
            {seededCount ? <span>{`${ui.seededAgenda} ${seededCount}`}</span> : null}
          </div>
          {warning ? <div className="brief-warning">{warning}</div> : null}
          <p className="brief-summary">{draft.summary}</p>

          {draft.questions.length ? (
            <div className="brief-block">
              <strong>{ui.briefQuestions}</strong>
              <div className="brief-question-grid">
                {draft.questions.map((question) => (
                  <div className="brief-question" key={question.id}>
                    <span>{question.question}</span>
                    <div>
                      {question.options.map((option, index) => (
                        <button
                          className={answers[question.id] === index ? "selected" : ""}
                          key={`${question.id}-${option.label}`}
                          type="button"
                          onClick={() => onSelectAnswer(question.id, index)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draft.items.length ? (
            <div className="brief-block">
              <strong>{ui.briefAgenda}</strong>
              <div className="brief-agenda">
                {draft.items.slice(0, 12).map((item, index) => (
                  <div key={`${item.title}-${index}`}>
                    <b>{index + 1}</b>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button className="primary-button brief-apply" type="button" onClick={onApply}>
            <CheckCircle2 size={16} />
            {ui.applyBrief}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AgentCard({
  agent,
  selected,
  language,
  roleLabel,
  onToggle
}: {
  agent: AgentConfig;
  selected: boolean;
  language: UiLanguage;
  roleLabel?: string;
  onToggle: () => void;
}) {
  return (
    <button className={`agent-card ${selected ? "selected" : ""}`} type="button" onClick={onToggle}>
      <span className="agent-dot" style={{ background: agent.color || "#4f46e5" }} />
      <span className="agent-copy">
        <strong>{agentPosition(agent, language)}</strong>
        <small>{roleLabel || agentDetail(agent, language)}</small>
      </span>
      {selected ? <CheckCircle2 size={17} /> : <Circle size={16} />}
    </button>
  );
}

function ConfigAgentCard({
  agent,
  index,
  language,
  onChange,
  onCopyPrevious
}: {
  agent: AgentConfig;
  index: number;
  language: UiLanguage;
  onChange: (patch: Partial<AgentConfig>) => void;
  onCopyPrevious?: () => void;
}) {
  const ui = uiText[language];
  const mode = agent.mode || "mock";
  const isCommand = mode === "command";
  const isModel = mode === "openai-compatible" || mode === "local-model";
  const argsText = (agent.args || []).join("\n");

  return (
    <section className="config-agent-card">
      <header className="config-agent-card-head">
        <div className="config-agent-identity">
          <span className="agent-dot" style={{ background: agent.color || "#4f46e5" }} />
          <div>
            <strong>{configSlotLabel(index, language)}</strong>
            <small>{agentPosition(agent, language)}</small>
          </div>
        </div>
        <div className="config-agent-actions">
          {onCopyPrevious ? (
            <button className="quiet-button compact" type="button" title={ui.copyPreviousTitle} onClick={onCopyPrevious}>
              <Copy size={14} />
              {ui.copyPreviousConfig}
            </button>
          ) : null}
          <label className="config-check">
            <input type="checkbox" checked={agent.enabled !== false} onChange={(event) => onChange({ enabled: event.target.checked })} />
            <span>{ui.enabled}</span>
          </label>
        </div>
      </header>

      <div className="config-card-section">
        <strong>{ui.basicSettings}</strong>
        <div className="config-fields">
          <label className="config-field">
            <span>{ui.agentId}</span>
            <input value={agent.id || ""} onChange={(event) => onChange({ id: event.target.value.trim() })} />
          </label>
          <label className="config-field">
            <span>{ui.agentName}</span>
            <input value={agent.name || ""} onChange={(event) => onChange({ name: event.target.value })} />
          </label>
          <label className="config-field">
            <span>{ui.positionTitle}</span>
            <input value={agent.title || ""} onChange={(event) => onChange({ title: event.target.value })} />
          </label>
          <label className="config-field">
            <span>{ui.agentKind}</span>
            <select value={agent.kind || "participant"} onChange={(event) => onChange({ kind: event.target.value })}>
              <option value="participant">{ui.participantKind}</option>
              <option value="moderator">{ui.moderatorKind}</option>
            </select>
          </label>
          <label className="config-field">
            <span>{ui.modeField}</span>
            <select value={mode} onChange={(event) => onChange({ mode: event.target.value })}>
              <option value="openai-compatible">openai-compatible</option>
              <option value="local-model">local-model</option>
              <option value="command">command</option>
              <option value="mock">mock</option>
            </select>
          </label>
          <label className="config-field">
            <span>{ui.colorField}</span>
            <input className="config-color-input" type="color" value={safeColor(agent.color)} onChange={(event) => onChange({ color: event.target.value })} />
          </label>
          <label className="config-field span-2">
            <span>{ui.stanceField}</span>
            <textarea value={agent.stance || ""} rows={3} onChange={(event) => onChange({ stance: event.target.value })} />
          </label>
          <label className="config-field">
            <span>{ui.styleField}</span>
            <textarea value={agent.style || ""} rows={2} onChange={(event) => onChange({ style: event.target.value })} />
          </label>
          <label className="config-field">
            <span>{ui.missionField}</span>
            <textarea value={agent.mission || ""} rows={2} onChange={(event) => onChange({ mission: event.target.value })} />
          </label>
        </div>
      </div>

      {isCommand ? (
        <div className="config-card-section">
          <strong>{ui.runtimeSettings}</strong>
          <div className="config-fields">
            <label className="config-field span-2">
              <span>{ui.commandField}</span>
              <input value={agent.command || ""} onChange={(event) => onChange({ command: event.target.value })} />
            </label>
            <label className="config-field span-2">
              <span>{ui.argsField}</span>
              <textarea
                value={argsText}
                rows={6}
                onChange={(event) =>
                  onChange({
                    args: event.target.value
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean)
                  })
                }
              />
              <small>{ui.argsHint}</small>
            </label>
            <label className="config-field">
              <span>{ui.cwdField}</span>
              <input value={agent.cwd || ""} onChange={(event) => onChange({ cwd: event.target.value })} />
            </label>
            <label className="config-field">
              <span>{ui.timeoutMsField}</span>
              <input type="number" min={1000} value={agent.timeoutMs ?? ""} onChange={(event) => onChange({ timeoutMs: numberOrUndefined(event.target.value) })} />
            </label>
            <label className="config-field">
              <span>{ui.stdoutModeField}</span>
              <select value={agent.stdoutMode || "stream"} onChange={(event) => onChange({ stdoutMode: event.target.value })}>
                <option value="stream">{ui.streamStdout}</option>
                <option value="ignore">{ui.ignoreStdout}</option>
              </select>
            </label>
            <div className="config-toggle-row">
              <label className="config-check">
                <input type="checkbox" checked={Boolean(agent.outputFile)} onChange={(event) => onChange({ outputFile: event.target.checked })} />
                <span>{ui.outputFileField}</span>
              </label>
              <label className="config-check">
                <input type="checkbox" checked={Boolean(agent.shell)} onChange={(event) => onChange({ shell: event.target.checked })} />
                <span>{ui.shellField}</span>
              </label>
            </div>
            <label className="config-field span-2">
              <span>{ui.stdinField}</span>
              <textarea value={agent.stdin || ""} rows={3} onChange={(event) => onChange({ stdin: event.target.value })} />
            </label>
          </div>
        </div>
      ) : null}

      {isModel ? (
        <div className="config-card-section">
          <strong>{ui.runtimeSettings}</strong>
          <div className="config-fields">
            <label className="config-field span-2">
              <span>{ui.baseUrlField}</span>
              <input value={agent.baseUrl || ""} onChange={(event) => onChange({ baseUrl: event.target.value })} />
            </label>
            <label className="config-field">
              <span>{ui.modelField}</span>
              <input value={agent.model || ""} onChange={(event) => onChange({ model: event.target.value })} />
            </label>
            <label className="config-field">
              <span>{ui.apiKeyEnvField}</span>
              <input value={agent.apiKeyEnv || ""} onChange={(event) => onChange({ apiKeyEnv: event.target.value })} />
            </label>
            <label className="config-field">
              <span>{ui.temperatureField}</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={agent.temperature ?? ""}
                onChange={(event) => onChange({ temperature: numberOrUndefined(event.target.value) })}
              />
            </label>
            <label className="config-field">
              <span>{ui.maxTokensField}</span>
              <input type="number" min={1} value={agent.maxTokens ?? ""} onChange={(event) => onChange({ maxTokens: numberOrUndefined(event.target.value) })} />
            </label>
            <label className="config-field">
              <span>{ui.timeoutMsField}</span>
              <input type="number" min={1000} value={agent.timeoutMs ?? ""} onChange={(event) => onChange({ timeoutMs: numberOrUndefined(event.target.value) })} />
            </label>
          </div>
        </div>
      ) : null}

      {!isCommand && !isModel ? (
        <div className="config-card-section">
          <strong>{ui.advancedSettings}</strong>
          <div className="config-fields">
            <label className="config-field">
              <span>{ui.timeoutMsField}</span>
              <input type="number" min={1000} value={agent.timeoutMs ?? ""} onChange={(event) => onChange({ timeoutMs: numberOrUndefined(event.target.value) })} />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ status, phase, language }: { status: SessionStatus; phase: string; language: UiLanguage }) {
  return (
    <div className={`status-pill ${statusTone(status)}`}>
      {status === "running" || status === "queued" ? <Loader2 className="spin" size={15} /> : <span />}
      <strong>{statusLabel(status, language)}</strong>
      <small>{phaseLabel(phase, language)}</small>
    </div>
  );
}

function ModeGlyph({ mode }: { mode: SessionMode }) {
  return (
    <svg className={`mode-glyph ${mode}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {mode === "debate" ? (
        <>
          <path d="M8 10l16 12" />
          <path d="M24 10L8 22" />
          <path d="M11 7l-4 5" />
          <path d="M21 7l4 5" />
          <circle cx="16" cy="16" r="2.8" />
        </>
      ) : (
        <>
          <path d="M8 10c5 0 5.5 6 8 6s3-6 8-6" />
          <path d="M8 22c5 0 5.5-6 8-6s3 6 8 6" />
          <circle cx="8" cy="10" r="2.4" />
          <circle cx="8" cy="22" r="2.4" />
          <circle cx="16" cy="16" r="2.4" />
          <circle cx="24" cy="10" r="2.4" />
          <circle cx="24" cy="22" r="2.4" />
        </>
      )}
    </svg>
  );
}

function DebateFlowBar({
  session,
  selectedAgents,
  mode,
  language,
  now,
  onSelectMessage
}: {
  session: DebateSession | null;
  selectedAgents: AgentConfig[];
  mode: SessionMode;
  language: UiLanguage;
  now: number;
  onSelectMessage: (messageId: string) => void;
}) {
  const ui = uiText[language];
  const agents = (session?.agents.filter((agent) => (agent.kind || "participant") !== "moderator") || selectedAgents).slice(0, 3);
  const currentMessage = session?.messages.find((message) => message.status === "streaming");
  const counts = new Map<string, number>();
  const latestByAgent = new Map<string, DebateMessage>();
  for (const message of session?.messages || []) {
    if (message.type === "agent") {
      counts.set(message.agentId, (counts.get(message.agentId) || 0) + 1);
      latestByAgent.set(message.agentId, message);
    }
  }

  return (
    <div className="debate-flow-bar" aria-label={ui.turnOrder}>
      <div className="flow-summary">
        <MessageSquareText size={16} />
        <div>
          <strong>{mode === "discussion" ? ui.collaborationFlow : ui.debateFlow}</strong>
          <span>
            {session
              ? mode === "discussion"
                ? `${ui.item} ${session.currentRound || 0} / ${session.maxRounds}`
                : `${ui.motion} ${session.currentRound || 0} / ${session.maxRounds}`
              : mode === "discussion"
                ? ui.discussionFlowHint
                : ui.serialHint}
          </span>
        </div>
      </div>
      <div className="flow-agents">
        {agents.map((agent, index) => {
          const active = currentMessage?.agentId === agent.id;
          const activeElapsed = active && currentMessage ? formatElapsed(currentMessage.createdAt, now) : "";
          const latestMessage = latestByAgent.get(agent.id);
          const roleLabel =
            mode === "discussion"
              ? [ui.mainAgent, ui.ideasAgent, ui.evaluationAgent][index]
              : [ui.mainAgent, ui.affirmativeAgent, ui.negativeAgent][index];
          return (
            <button
              className={`flow-agent ${active ? "active" : ""}`}
              key={agent.id}
              type="button"
              disabled={!latestMessage}
              onClick={() => latestMessage && onSelectMessage(latestMessage.id)}
            >
              <span className="flow-order">{roleLabel}</span>
              <i style={{ background: agent.color || "#4f46e5" }} />
              <small className={active ? "flow-timer" : ""}>
                {active ? `${ui.speaking} ${activeElapsed}` : `${counts.get(agent.id) || 0} ${language === "zh" ? ui.times : ui.messages}`}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiscussionIndex({
  messages,
  agents,
  onSelect,
  language
}: {
  messages: DebateMessage[];
  agents: AgentConfig[];
  onSelect: (messageId: string) => void;
  language: UiLanguage;
}) {
  const ui = uiText[language];
  const items = messages.filter((message) => message.type !== "system");

  if (!items.length) {
    return <p className="muted">{ui.indexEmpty}</p>;
  }

  return (
    <div className="turn-list">
      {items.map((message) => (
        <button className={`turn-index-button ${message.status}`} key={message.id} type="button" onClick={() => onSelect(message.id)}>
          <span className="agent-dot" style={{ background: message.agentColor || "#101828" }} />
          <span>
            <strong>{messageSpeaker(message, language, agents)}</strong>
            <small>
              {message.type === "result"
                ? ui.finalOutput
                : language === "zh"
                  ? `${ui.round} ${message.round || "-"} ${ui.roundSuffix} / ${messageStatusText(message, language)}`
                  : `${ui.round} ${message.round || "-"} / ${messageStatusText(message, language)}`}
            </small>
          </span>
          {message.status === "streaming" ? <Loader2 className="spin" size={14} /> : <ChevronRight size={14} />}
        </button>
      ))}
    </div>
  );
}

function MessageCard({
  message,
  messageRef,
  turnIndex,
  turnTotal,
  language,
  agents,
  now
}: {
  message: DebateMessage;
  messageRef: (node: HTMLElement | null) => void;
  turnIndex: number;
  turnTotal: number;
  language: UiLanguage;
  agents: AgentConfig[];
  now: number;
}) {
  const ui = uiText[language];
  const streaming = message.status === "streaming";
  const errored = message.status === "error";
  const speakerName = messageSpeaker(message, language, agents);
  const speakerTitle = displayText(message.agentTitle, language);
  const metaLabel =
    message.type === "result"
      ? ui.finalResult
      : message.type === "system"
        ? ui.systemEvent
        : language === "zh"
          ? `${ui.round} ${message.round || "-"} ${ui.roundSuffix} · ${ui.turn} ${turnIndex}/${turnTotal} ${ui.turnSuffix}`
          : `${ui.round} ${message.round || "-"} · ${ui.turn} ${turnIndex}/${turnTotal}`;

  return (
    <article ref={messageRef} className={`message-card ${message.type}`} style={{ borderLeftColor: message.agentColor || "#101828" }}>
      <header>
        <div className="speaker">
          <span className="agent-dot" style={{ background: message.agentColor || "#101828" }} />
          <div>
            <strong>{speakerName}</strong>
            <small>{metaLabel}</small>
          </div>
          {speakerTitle && speakerTitle !== speakerName ? <span className="speaker-title">{speakerTitle}</span> : null}
        </div>
        <div className="message-state">
          {streaming ? <Loader2 className="spin" size={15} /> : errored ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          <span>{messageStatusText(message, language, now)}</span>
        </div>
      </header>
      <div className="message-body">
        <StructuredText content={message.content} language={language} />
      </div>
      {message.error ? (
        <div className="message-error">
          <strong>{message.errorTitle || ui.agentError}</strong>
          {message.errorHint ? <span>{ui.errorHint}: {message.errorHint}</span> : null}
          <code>{message.error}</code>
        </div>
      ) : null}
    </article>
  );
}

function StructuredText({ content, compact = false, language }: { content: string; compact?: boolean; language: UiLanguage }) {
  const clean = content.trim();
  const sections = clean ? splitStructuredText(clean, language) : [];
  if (!clean) return <div className={`structured-text plain ${compact ? "compact" : ""}`}>...</div>;

  if (sections.length < 2) {
    return <div className={`structured-text plain ${compact ? "compact" : ""}`}>{clean}</div>;
  }

  return (
    <div className={`structured-text sectioned ${compact ? "compact" : ""}`}>
      {sections.map((section, index) => (
        <section
          className={`structured-section ${section.title.includes("终局") || section.title.includes("结论") ? "final" : ""}`}
          key={`${section.title}-${index}`}
        >
          <div className="structured-label">{section.title}</div>
          <div className="structured-content">{section.body || "..."}</div>
        </section>
      ))}
    </div>
  );
}

function EmptyState({ selectedAgents, language }: { selectedAgents: AgentConfig[]; language: UiLanguage }) {
  const ui = uiText[language];
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FlaskConical size={28} />
      </div>
      <h3>{ui.waiting}</h3>
      <div className="selected-preview">
        {selectedAgents.map((agent) => (
          <span key={agent.id}>
            <i style={{ background: agent.color || "#4f46e5" }} />
            {agentPosition(agent, language)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PathRow({
  label,
  value,
  copied,
  copyLabel,
  copiedLabel,
  disabled = false,
  onCopy
}: {
  label: string;
  value: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  disabled?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className={`path-row ${disabled ? "disabled" : ""}`}>
      <span>{label}</span>
      <code>{value}</code>
      <button className="path-copy" type="button" disabled={disabled} onClick={onCopy} aria-label={`${copyLabel} ${label}`}>
        <Copy size={13} />
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}

export default App;
