# dsh-ask-in-sidebar

[English](./README.en.md) | [中文](./README.md)

[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-1f6feb?style=flat-square)](https://github.com/Ruiming-cn/dsh-ask-in-sidebar)
[![Awesome DSH Plugin](https://img.shields.io/badge/Awesome-DSH_Plugin-ff69b4?style=flat-square)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Ruiming-cn/dsh-ask-in-sidebar?style=flat-square)](https://github.com/Ruiming-cn/dsh-ask-in-sidebar/releases)

A DeepSeek Harness (DSH) web plugin that lets you select text in an assistant
answer and ask questions about it in an ephemeral right-side panel, using the
main conversation's existing context without modifying or reloading it.

> **Don't want to interrupt the main conversation just to ask one question?**
> Select the text and keep asking in the right-hand panel — you decide how much
> context it reuses, and every answer can be stopped, copied or regenerated.

## Features

- Select any text inside an assistant answer in the main DSH conversation.
- A floating **Ask in Sidebar** action appears next to the selection.
- Clicking it opens a right-side panel with:
  - the quoted selected text,
  - a question/composer input,
  - a running discussion transcript,
  - live streaming output,
  - a collapsible thinking process,
  - timing metadata (time to first thought, first token, total duration, and
    token usage when available).
- Assistant answers are rendered as safe Markdown: headings, lists, inline
  code, code blocks, blockquotes, links, and tables.
- While an answer streams, **Stop** aborts it and keeps the text received so
  far; completed answers offer **Copy** for the raw Markdown and **Regenerate**
  to ask the same question again.
- The panel header switches the **context scope**: full context, last 20
  messages, last 6 messages, or quote only. The choice is stored per browser and
  applies to the next follow-up without reopening the panel.
- The first question is answered from a snapshot of the main conversation's
  existing LLM message history plus the quoted text.
- Follow-up questions remain inside the same ephemeral sidebar discussion.
- Closing the panel discards the sidebar discussion and its in-memory host
  snapshot.
- Starting a new ask by selecting different assistant text creates a fresh
  discussion with a fresh main-conversation snapshot.

## How it preserves the main conversation

- The host only reads the main session's already-derived LLM message history
  and latest request header. It does not index, scan, summarize, or reload the
  project.
- The plugin registers no tools, opens no new DSH session, and never appends
  messages to the main session.
- The sidebar transcript lives in browser memory for the lifetime of the panel
  and in a short-lived host-side in-memory snapshot for the same discussion.
  Both are removed on close/discard or after a TTL.
- There is no persistent side-session archive, no history tree, and no
  workspace write path.

## Installation

Requirements: a local DSH web profile (verified against DSH 0.2.2-rc.5) with
Node.js 20+.

```bash
# one-command install from GitHub (replace "web" with your profile name if needed)
dsh plugin --profile web add github:Ruiming-cn/dsh-ask-in-sidebar

# or install the prebuilt pinned GitHub release tarball (no build step)
dsh plugin --profile web add https://github.com/Ruiming-cn/dsh-ask-in-sidebar/releases/download/v0.3.0/dsh-ask-in-sidebar-0.3.0.tgz

# or build from a local checkout and install it
npm run build
dsh plugin --profile web add /path/to/dsh-ask-in-sidebar
```

The plugin is also compatible with the DSH super-injector / dev hot-inject
workflow: build `lib/` with `npm run build`, then inject or link the package
into the target profile. The package includes:

- `lib/index.js` – host half (HTTP endpoints)
- `lib/client.js` – browser half (selection action + sidebar panel)
- `cordis.patch.yml` – stable bundle-layer insert
- `package.json` `dsh.bundle` and `dsh.client` metadata

## Usage

1. Open a DSH web conversation.
2. Select a portion of an assistant answer.
3. Click **Ask in Sidebar**.
4. Type a question such as "Why is it done this way?" and press Enter or click
   **Send**.
5. Read the answer in the panel and ask follow-up questions as needed.
6. Click **Stop** while an answer streams to abort it, or **Copy** on a
   completed answer to copy its Markdown.
7. Close the panel at any time to return to the main conversation.

## Configuration

There is no plugin-specific configuration. The sidebar uses the main
conversation's current provider/model route; if no `request/header` is
available, it falls back to the live agent's options, then to the first
configured LLM provider. The sidebar uses a small dedicated tool-less system
prompt so it answers from the supplied context instead of trying to use the
main agent's tools.

## Context scope

The selector in the panel header decides how much of the main conversation one
question reuses:

| Option | What is sent |
| --- | --- |
| Full context (default) | Every sanitized main-conversation message in the snapshot plus the sidebar's own history. |
| Last 20 / last 6 messages | Only the last N main-conversation messages, which keeps long interviews cheap and focused. |
| Quote only | No main-conversation messages at all: just the quoted text and the sidebar history. |

The scope is read **per question**, so switching to a shorter context applies to
the next follow-up without reopening the panel; the snapshot and its
`deriveMessages` result stay unchanged. The choice is stored in the browser
(`dsh-ask-in-sidebar:context-scope`) and survives a reload.

## Context snapshot boundaries

- A snapshot is taken when the first question of a sidebar discussion is
  submitted. It contains the main session's derived LLM messages at that
  moment and the latest request header.
- Follow-up questions in the same panel reuse that same snapshot plus the
  sidebar's own completed history.
- The main conversation may continue to change while the panel is open; the
  open sidebar discussion does not automatically pick up those later main
  messages.
- Starting a new ask (a new selection + panel) takes a new snapshot of the
  then-current main conversation.
- Sidebar context never carries over between separate asks unless the user is
  explicitly continuing in the same open discussion.

## Limitations

- The Markdown renderer is intentionally lightweight; it does not cover every
  Markdown extension (nested tables, footnotes, task lists, etc.).
- The plugin does not provide tools to the sidebar model, so it cannot call
  host tools or mutate the workspace from the panel.
- Model context follows the main session. Very long main conversations may
  produce large sidebar requests because the full derived history is reused.
- Ephemeral snapshots are process-local. A host restart drops them; a
  follow-up after a restart falls back to a current-main-context snapshot.
- The panel is a plain-DOM overlay, not a DSH native slot. It follows the
  conversation DOM contract used by the current web UI (assistant rows expose
  `data-chat-flow-kind="assistant-step"`).

## Development

```bash
npm test        # unit tests for the host core
npm run build   # copy src/ -> lib/
npm run check   # test + build
```

## License

MIT. See [LICENSE](./LICENSE).

Suggested repository tags when publishing: `dsh`, `dsh-plugin`,
`deepseek-harness`, `sidebar`, `ask-in-sidebar`, `context`.

Release workflow: see [RELEASING.md](./RELEASING.md).

## Credits and acknowledgements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT)
  provides the DSH plugin, session, LLM, and web runtime this plugin runs on.
- The host-side HTTP route + same-origin guard pattern and the browser
  `window.__ModuleLoader__` / plain-DOM injection pattern are informed by
  existing MIT-licensed DSH plugins that use the same patterns:
  - [`dsh-better-at`](https://github.com/Ruiming-cn/dsh-better-at)
- No third-party code is copied into this repository. The implementation is
  original and attributed to the DSH ecosystem where API shape or patterns are
  derived from it.

