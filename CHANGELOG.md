# Changelog

## 0.3.0 - 2026-11-20

- Added the panel-header **context scope**: full context, last 20 messages, last
  6 messages, or quote only. The host now accepts a validated `contextLimit`
  (`-1` quote only, `0` full, `1..200` tail) and truncates the sanitized main
  history per request, so a scope change applies to the next follow-up without
  reopening the panel. The choice is stored in the browser.
- Added **Regenerate**: the same question is asked again without duplicating it
  in the sidebar discussion.
- Documented the scope semantics in both READMEs.

## 0.2.1 - 2026-11-20

- Read the main session's latest `request/header` through the host `sessionQuery`
  service instead of the removed `Session.events` property, so the sidebar
  again reuses the main conversation's provider/model route. A composition
  without `sessionQuery` logs a warning and falls back to the live agent
  options, then to the first configured provider.
- Sanitize main-session history for the current message model: drop system,
  developer, and tool messages, keep only text blocks in assistant/user
  messages, and strip provider replay state that describes removed tool-call
  blocks. A main conversation with tool calls no longer breaks sidebar requests
  or duplicates the main system prompt.
- Complete answers when an adapter emits only `block-end` for a text block, so
  a stream without text deltas no longer finishes empty or truncated.
- Add a **Stop** control while an answer streams. It keeps the text received so
  far and shows no error.
- Add a **Copy** control to every completed sidebar answer that copies the raw
  Markdown to the clipboard.
- Add official plugin metadata: `locale/en.json`, `locale/zh.json`, and an
  original `icon.svg`.

Compatibility: verified against DSH 0.2.2-rc.5.

## 0.2.0 - 2026-08-30

- Migrated the host routes to the Alpha.2 DSH Connection Origin and browser-authentication checks.
- Registered the client shell anchor through `ctx.slots.inject` and declared the current session service dependency.
- Removed the obsolete `dsh.plugin.json`; `package.json` is the only DSH manifest.
- Added the Alpha.2 package metadata, release tarball installation path, and type declarations.

## Unreleased

- CI now runs on Node 20 and 22, installs from the committed lockfile, and fails
  when the committed `lib/` is stale.
- Added unit tests for the prompt/message helpers and the stream edge cases
  (aborted finish, malformed chunks, non-text deltas).
- READMEs gain release badges and a one-command install line.

## 0.1.1

- Stream sidebar answers over SSE instead of waiting for a full JSON reply.
- Render assistant Markdown in the panel (headings, lists, inline code, code
  blocks, blockquotes, links, tables).
- Show the model's thinking process in a collapsible section and preserve it
  after the answer completes.
- Show timing metadata: time to first thought, time to first token, total
  duration, and token usage when available.
- Fix duplicated answer text caused by collecting both token deltas and
  block-end text.
- Sanitize main-session history to a text-only list, so a running main
  conversation with a pending tool call no longer breaks sidebar requests.
- Use a dedicated tool-less sidebar system prompt instead of the main agent's
  system prompt.

## 0.1.0

- Initial release.
- Select assistant text in the main DSH conversation and open an ephemeral
  right-side "Ask in Sidebar" panel.
- First question uses a fresh snapshot of the main session's derived LLM
  message history and latest request header; follow-ups stay inside the same
  ephemeral discussion.
- Host endpoints are read-only, same-origin guarded, and keep snapshots only
  in memory with TTL + explicit discard.
- MIT license, README, and credits included.
