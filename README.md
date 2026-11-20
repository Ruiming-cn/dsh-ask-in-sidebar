# dsh-ask-in-sidebar

[English](./README.en.md) | [中文](./README.md)

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-1f6feb?style=flat-square)](https://github.com/Ruiming-cn/dsh-ask-in-sidebar)
[![Awesome DSH Plugin](https://img.shields.io/badge/Awesome-DSH_Plugin-ff69b4?style=flat-square)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Ruiming-cn/dsh-ask-in-sidebar?style=flat-square)](https://github.com/Ruiming-cn/dsh-ask-in-sidebar/releases)

一个 DeepSeek Harness (DSH) Web 插件：在助手回答中选中任意文本，即可在右侧临时侧边栏中基于主对话现有上下文提问，不打断、不修改主对话。

## 功能特性

- 在主 DSH 对话中选中助手回答中的任意文本（方案、术语、解释等）。
- 选区旁出现浮动操作按钮 **在侧边栏提问**。
- 点击后打开右侧面板，显示：
  - 引用的选中文本
  - 问题输入框
  - 持续更新的讨论记录
  - 实时流式输出
  - 可折叠的思考过程
  - 思考时间、首字时间、总耗时和 token 用量（可用时）
- 回答以 Markdown 安全渲染，支持标题、列表、行内代码、代码块、引用、链接和表格。
- 回答流式生成时可点击 **停止** 中止，已收到的内容会保留；完成的回答可点击 **复制** 复制 Markdown 原文。
- 首个问题基于主对话在发起提问时的已有 LLM 消息历史快照 + 引用文本进行回答。
- 同一侧边栏讨论内支持连续追问。
- 关闭面板即丢弃当前讨论及其 host 端内存快照。
- 重新选中其他助手文本发起新提问时，会建立新的讨论并重新获取主对话上下文快照。

## 如何保证不干扰主对话

- host 端只读取主会话已经派生好的 LLM 消息历史和最新 `request/header`，不会重新索引、扫描、总结或加载项目。
- 插件不注册任何工具，不创建新的 DSH 会话，不向主会话追加任何消息。
- 侧边栏讨论记录只存在于浏览器内存和 host 端短期内存快照中；关闭/丢弃或 TTL 过期后即删除。
- 没有持久化侧边栏存档、历史树或工作区写入路径。

## 安装

要求：本地 DSH Web profile（已在 DSH 0.2.2-rc.5 上验证），Node.js 20+。

```bash
# 一键安装（从 GitHub 源码构建，将 web 替换为你的 profile 名）
dsh plugin --profile web add github:Ruiming-cn/dsh-ask-in-sidebar

# 或从固定版本 Release 的预构建包安装（无需构建）
dsh plugin --profile web add https://github.com/Ruiming-cn/dsh-ask-in-sidebar/releases/download/v0.2.1/dsh-ask-in-sidebar-0.2.1.tgz

# 或从本地检出构建后再安装
npm run build
dsh plugin --profile web add /path/to/dsh-ask-in-sidebar
```

也可以将插件复制到 DSH 全局插件目录 `~/.dsh/plugins/dsh-ask-in-sidebar`，再通过 `dsh plugin --profile web add` 注册。包内包含：

- `lib/index.js` — host 半端（HTTP 接口）
- `lib/client.js` — 浏览器半端（选区操作 + 侧边栏面板）
- `cordis.patch.yml` — bundle 层插入配置
- `package.json` 中的 `dsh.bundle` 与 `dsh.client` 元数据

## 使用

1. 打开 DSH Web 对话。
2. 选中助手回答中的一段文本。
3. 点击 **在侧边栏提问**。
4. 输入问题（例如“为什么这么做？”或“这是什么意思？”），按 Enter 或点击 **发送**。
5. 在面板中阅读回答，并可继续追问。
6. 回答生成过程中可点击 **停止** 中止；回答完成后可点击 **复制** 复制 Markdown 原文。
7. 随时关闭面板返回主对话。

## 配置

无插件专用配置。侧边栏使用主对话当前使用的 provider/model 路由；若没有 `request/header`，则依次回退到当前 agent options、第一个已配置的 LLM provider。侧边栏使用一个轻量的“只回答、不调用工具”的独立 system prompt，避免复用主 Agent 的复杂工具系统提示。

## 上下文快照边界

- 快照在侧边栏讨论首个问题提交时获取，内容为主会话当时已派生的 LLM 消息和最新请求头。
- 同一面板内的追问复用该快照，并叠加侧边栏自身已完成的问答历史。
- 面板打开期间主对话继续变化，不会自动同步到已打开的侧边栏讨论。
- 新发起一次 ask（新的选区 + 面板）会重新获取当前主对话快照。
- 除非用户明确在同一打开讨论中继续，否则不同 ask 之间不共享侧边栏上下文。

## 限制

- Markdown 渲染是轻量实现，未覆盖全部 Markdown 扩展语法（例如复杂表格嵌套、脚注、任务列表等）。
- 插件不向侧边栏模型提供任何工具，因此无法从面板调用 host 工具或修改工作区。
- 模型上下文跟随主会话；主对话很长时，侧边栏请求也会较大，因为完整派生历史会被复用。
- 临时快照是进程内状态。host 重启后快照丢失；重启后的追问会回退到当前主对话上下文快照。
- 面板是纯 DOM 浮层，不是 DSH 原生 slot；依赖当前 Web UI 的 `data-chat-flow-kind="assistant-step"` 对话 DOM 约定。

## 开发

```bash
npm test        # host 核心单元测试
npm run build   # 将 src/ 复制到 lib/
npm run check   # test + build
```

## 开源与发布

- License: MIT，详见 [LICENSE](./LICENSE)。
- 发布时建议使用的仓库标签：`dsh`、`dsh-plugin`、`deepseek-harness`、`sidebar`、`ask-in-sidebar`、`context`。
- 发布流程参考 [RELEASING.md](./RELEASING.md)。

## 鸣谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）：本插件运行的 DSH 插件、会话、LLM 与 Web 运行时。
- host 端 HTTP 路由 + 同源防护模式、浏览器 `window.__ModuleLoader__` / 纯 DOM 注入模式参考了 DSH 生态中同样采用该模式的 MIT 许可插件：
  - [`dsh-better-at`](https://github.com/Ruiming-cn/dsh-better-at)
- 本仓库未复制第三方代码；实现为原创，并在 API 形状或模式衍生自 DSH 生态处注明来源。
