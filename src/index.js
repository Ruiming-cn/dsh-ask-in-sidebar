// dsh-ask-in-sidebar: host half.
//
// Two read-only HTTP endpoints back the browser panel:
//   POST /__dsh-ask-in-sidebar/answer   - answer a sidebar question
//   POST /__dsh-ask-in-sidebar/discard  - drop one ephemeral discussion snapshot
//
// The host never writes to the main session. It reads the main session's
// already-derived LLM message history and latest request header, keeps an
// in-memory snapshot per discussion (TTL + discard), and calls the same
// provider/model route through ctx.llm. No tools are registered, no files are
// indexed, and no workspace mutation path exists.
import {
  buildSidebarMessages,
  callConfigFromAgent,
  callConfigFromHeader,
  findLatestHeader,
  normalizeHistory,
  normalizeText,
  streamAnswerText,
} from './core.js'

export const name = 'dsh-ask-in-sidebar'
export const inject = []

const ANSWER_PATH = '/__dsh-ask-in-sidebar/answer'
const DISCARD_PATH = '/__dsh-ask-in-sidebar/discard'

// Ephemeral snapshots live only in this host process. They are deliberately
// not persisted, not linked to DSH sessions, and are removed on discard/close
// or after the TTL so a closed tab cannot leak memory forever.
const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000
const SNAPSHOT_SWEEP_MS = 10 * 60 * 1000
const discussions = new Map()

class HttpError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// --- http helpers ------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (d) => {
      data += d
      if (data.length > 1_000_000) req.destroy()
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

