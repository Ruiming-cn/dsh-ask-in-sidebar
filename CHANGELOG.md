# Changelog

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
