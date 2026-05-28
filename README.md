# Agent Meeting Studio 🏛️

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Bilingual](https://img.shields.io/badge/lang-中文_|_English-ff69b4.svg)

> 🎯 **让多个 AI Agent 像法庭辩论一样交锋，像头脑风暴一样碰撞。本地运行，数据不出你的机器。**
>
> 🎯 **Run structured AI agent debates & brainstorms on your own machine. No cloud, no API keys — your data stays local.**

![screenshot](docs/screenshot.png)

> The UI defaults to Chinese. Click **English** in the top-right to switch. 主界面默认中文，右上角可切换 English。

---

## 📖 这是什么？ / What is this?

**中文：** 你有一个想法、一个技术方案、一个商业决策——一个人思考容易有盲区。Agent Meeting Studio 让你拉起三个真实的 AI Agent（CLI 工具或本地模型），为你的议题进行结构化辩论或头脑风暴讨论。

**English:** You have an idea, a technical decision, or a business strategy — thinking alone leaves blind spots. Agent Meeting Studio lets you fire up three real AI agents (CLI tools or local models) to debate or brainstorm your topic in a structured format.

- 🏠 **完全本地 / Fully Local** — 不传云端，数据只在你机器上
- 🤖 **自带 Agent / BYO-Agent** — 支持 Hermes / Codex / Cursor / Claude Code / Ollama / vLLM / LM Studio
- 📜 **全程可复盘 / Full Replay** — 每场保存 JSON + HTML，随时回看
- 🌐 **中英双语 / Bilingual** — 默认中文，一键切换 English

---

## 🎬 两种模式 / Two Modes

### ⚖️ 辩论模式 / Debate Mode

> 找三个 Agent，一个当裁判，两个当正反方辩手。像真实辩论赛一样推进。

| 角色 / Role | 职责 / Responsibility |
|-------------|----------------------|
| **主 Agent / Moderator** | 拆解议题 → 设定正反方 → 逐点裁决 → 最终判决 |
| **正方 / Pro** | 只能为正方立场做最强辩护 |
| **反方 / Con** | 只能为反方立场做最强辩护 |

每轮流程：开题 → 正方立论 → 反方立论 → 正方反驳 → 反方反驳 → 裁决

Flow: Moderator opens → Pro argues → Con argues → Pro rebuts → Con rebuts → Ruling

### 💡 讨论模式 / Discussion Mode

> 找三个 Agent，一个拆题主持，一个发散思路，一个评估风险。像产品 workshop 一样协作。

| 角色 / Role | 职责 / Responsibility |
|-------------|----------------------|
| **主 Agent / Moderator** | 拆解议题 → 逐项推进 → 拍板 → 输出 HTML 方案 |
| **思路 Agent / Ideator** | 针对当前事项提供多种不同方案 |
| **评估 Agent / Evaluator** | 分析利弊、风险和与主题的契合度 |

最终输出可直接打开的 HTML 方案文档。Final output is a standalone HTML document.

---

## 🚀 快速开始 / Quick Start

```bash
git clone https://github.com/ding7015869-alt/agent-meeting-studio.git
cd agent-meeting-studio
npm install
cp agents.config.example.json agents.config.json
npm start          # starts server + opens browser
```

> ⚡ **最快配置：把下面这段话发给你的 AI 助手，它会把自己接入进去。**
>
> ⚡ **Quick setup: send this to your AI — it will wire itself in.**
>
> ```
> 你现在正在和我对话——所以你就是我要接入的 AI。请把自己配进 agents.config.json。
> 优先级：① 有 API 端点就用 openai-compatible（填 baseUrl / model / apiKeyEnv）
> → ② 没有 API 用 command 模式（你自己的 CLI 命令，args 用 {{prompt}}）
> → ③ 都不可用就停下来问我。
> 3 个角色：主理人 / 思路位 / 评估位，共用一套后端，stance 和 mission 各不同。
> 不要建议本地模型（Ollama / vLLM）。
> ```

分步 / Step-by-step:

```bash
npm run server     # backend only (port 8787)
npm run open       # opens http://127.0.0.1:8787
npm run dev        # dev mode (Vite HMR 5177 + backend 8787)
```

---

## 🔌 接入 Agent / Connect Your Agents

编辑 `agents.config.json`（私有文件，已 `.gitignore`）。

Edit `agents.config.json` (private, `.gitignore` excluded — never commit it).

### 方式一 / Option 1: OpenAI 兼容的本地模型

Ollama / LM Studio / vLLM / llama.cpp server 都支持：

```json
{
  "id": "local-main",
  "name": "本地主理人",
  "title": "拆题 / 结构 / 拍板",
  "mode": "openai-compatible",
  "enabled": true,
  "color": "#0f9f8f",
  "stance": "把问题拆清楚，建立判断标准，做最终选择。",
  "mission": "辩论模式：拆题、正反方设定、裁决。讨论模式：拆题、拍板、生成方案。",
  "baseUrl": "http://127.0.0.1:11434/v1",
  "model": "qwen2.5:7b",
  "apiKeyEnv": "",
  "temperature": 0.4,
  "maxTokens": 4096,
  "timeoutMs": 180000
}
```

需要 API Key 时用环境变量：`"apiKeyEnv": "LOCAL_MODEL_API_KEY"` → `export LOCAL_MODEL_API_KEY="..."`

### 方式二 / Option 2: CLI Agent

接入 Hermes / Codex / Cursor / Claude Code：

```json
{
  "id": "hermes-strategist",
  "name": "Hermes 策略师",
  "mode": "command",
  "enabled": true,
  "stance": "从战略、路径和资源取舍角度参与辩论。",
  "mission": "回应上一位真实回答，推进主题。",
  "command": "hermes",
  "args": ["-z", "{{prompt}}", "--provider", "deepseek", "--model", "deepseek-v4-pro", "--ignore-rules"],
  "timeoutMs": 180000
}
```

Codex (`--output-last-message`):

```json
{ "command": "codex", "args": ["exec", "--output-last-message", "{{outputFile}}", "{{prompt}}"], "stdoutMode": "ignore", "outputFile": true }
```

模板变量 / Template vars: `{{prompt}}` `{{topic}}` `{{context}}` `{{goal}}` `{{round}}` `{{outputFile}}`

---

## 🆚 对比 / Comparison

| | Agent Meeting Studio | ChatGPT Group Chat | Human Meetings |
|---|---|---|---|
| Data Privacy | ✅ Fully local | ❌ Cloud | ⚠️ Human leak risk |
| Agent Choice | ✅ Any CLI/model | ❌ OpenAI only | — |
| Reproducibility | ✅ Full JSON replay | ❌ Lost chats | ❌ Notes only |
| Structure | ✅ Debate + Discussion | ❌ Free-form | ⚠️ Mod-dependent |
| Cost | 💰 Your own models | 💰💰💰 Per token | 💰💰 Time cost |

---

## 📸 案例 / Case Study

![Case Study](docs/case-study.jpg)

*三个 CLI Agent（架构派 / 反方派 / 收敛派）围绕技术方案进行多轮辩论 — Three CLI agents (Architect / Devil's Advocate / Converger) in a multi-round technical debate*

---

## 🛠 技术栈 / Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Backend | Express + Node.js |
| Agent Comms | Subprocess CLI / OpenAI-compatible HTTP |
| Storage | Local JSON files |

---

## 📄 License

MIT — 自由使用、修改、分发。Free to use, modify, and distribute.

---

## 🌟 Star History

如果觉得有用，点个 ⭐ 吧～ / If you find this useful, drop a ⭐!

[![Star History Chart](https://api.star-history.com/svg?repos=ding7015869-alt/agent-meeting-studio&type=date)](https://star-history.com/#ding7015869-alt/agent-meeting-studio&Date)
