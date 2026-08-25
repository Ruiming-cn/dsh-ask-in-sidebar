import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSidebarMessages,
  callConfigFromAgent,
  callConfigFromHeader,
  findLatestHeader,
  formatInitialPrompt,
  normalizeHistory,
  normalizeText,
  streamAnswerText,
} from '../src/core.js'

test('normalizeText trims and caps', () => {
  assert.equal(normalizeText('  hi  '), 'hi')
  assert.equal(normalizeText('x'.repeat(20), 5), 'xxxxx')
  assert.equal(normalizeText(undefined), '')
})

test('formatInitialPrompt includes quote and question', () => {
  const text = formatInitialPrompt('  Some plan  ', 'Why is it done this way?')
  assert.match(text, /Some plan/)
  assert.match(text, /Why is it done this way\?/)
  assert.match(text, /Quoted from the main conversation/)
})

test('buildSidebarMessages creates one first user message for a new ask', () => {
  const messages = buildSidebarMessages({
    history: [],
    quote: 'selected text',
    question: 'what does this mean?',
  })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'user')
  assert.deepEqual(messages[0].content, [{ type: 'text', text: formatInitialPrompt('selected text', 'what does this mean?') }])
})

test('buildSidebarMessages replays history and appends a follow-up question', () => {
  const messages = buildSidebarMessages({
    history: [
      { role: 'user', text: 'first question' },
      { role: 'assistant', text: 'first answer' },
    ],
    quote: '',
    question: 'follow up',
  })
  assert.equal(messages.length, 3)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content[0].text, 'first question')
  assert.equal(messages[1].role, 'assistant')
  assert.equal(messages[1].content[0].text, 'first answer')
  assert.equal(messages[2].role, 'user')
  assert.equal(messages[2].content[0].text, 'follow up')
})

test('normalizeHistory filters malformed and caps long entries', () => {
  const history = normalizeHistory([
    { role: 'user', text: 'a' },
    { role: 'assistant', text: 'b' },
    { role: 'system', text: 'ignored role becomes user' },
    null,
    { role: 'user', text: '' },
    { role: 'assistant', text: 'x'.repeat(9000) },
  ])
  assert.equal(history.length, 4)
  assert.equal(history[2].role, 'user')
  assert.equal(history[3].text.length, 8000)
})

test('findLatestHeader returns the newest request/header event', () => {
  const events = [
    { type: 'user/message', data: {} },
    { type: 'request/header', data: { header: { config: { provider: 'a', model: '1' } } } },
    { type: 'request/header', data: { header: { config: { provider: 'b', model: '2' }, system: 'sys' } } },
  ]
  const header = findLatestHeader(events)
  assert.equal(header.config.provider, 'b')
  assert.equal(header.system, 'sys')
})

test('callConfigFromHeader extracts provider, model, system and scalars', () => {
  const config = callConfigFromHeader({
    config: {
      provider: 'deepseek-official',
      model: 'deepseek-chat',
      reasoningEffort: 'high',
      temperature: 0.7,
      maxTokens: 2048,
    },
    system: 'You are a helpful assistant.',
  })
  assert.equal(config.provider, 'deepseek-official')
  assert.equal(config.model, 'deepseek-chat')
  assert.equal(config.reasoningEffort, 'high')
  assert.equal(config.temperature, 0.7)
  assert.equal(config.maxTokens, 2048)
  assert.equal(config.system, 'You are a helpful assistant.')
})

test('callConfigFromHeader returns null when provider or model is missing', () => {
  assert.equal(callConfigFromHeader(null), null)
  assert.equal(callConfigFromHeader({ config: { provider: 'p' } }), null)
  assert.equal(callConfigFromHeader({ config: { model: 'm' } }), null)
})

test('callConfigFromAgent extracts agent options', () => {
  const config = callConfigFromAgent({ options: { provider: 'p', model: 'm', maxTokens: 999 } })
  assert.equal(config.provider, 'p')
  assert.equal(config.model, 'm')
  assert.equal(config.maxTokens, 999)
  assert.equal(callConfigFromAgent({ options: {} }), null)
})

test('streamAnswerText collects text deltas and ignores reasoning', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'Hel' },
    { type: 'reasoning-delta', index: 1, text: 'hidden' },
    { type: 'text-delta', index: 0, text: 'lo' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const text = await streamAnswerText(stream)
  assert.equal(text, 'Hello')
})

test('streamAnswerText throws on an error finish', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'partial' },
    { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } },
  ]
  await assert.rejects(() => streamAnswerText(stream), /boom/)
})
