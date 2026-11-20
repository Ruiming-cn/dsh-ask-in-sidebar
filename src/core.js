/**
 * dsh-ask-in-sidebar host core.
 *
 * Pure helpers used by the host HTTP layer. This module has no DSH imports so
 * it can be unit-tested without a running harness.
 */

import { randomUUID } from 'node:crypto'

/** Cap a caller-supplied string and trim it. */
export function normalizeText(value, max = 10_000) {
  return String(value ?? '').trim().slice(0, max)
}

/** Make one model-facing text message. */
export function makeTextMessage(role, text) {
  const normalizedRole = role === 'assistant' ? 'assistant' : 'user'
  return {
    id: randomUUID(),
    role: normalizedRole,
    content: [{ type: 'text', text: String(text ?? '') }],
    source: normalizedRole === 'assistant'
      ? { kind: 'model', provider: 'dsh-ask-in-sidebar', model: 'sidebar' }
      : { kind: 'plugin', plugin: 'dsh-ask-in-sidebar' },
  }
}

/** Render the first sidebar prompt: quoted text plus the user's question. */
export function formatInitialPrompt(quote, question) {
  const q = normalizeText(quote)
  const qu = normalizeText(question)
  if (!q) return qu
  return `Quoted from the main conversation:\n"""\n${q}\n"""\n\nQuestion: ${qu}`
}

/** Normalize the client-side ephemeral sidebar history. */
export function normalizeHistory(history) {
  if (!Array.isArray(history)) return []
  const out = []
  for (const item of history.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue
    const role = item.role === 'assistant' ? 'assistant' : 'user'
    const text = normalizeText(item.text, 8_000)
    if (!text) continue
    out.push({ role, text })
  }
  return out
}

/**
 * Convert main-session history into a text-only message list safe for a
 * tool-less sidebar request.
 *
 * Tool results are separate `role: 'tool'` messages, not content blocks, so
 * dropping that role is what prevents a provider from rejecting an orphan
 * tool message with no matching tool_call. System and developer messages are
 * the harness's own prompt and tool plumbing; replaying them would duplicate
 * the sidebar's system prompt and leak unrelated instructions. Assistant and
 * user messages keep only text blocks: tool-call/tool-addition/tool-removal
 * state is meaningless to a tool-less request, and reasoning, images, and
 * files are not context the sidebar needs. A message left with no text is
 * dropped so no empty content reaches the provider. The provider replay state
 * is dropped too: it describes tool-call turns whose blocks are gone, and
 * replaying it without those blocks is what adapters reject.
 */
export function sanitizeMainMessages(messages) {
  if (!Array.isArray(messages)) return []
  const out = []
  for (const message of messages) {
    if (!message || (message.role !== 'assistant' && message.role !== 'user')) continue
    if (!Array.isArray(message.content)) continue
    const content = message.content.filter(block => block && block.type === 'text')
    if (content.length === 0) continue
    out.push({
      ...message,
      content,
      ...(message.source && message.source.replayState !== undefined
        ? { source: withoutReplayState(message.source) }
        : {}),
    })
  }
  return out
}

/** Copy one message source without the provider replay state. */
function withoutReplayState(source) {
  const { replayState, ...rest } = source
  return rest
}

/** Largest accepted `contextLimit`; a sidebar question never needs more. */
export const MAX_CONTEXT_LIMIT = 200

/** `contextLimit` value meaning "do not include the main history at all". */
export const NO_MAIN_CONTEXT = -1

/**
 * Normalize a client-supplied context limit.
 * @param {unknown} value - raw payload field.
 * @returns {number} `NO_MAIN_CONTEXT`, `0` for the full history, or a positive count.
 */
export function normalizeContextLimit(value) {
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < NO_MAIN_CONTEXT || limit > MAX_CONTEXT_LIMIT) return 0
  return limit
}

