# Changelog

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