// The endpoints are read-only and never mutate the workspace, but they do
// read the user's session history, so cross-site browsers must not trigger
// them. Same guard used by dsh-more-session-operations.
function isSameOriginRequest(req) {
  const origin = req.headers && req.headers.origin
  if (origin) {
    try {
      const host = req.headers.host
      if (!host || new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  const fetchSite = req.headers && req.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
  return true
}

// --- ephemeral snapshot store -------------------------------------------------

function sweepDiscussions(now = Date.now()) {
  for (const [id, snap] of discussions) {
    if (typeof snap.capturedAt === 'number' && now - snap.capturedAt > SNAPSHOT_TTL_MS) {
      discussions.delete(id)
    }
  }
}

function readSnapshot(ctx, sessionId) {
  const sessions = ctx.get('sessions')
  if (!sessions || typeof sessions.get !== 'function') {
    throw new HttpError('sessions service unavailable', 503)
  }
  const session = sessions.get(sessionId)
  if (!session) {
    throw new HttpError('session not found', 404)
  }
  let messages = []
  try {
    messages = typeof session.deriveMessages === 'function' ? session.deriveMessages() : []
  } catch {
    messages = []
  }
  const events = Array.isArray(session.events) ? session.events : []
  const header = findLatestHeader(events)
  return { sessionId, messages: Array.isArray(messages) ? messages : [], header, capturedAt: Date.now() }
}

function getOrCreateSnapshot(ctx, discussionId, sessionId) {
  const existing = discussions.get(discussionId)
  if (existing && existing.sessionId === sessionId) return existing
  const snapshot = readSnapshot(ctx, sessionId)
  discussions.set(discussionId, snapshot)
  sweepDiscussions()
  return snapshot
}

function discardSnapshot(discussionId) {
  discussions.delete(discussionId)
}

// --- config resolution ---------------------------------------------------------

async function resolveCallConfig(ctx, sessionId, header) {
  const fromHeader = callConfigFromHeader(header)
  if (fromHeader) return fromHeader

  const agents = ctx.get('agents')
  const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
  const fromAgent = callConfigFromAgent(agent)
  if (fromAgent) return fromAgent

  const llm = ctx.get('llm')
  if (!llm || typeof llm.listProviders !== 'function') {
    throw new HttpError('LLM service unavailable', 503)
  }
  const providers = llm.listProviders() || []
  const first = providers[0]
  if (!first || !first.id) {
    throw new HttpError('no LLM provider configured', 503)
  }
  let model
  if (typeof llm.listModels === 'function') {
    const models = await llm.listModels(first.id)
    model = models && models[0] ? models[0].id : undefined
  }
  if (!model) {
    throw new HttpError(`no model available for provider ${first.id}`, 503)
  }
  return { provider: first.id, model }
}

// --- core answer -----------------------------------------------------------------

async function answer(ctx, payload) {
  const discussionId = String(payload.discussionId || '').trim()
  const sessionId = String(payload.sessionId || '').trim()
  const quote = normalizeText(payload.quote)
  const question = normalizeText(payload.question)

  if (!discussionId) throw new HttpError('discussionId required', 400)
  if (!sessionId) throw new HttpError('sessionId required', 400)
  if (!question) throw new HttpError('question required', 400)

  const history = normalizeHistory(payload.history)
  const existing = discussions.get(discussionId)
  const snapshot = history.length === 0 || !existing || existing.sessionId !== sessionId
    ? getOrCreateSnapshot(ctx, discussionId, sessionId)
    : existing

  const config = await resolveCallConfig(ctx, snapshot.sessionId, snapshot.header)
  const sidebarMessages = buildSidebarMessages({ history, quote, question })
  const messages = [...snapshot.messages, ...sidebarMessages]

  const llm = ctx.get('llm')
  if (!llm || typeof llm.stream !== 'function') {
    throw new HttpError('LLM service unavailable', 503)
  }

  let answerText
  try {
    answerText = await streamAnswerText(llm.stream({
      provider: config.provider,
      model: config.model,
      messages,
      ...(config.system ? { system: config.system } : {}),
      ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.maxTokens ? { maxTokens: config.maxTokens } : {}),
    }))
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    throw new HttpError(`model request failed: ${message}`, 502)
  }

  if (!answerText.trim()) {
    throw new HttpError('model returned an empty response', 502)
  }
  return answerText
}

// --- plugin -------------------------------------------------------------------

function registerHttp(host, targetCtx) {
  const timer = setInterval(() => sweepDiscussions(), SNAPSHOT_SWEEP_MS)
  if (typeof timer.unref === 'function') timer.unref()

  targetCtx.effect(() => {
    host.register({
      kind: 'exact',
      path: ANSWER_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        if (!isSameOriginRequest(req)) {
          sendJson(res, 403, { error: 'cross-origin request rejected' })
          return
        }
        let payload = {}
        try {
          const body = await readBody(req)
          if (body) payload = JSON.parse(body)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }
        try {
          const answerText = await answer(targetCtx, payload)
          sendJson(res, 200, { ok: true, answer: answerText })
        } catch (error) {
          const status = error instanceof HttpError && error.status ? error.status : 500
          sendJson(res, status, { error: error.message })
        }
      },
    })

    host.register({
      kind: 'exact',
      path: DISCARD_PATH,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        if (!isSameOriginRequest(req)) {
          sendJson(res, 403, { error: 'cross-origin request rejected' })
          return
        }
        let payload = {}
        try {
          const body = await readBody(req)
          if (body) payload = JSON.parse(body)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }
        const discussionId = String(payload.discussionId || '').trim()
        if (!discussionId) {
          sendJson(res, 400, { error: 'discussionId required' })
          return
        }
        discardSnapshot(discussionId)
        sendJson(res, 200, { ok: true })
      },
    })

    return () => {
      clearInterval(timer)
    }
  }, 'dsh-ask-in-sidebar: http routes')
}

export function apply(ctx) {
  const ws = ctx.get('webServer')
  if (ws !== undefined) {
    registerHttp(ws, ctx)
  } else {
    ctx.inject(['webServer'], (sub) => {
      registerHttp(sub.webServer, sub)
    })
  }
}