/**
 * Keep only the main-history tail the caller asked for.
 *
 * The scope is a request-time choice, not a snapshot-time one: the same
 * discussion can switch from the full history to a short tail (or to the quote
 * alone) on its next question without re-reading the main session.
 * @param {unknown[]} messages - sanitized main-history messages.
 * @param {number} contextLimit - `NO_MAIN_CONTEXT`, `0` (all), or a positive count.
 */
export function scopeMainMessages(messages, contextLimit) {
  if (!Array.isArray(messages)) return []
  if (contextLimit === NO_MAIN_CONTEXT) return []
  if (!Number.isInteger(contextLimit) || contextLimit <= 0) return messages
  return messages.length <= contextLimit ? messages : messages.slice(-contextLimit)
}

/**
 * Build the sidebar LLM messages.
 *
 * A brand-new ask (empty history) produces one user message containing the
 * quote and the first question. A follow-up inside the same ephemeral
 * discussion replays the completed sidebar history and appends the new
 * question as a normal user message.
 */
export function buildSidebarMessages({ history = [], quote = '', question = '' }) {
  const normalized = normalizeHistory(history)
  const out = []
  for (const item of normalized) {
    out.push(makeTextMessage(item.role, item.text))
  }
  if (normalized.length === 0) {
    out.push(makeTextMessage('user', formatInitialPrompt(quote, question)))
  } else {
    out.push(makeTextMessage('user', normalizeText(question)))
  }
  return out
}

/** Find the latest `request/header` event in a session log. */
export function findLatestHeader(events) {
  if (!Array.isArray(events)) return undefined
  let found
  for (const event of events) {
    if (event && event.type === 'request/header' && event.data && event.data.header) {
      found = event.data.header
    }
  }
  return found
}

/**
 * Extract a usable call config from an EpochHeader, if any.
 *
 * The current header no longer carries a system prompt, and the sidebar always
 * substitutes its own tool-less prompt, so only the route and scalars survive.
 */
export function callConfigFromHeader(header) {
  if (!header || !header.config) return null
  const c = header.config
  if (typeof c.provider !== 'string' || !c.provider) return null
  if (typeof c.model !== 'string' || !c.model) return null
  return {
    provider: c.provider,
    model: c.model,
    ...(c.reasoningEffort ? { reasoningEffort: c.reasoningEffort } : {}),
    ...(typeof c.temperature === 'number' ? { temperature: c.temperature } : {}),
    ...(typeof c.maxTokens === 'number' && c.maxTokens > 0 ? { maxTokens: c.maxTokens } : {}),
  }
}

/** Extract a usable call config from live agent options, if any. */
export function callConfigFromAgent(agent) {
  if (!agent || !agent.options) return null
  const c = agent.options
  if (typeof c.provider !== 'string' || !c.provider) return null
  if (typeof c.model !== 'string' || !c.model) return null
  return {
    provider: c.provider,
    model: c.model,
    ...(typeof c.maxTokens === 'number' && c.maxTokens > 0 ? { maxTokens: c.maxTokens } : {}),
  }
}

/**
 * Consume an `ctx.llm.stream()` chunk iterable and return the visible text.
 * Reasoning-only output is intentionally not surfaced; errors become a throw.
 */
export async function streamAnswerText(stream) {
  let text = ''
  let failureMessage = null
  // Some adapters emit both token deltas and a block-end carrying the complete
  // block; keep one source of truth per block index so the text is not doubled.
  const seenDeltaIndexes = new Set()
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta') {
      seenDeltaIndexes.add(chunk.index)
      text += typeof chunk.text === 'string' ? chunk.text : ''
    } else if (chunk.type === 'block-end'
      && chunk.block && chunk.block.type === 'text'
      && typeof chunk.block.text === 'string'
      && !seenDeltaIndexes.has(chunk.index)) {
      text += chunk.block.text
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason
      if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
        failureMessage = reason.failure && reason.failure.message
          ? reason.failure.message
          : `model request ${reason.kind}`
      }
    }
  }
  if (failureMessage) throw new Error(failureMessage)
  return text
}
