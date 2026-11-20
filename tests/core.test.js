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
  sanitizeMainMessages,
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
    { type: 'request/header', data: { header: { config: { provider: 'b', model: '2' } } } },
  ]
  const header = findLatestHeader(events)
  assert.equal(header.config.provider, 'b')
})

test('callConfigFromHeader extracts provider, model and scalars without a system prompt', () => {
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
  assert.ok(!('system' in config))
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

test('sanitizeMainMessages drops system, developer, and tool messages', () => {
  const messages = [
    { role: 'system', content: [{ type: 'text', text: 'main system prompt' }] },
    { role: 'developer', content: [{ type: 'tool-addition', toolName: 'bash' }] },
    { role: 'tool', content: [{ type: 'text', text: 'tool output' }] },
    { role: 'user', content: [{ type: 'text', text: 'hello' }] },
  ]
  const sanitized = sanitizeMainMessages(messages)
  assert.deepEqual(sanitized.map(message => message.role), ['user'])
  assert.deepEqual(sanitized[0].content, [{ type: 'text', text: 'hello' }])
})

test('sanitizeMainMessages keeps only text blocks in assistant and user messages', () => {
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'answer' },
        { type: 'reasoning', text: 'hidden reasoning' },
        { type: 'tool-call', id: 'c1', name: 'tool', arguments: '{}' },
        { type: 'tool-addition', toolName: 'tool' },
        { type: 'tool-removal', toolName: 'tool' },
        { type: 'image', mediaType: 'image/png' },
        { type: 'file', name: 'notes.md' },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'question' },
        { type: 'image', mediaType: 'image/png' },
      ],
    },
  ]
  const sanitized = sanitizeMainMessages(messages)
  assert.equal(sanitized.length, 2)
  assert.deepEqual(sanitized[0].content, [{ type: 'text', text: 'answer' }])
  assert.deepEqual(sanitized[1].content, [{ type: 'text', text: 'question' }])
})

test('sanitizeMainMessages drops messages left with no text', () => {
  const messages = [
    { role: 'user', content: [{ type: 'image', mediaType: 'image/png' }] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'tool', arguments: '{}' }] },
    { role: 'assistant', content: [] },
    { role: 'developer', content: [{ type: 'text', text: 'not a conversation role' }] },
  ]
  assert.deepEqual(sanitizeMainMessages(messages), [])
})

test('sanitizeMainMessages drops the provider replay state of retained assistants', () => {
  const messages = [
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'answer' }],
      source: { kind: 'model', provider: 'deepseek', model: 'reasoner', replayState: { reasoning: 'leaked' } },
    },
  ]
  const [sanitized] = sanitizeMainMessages(messages)
  assert.deepEqual(sanitized.content, [{ type: 'text', text: 'answer' }])
  assert.deepEqual(sanitized.source, { kind: 'model', provider: 'deepseek', model: 'reasoner' })
})

test('sanitizeMainMessages drops a trailing incomplete tool-call assistant message', () => {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    {
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'c1', name: 'tool', arguments: '{}' }],
    },
  ]
  const sanitized = sanitizeMainMessages(messages)
  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0].role, 'user')
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

test('streamAnswerText does not duplicate text when both deltas and block-end arrive', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'Hello' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const text = await streamAnswerText(stream)
  assert.equal(text, 'Hello')
})

test('streamAnswerText uses block-end when no delta arrived for that block', async () => {
  const stream = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Whole block' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const text = await streamAnswerText(stream)
  assert.equal(text, 'Whole block')
})

test('streamAnswerText folds deltas and block-end text per block index', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'Hello' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } },
    { type: 'block-end', index: 1, block: { type: 'text', text: ' world' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const text = await streamAnswerText(stream)
  assert.equal(text, 'Hello world')
})

test('streamAnswerText throws on an error finish', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'partial' },
    { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } },
  ]
  await assert.rejects(() => streamAnswerText(stream), /boom/)
})

test('streamAnswerText throws with a generic message on an aborted finish', async () => {
  const stream = [
    { type: 'text-delta', index: 0, text: 'partial' },
    { type: 'finish', reason: { kind: 'aborted' } },
  ]
  await assert.rejects(() => streamAnswerText(stream), /model request aborted/)
})

test('streamAnswerText ignores malformed chunks and non-text deltas', async () => {
  const stream = [
    null,
    { type: 'unexpected' },
    { type: 'text-delta', index: 0, text: 123 },
    { type: 'text-delta', index: 1, text: 'ok' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const text = await streamAnswerText(stream)
  assert.equal(text, 'ok')
})
