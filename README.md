# Agent Meeting Studio 🏛️

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
![Bilingual](https://img.shields.io/badge/lang-中文_|_English-ff69b4.svg)

> 🎯 **让多个 AI Agent 像法庭辩论一样交锋，像头脑风暴一样碰撞。本地运行，数据不出你的机器。**

![screenshot](docs/screenshot.png)

---

## 📖 这是什么？

你有一个想法、一个技术方案、一个商业决策——一个人思考容易有盲区。**Agent Meeting Studio** 让你拉起三个真实的 AI Agent（CLI 工具或本地模型），为你的议题进行结构化辩论或头脑风暴讨论。

- 🏠 **完全本地** — 不要 API key，不传云端，数据只在你机器上
- 🤖 **接入你自己的 Agent** — 支持 Hermes / Codex / Cursor / Claude Code 等 CLI，或 Ollama / vLLM / LM Studio 本地模型
- 📜 **全程可复盘** — 每场会议保存为 JSON + HTML，随时回看
- 🌐 **中英双语** — 默认中文，一键切换 English

---

## 🎬 两种模式

### ⚖️ 辩论模式 (Debate)

> 找三个 Agent，一个当裁判，两个当正反方辩手。像真实辩论赛一样推进。

| 角色 | 职责 |
|------|------|
| **主 Agent** | 拆解议题 → 设定正反方立场 → 逐点裁决 → 最终判决 |
| **正方** | 只能为正方立场做最强辩护 |
| **反方** | 只能为反方立场做最强辩护 |

每轮流程：开题 → 正方立论 → 反方立论 → 正方反驳 → 反方反驳 → 裁决

### 💡 讨论模式 (Discussion)

> 找三个 Agent，一个拆题主持，一个发散思路，一个评估风险。像产品 workshop 一样协作。

| 角色 | 职责 |
|------|------|
| **主 Agent** | 拆解议题 → 逐项推进 → 拍板决策 → 输出 HTML 方案 |
| **思路 Agent** | 针对当前事项提供多种不同方案 |
| **评估 Agent** | 分析利弊、风险和与主题的契合度 |

最终输出可直接打开的 HTML 方案文档。

---

## 🚀 快速开始

```bash
git clone https://github.com/ding7015869-alt/agent-meeting-studio.git
cd agent-meeting-studio
npm install
cp agents.config.example.json agents.config.json
npm start          # 启动服务 + 自动打开浏览器
```

> ⚡ **最快配置：把下面这段话发给你的 AI 助手，它会把自己接入进去。**
>
> ```
> 你现在正在和我对话——所以你就是我要接入的 AI。请把自己配进 agents.config.json。
> 优先级：① 有 API 端点就用 openai-compatible（填 baseUrl / model / apiKeyEnv）
> → ② 没有 API 用 command 模式（填你自己的 CLI 命令，args 用 {{prompt}}）
> → ③ 都不可用就停下来问我。
> 3 个角色：主理人 / 思路位 / 评估位，共用一套后端，stance 和 mission 各不同。
> 不要建议本地模型（Ollama / vLLM）。
> ```

分步运行：

```bash
npm run server     # 仅后端（端口 8787）
npm run open       # 打开浏览器 http://127.0.0.1:8787
npm run dev        # 开发模式（前端热更新 5177 + 后端 8787）
```

---

## 🔌 接入 Agent

编辑 `agents.config.json`（私有文件，已 `.gitignore` 排除）。

### 方式一：OpenAI 兼容的本地模型

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

需要 API Key 时，用环境变量引用（不要硬编码）：

```json
{ "apiKeyEnv": "LOCAL_MODEL_API_KEY" }
```

```bash
export LOCAL_MODEL_API_KEY="你的key"
```

### 方式二：CLI Agent

接入 Hermes / Codex / Cursor / Claude Code 等命令行 Agent：

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

Codex 等需要写文件的 CLI：

```json
{
  "command": "codex",
  "args": ["exec", "--output-last-message", "{{outputFile}}", "{{prompt}}"],
  "stdoutMode": "ignore",
  "outputFile": true
}
```

模板变量：`{{prompt}}` `{{topic}}` `{{context}}` `{{goal}}` `{{round}}` `{{outputFile}}`

---

## 🆚 为什么不用别的？

| | Agent Meeting Studio | ChatGPT 群聊 | 人工会议 |
|---|---|---|---|
| 数据隐私 | ✅ 完全本地 | ❌ 上云 | ⚠️ 人为泄露 |
| Agent 选择 | ✅ 任意 CLI/模型 | ❌ 只能用 OpenAI | — |
| 可复现性 | ✅ JSON 完整回放 | ❌ 对话丢失 | ❌ 靠笔记 |
| 结构化流程 | ✅ 辩论/讨论双模式 | ❌ 自由发挥 | ⚠️ 靠主持能力 |
| 成本 | 💰 用你自己的模型 | 💰💰💰 按 token 付费 | 💰💰 时间成本 |

---

## 📸 案例展示

![Case Study](docs/case-study.jpg)

*三个 CLI Agent（架构派 / 反方派 / 收敛派）围绕技术方案进行多轮辩论*

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + Vite + TypeScript |
| 后端 | Express + Node.js |
| Agent 通信 | 子进程 CLI 调用 / OpenAI-compatible HTTP |
| 存储 | 本地 JSON 文件 |

---

## 📄 License

MIT — 自由使用、修改、分发。

---

## 🌟 Star History

如果觉得有用，点个 ⭐ 支持一下吧～

[![Star History Chart](https://api.star-history.com/svg?repos=ding7015869-alt/agent-meeting-studio&type=date)](https://star-history.com/#ding7015869-alt/agent-meeting-studio&Date)
