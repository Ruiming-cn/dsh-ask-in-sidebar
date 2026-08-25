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

/** Extract a usable call config + system prompt from an EpochHeader, if any. */
export function callConfigFromHeader(header) {
  if (!header || !header.config) return null
  const c = header.config
  if (typeof c.provider !== 'string' || !c.provider) return null
  if (typeof c.model !== 'string' || !c.model) return null
  return {
    provider: c.provider,
    model: c.model,
    ...(header.system ? { system: header.system } : {}),
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
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta') {
      text += typeof chunk.text === 'string' ? chunk.text : ''
    } else if (chunk.type === 'block-end' && chunk.block && chunk.block.type === 'text' && typeof chunk.block.text === 'string') {
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
