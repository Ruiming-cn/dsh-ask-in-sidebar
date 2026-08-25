# dsh-ask-in-sidebar

[English](./README.en.md) | [中文](./README.md)

一个 DeepSeek Harness (DSH) Web 插件：在助手回答中选中任意文本，即可在右侧临时侧边栏中基于主对话现有上下文提问，不打断、不修改主对话。

## 功能特性

- 在主 DSH 对话中选中助手回答中的任意文本（方案、术语、解释等）。
- 选区旁出现浮动操作按钮 **在侧边栏提问**。
- 点击后打开右侧面板，显示：
  - 引用的选中文本
  - 问题输入框
  - 持续更新的讨论记录
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

要求：本地 DSH Web profile，Node.js 20+。

```bash
# 在插件目录中构建
npm run build

# 安装到指定 DSH profile（将 web 替换为你的 profile 名）
dsh plugin --profile web add /path/to/dsh-ask-in-sidebar
```

也可以将插件复制到 DSH 全局插件目录 `~/.dsh/plugins/dsh-ask-in-sidebar`，再通过 `dsh plugin --profile web add` 注册。包内包含：

- `lib/index.js` — host 半端（HTTP 接口）
- `lib/client.js` — 浏览器半端（选区操作 + 侧边栏面板）
- `cordis.patch.yml` — bundle 层插入配置
- `dsh.plugin.json` 与 `package.json` 的 `dsh` 元数据

## 使用

1. 打开 DSH Web 对话。
2. 选中助手回答中的一段文本。
3. 点击 **在侧边栏提问**。
4. 输入问题（例如“为什么这么做？”或“这是什么意思？”），按 Enter 或点击 **发送**。
5. 在面板中阅读回答，并可继续追问。
6. 随时关闭面板返回主对话。

## 配置

无插件专用配置。侧边栏使用主对话当前使用的 provider/model 路由和最新 `request/header` 中的 system prompt。若没有 header，则依次回退到当前 agent options、第一个已配置的 LLM provider。

## 上下文快照边界

- 快照在侧边栏讨论首个问题提交时获取，内容为主会话当时已派生的 LLM 消息和最新请求头。
- 同一面板内的追问复用该快照，并叠加侧边栏自身已完成的问答历史。
- 面板打开期间主对话继续变化，不会自动同步到已打开的侧边栏讨论。
- 新发起一次 ask（新的选区 + 面板）会重新获取当前主对话快照。
- 除非用户明确在同一打开讨论中继续，否则不同 ask 之间不共享侧边栏上下文。

## 限制

- 侧边栏回答以纯文本展示，不在面板内做 Markdown 渲染或工具执行。
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
- host 端 HTTP 路由 + 同源防护模式、浏览器 `window.__ModuleLoader__` / 纯 DOM 注入模式参考了以下 MIT 许可的现有 DSH 插件：
  - [`dsh-more-session-operations`](https://github.com/Ruiming-cn/dsh-more-session-operations)
  - [`dsh-better-at`](https://github.com/Ruiming-cn/dsh-better-at)
- 本仓库未复制第三方代码；实现为原创，并在 API 形状或模式衍生自 DSH 生态处注明来源。
