import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSidebarMessages,
  findLatestHeader,
  formatInitialPrompt,
  makeTextMessage,
} from '../src/core.js'

test('makeTextMessage normalizes role and tags its source', () => {
  const user = makeTextMessage('system', 'hi')
  assert.equal(user.role, 'user')
  assert.equal(user.source.kind, 'plugin')
  const assistant = makeTextMessage('assistant', 'ok')
  assert.equal(assistant.role, 'assistant')
  assert.equal(assistant.source.kind, 'model')
})

test('formatInitialPrompt returns only the question when the quote is empty', () => {
  assert.equal(formatInitialPrompt('   ', 'why?'), 'why?')
})

test('buildSidebarMessages coerces unknown roles and skips empty text', () => {
  const messages = buildSidebarMessages({
    history: [
      { role: 'system', text: 'coerced to user' },
      { role: 'user', text: '' },
      { role: 'assistant', text: 'answer' },
    ],
    quote: '',
    question: 'next',
  })
  assert.equal(messages.length, 3)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content[0].text, 'coerced to user')
  assert.equal(messages[1].role, 'assistant')
  assert.equal(messages[2].role, 'user')
  assert.equal(messages[2].content[0].text, 'next')
})

test('findLatestHeader handles non-array input', () => {
  assert.equal(findLatestHeader(null), undefined)
  assert.equal(findLatestHeader(undefined), undefined)
  assert.equal(findLatestHeader('not-an-array'), undefined)
})
