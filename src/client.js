// dsh-ask-in-sidebar: CLIENT half.
//
// Plain-DOM, no-build browser plugin:
//   - shows a floating "Ask in Sidebar" button when text is selected inside an
//     assistant answer ([data-chat-flow-kind="assistant-step"]);
//   - opens an ephemeral right-side panel with the quote, a question composer,
//     and a streaming discussion transcript;
//   - renders assistant Markdown safely in the panel;
//   - streams reasoning + answer chunks over SSE and shows timing metadata;
//   - never writes to the main conversation; closing the panel discards the
//     in-memory discussion and tells the host to drop its snapshot.
window.__ModuleLoader__.load({
  id: 'dsh-ask-in-sidebar',
  factory: () => {
    const NS = 'dsh-ask-in-sidebar'
    const ANSWER_STREAM_PATH = '/__dsh-ask-in-sidebar/answer-stream'
    const DISCARD_PATH = '/__dsh-ask-in-sidebar/discard'

    const dict = {
      zh: {
        ask: '在侧边栏提问',
        title: '在侧边栏提问',
        quote: '引用',
        quoteEmpty: '（无引用）',
        placeholder: '输入你的问题…',
        send: '发送',
        thinking: '思考中…',
        thought: '思考过程',
        close: '关闭',
        closeAria: '关闭侧边栏讨论',
        error: '出错了',
        empty: '请输入问题。',
        started: '已开始',
        noThought: '（无思考内容）',
        duration: '时长',
      },
      en: {
        ask: 'Ask in Sidebar',
        title: 'Ask in Sidebar',
        quote: 'Quote',
        quoteEmpty: '(no quote)',
        placeholder: 'Ask a question…',
        send: 'Send',
        thinking: 'Thinking…',
        thought: 'Thinking',
        close: 'Close',
        closeAria: 'Close sidebar discussion',
        error: 'Error',
        empty: 'Please enter a question.',
        started: 'Started',
        noThought: '(no thinking content)',
        duration: 'Duration',
      },
    }

    function browserLang() {
      if (typeof navigator === 'undefined') return 'en'
      for (const tag of (navigator.languages || []).concat([navigator.language])) {
        const primary = String(tag || '').toLowerCase().split('-')[0]
        if (primary === 'zh' || primary === 'en') return primary
      }
      return 'en'
    }

    function t(key) {
      const table = dict[browserLang()] || dict.en
      return table[key] || dict.en[key] || key
    }

    function randomId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
      return `disc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }

    // --- safe Markdown rendering ---------------------------------------------

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    function inlineFormat(text) {
      let html = escapeHtml(text)
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      return html
    }

    function renderMarkdown(md) {
      const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n')
      const out = []
      let i = 0
      let inCode = false
      let codeLang = ''
      let codeBuf = []
      let listType = null
      let listBuf = []
      let quoteBuf = []
      let paraBuf = []

      const flushPara = () => {
        if (paraBuf.length === 0) return
        out.push(`<p>${inlineFormat(paraBuf.join('\n'))}</p>`)
        paraBuf = []
      }
      const flushQuote = () => {
        if (quoteBuf.length === 0) return
        out.push(`<blockquote>${quoteBuf.map(q => `<p>${inlineFormat(q)}</p>`).join('')}</blockquote>`)
        quoteBuf = []
      }
      const flushList = () => {
        if (!listType) return
        const tag = listType
        out.push(`<${tag}>${listBuf.map(li => `<li>${inlineFormat(li)}</li>`).join('')}</${tag}>`)
        listType = null
        listBuf = []
      }
      const flushAll = () => {
        flushPara()
        flushQuote()
        flushList()
      }

      const tableRow = (row) => {
        return row
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map(cell => cell.trim())
      }

      while (i < lines.length) {
        const line = lines[i]
        const trimmed = line.trim()

        if (inCode) {
          if (trimmed.startsWith('```')) {
            out.push(`<pre><code${codeLang ? ` class="language-${codeLang}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
            inCode = false
            codeLang = ''
            codeBuf = []
          } else {
            codeBuf.push(line)
          }
          i += 1
          continue
        }

        const fence = trimmed.match(/^```(\w*)\s*$/)
        if (fence) {
          flushAll()
          inCode = true
          codeLang = fence[1] || ''
          codeBuf = []
          i += 1
          continue
        }

        if (/^(---|\*\*\*)\s*$/.test(trimmed)) {
          flushAll()
          out.push('<hr>')
          i += 1
          continue
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          flushAll()
          const level = heading[1].length
          out.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`)
          i += 1
          continue
        }

        const quote = trimmed.match(/^>\s?(.*)$/)
        if (quote) {
          flushPara()
          flushList()
          quoteBuf.push(quote[1])
          i += 1
          continue
        }
        flushQuote()

        const ul = trimmed.match(/^[-*]\s+(.*)$/)
        const ol = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (ul || ol) {
          flushPara()
          const type = ul ? 'ul' : 'ol'
          const content = ul ? ul[1] : ol[2]
          if (listType && listType !== type) flushList()
          listType = type
          listBuf.push(content)
          i += 1
          continue
        }
        if (listBuf.length) flushList()

        if (/^\s*$/.test(trimmed)) {
          flushAll()
          i += 1
          continue
        }

        // Minimal pipe table: header line + separator line.
        const next = lines[i + 1]
        const separator = next && next.trim().match(/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/)
        if (line.includes('|') && separator) {
          flushAll()
          const headers = tableRow(line)
          const rows = []
          i += 2
          while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
            rows.push(tableRow(lines[i]))
            i += 1
          }
          out.push('<table><thead><tr>'
            + headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')
            + '</tr></thead><tbody>'
            + rows.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('')
            + '</tbody></table>')
          continue
        }

        flushPara()
        paraBuf.push(trimmed)
        i += 1
      }

      flushAll()
      return out.join('\n')
    }

    // --- services -------------------------------------------------------------
    let sessionsSvc = null

    function getCurrentSessionId() {
      const snap = sessionsSvc && sessionsSvc.list && typeof sessionsSvc.list.getSnapshot === 'function'
        ? sessionsSvc.list.getSnapshot()
        : null
      return snap && snap.current ? snap.current : null
    }

    // --- ephemeral discussion state -------------------------------------------
    let discussion = null
    let panel = null
    let selectionButton = null
    let panelStyle = null

    // --- styles ---------------------------------------------------------------
    const S = {
      selectionButton: [
        'position:fixed', 'z-index:2147483000', 'pointer-events:auto',
        'padding:6px 12px', 'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))',
        'border-radius:10px', 'background:var(--dsw-alias-bg-panel,#fff)',
        'color:var(--dsw-alias-label-primary,#1f1f1f)', 'font:inherit', 'font-size:13px',
        'line-height:20px', 'cursor:pointer', 'box-shadow:0 6px 18px rgba(0,0,0,.14)',
        'white-space:nowrap',
      ].join(';'),
      panel: [
        'position:fixed', 'top:0', 'right:0', 'bottom:0',
        'width:min(460px,96vw)', 'z-index:2147483000',
        'display:flex', 'flex-direction:column',
        'background:var(--dsw-alias-bg-panel,#fff)',
        'color:var(--dsw-alias-label-primary,#1f1f1f)',
        'border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))',
        'box-shadow:-12px 0 30px rgba(0,0,0,.16)', 'font:inherit',
      ].join(';'),
      header: [
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'gap:12px', 'padding:12px 14px', 'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))',
        'flex:none',
      ].join(';'),
      headerTitle: 'font-size:15px;font-weight:600;line-height:22px;margin:0;',
      closeBtn: [
        'border:none', 'background:transparent', 'color:var(--dsw-alias-label-secondary,#555)',
        'font-size:18px', 'line-height:1', 'cursor:pointer', 'padding:4px 8px', 'border-radius:8px',
      ].join(';'),
      quoteWrap: [
        'padding:10px 14px', 'border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))',
        'flex:none', 'overflow-y:auto', 'max-height:180px',
      ].join(';'),
      quoteLabel: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#8a8a8e);margin-bottom:4px;',
      quote: [
        'margin:0', 'padding:8px 10px', 'border-left:3px solid var(--dsw-alias-accent-solid,#4f6bfe)',
        'background:var(--dsw-alias-bg-subtle,rgba(128,128,128,.06))',
        'color:var(--dsw-alias-label-secondary,#555)',
        'font-size:13px', 'line-height:20px', 'white-space:pre-wrap', 'word-break:break-word',
      ].join(';'),
      messages: [
        'flex:1', 'overflow-y:auto', 'padding:12px 14px', 'display:flex', 'flex-direction:column',
        'gap:10px',
      ].join(';'),
      msg: [
        'max-width:98%', 'padding:8px 10px', 'border-radius:10px', 'font-size:13px', 'line-height:20px',
        'word-break:break-word',
      ].join(';'),
      msgUser: [
        'align-self:flex-end', 'background:var(--dsw-alias-bg-accent-soft,rgba(79,107,254,.12))',
        'color:var(--dsw-alias-label-primary,#1f1f1f)', 'white-space:pre-wrap',
      ].join(';'),
      msgAssistant: [
        'align-self:flex-start', 'background:var(--dsw-alias-bg-subtle,rgba(128,128,128,.07))',
        'color:var(--dsw-alias-label-primary,#1f1f1f)', 'width:100%',
      ].join(';'),
      msgRole: 'display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#8a8a8e);margin-bottom:4px;',
      thoughtSummary: [
        'cursor:pointer', 'font-size:12px', 'font-weight:600',
        'color:var(--dsw-alias-label-secondary,#555)', 'padding:2px 0', 'user-select:none',
      ].join(';'),
      thoughtBody: [
        'font-size:12px', 'line-height:18px', 'color:var(--dsw-alias-label-secondary,#555)',
        'white-space:pre-wrap', 'word-break:break-word', 'max-height:220px', 'overflow-y:auto',
        'border-left:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))', 'padding-left:8px',
        'margin:2px 0 6px',
      ].join(';'),
      markdown: [
        'font-size:13px', 'line-height:20px', 'color:var(--dsw-alias-label-primary,#1f1f1f)',
      ].join(';'),
      meta: [
        'font-size:11px', 'line-height:16px', 'color:var(--dsw-alias-label-tertiary,#8a8a8e)',
        'margin-top:6px', 'white-space:pre-wrap',
      ].join(';'),
      thinking: 'align-self:flex-start;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8e);padding:4px 2px;',
      error: [
        'flex:none', 'padding:8px 14px', 'font-size:12px', 'line-height:16px',
        'color:var(--dsw-alias-state-error-primary,#e5484d)',
        'background:var(--dsw-alias-state-error-bg,rgba(229,72,77,.08))',
        'border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))',
        'white-space:pre-wrap', 'word-break:break-word',
      ].join(';'),
      composer: [
        'flex:none', 'display:flex', 'gap:8px', 'padding:10px 14px',
        'border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))',
      ].join(';'),
      textarea: [
        'flex:1', 'min-height:38px', 'max-height:140px', 'resize:none',
        'padding:8px 10px', 'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))',
        'border-radius:10px', 'background:transparent', 'color:var(--dsw-alias-label-primary,#1f1f1f)',
        'font:inherit', 'font-size:13px', 'line-height:20px', 'outline:none',
      ].join(';'),
      sendBtn: [
        'flex:none', 'padding:8px 14px', 'border:1px solid var(--dsw-alias-accent-solid,#4f6bfe)',
        'border-radius:10px', 'background:var(--dsw-alias-accent-solid,#4f6bfe)',
        'color:#fff', 'font:inherit', 'font-size:13px', 'line-height:20px', 'cursor:pointer',
      ].join(';'),
    }

    // --- DOM helpers ------------------------------------------------------------

    function el(tag, style, text) {
      const node = document.createElement(tag)
      if (style) node.style.cssText = style
      if (text !== undefined) node.textContent = text
      return node
    }

    function appendMessage(container, item) {
      const role = item.role
      const node = el('div', role === 'assistant' ? `${S.msg}${S.msgAssistant}` : `${S.msg}${S.msgUser}`)
      const roleLabel = el('span', S.msgRole, role === 'assistant' ? 'Assistant' : 'You')
      node.appendChild(roleLabel)
      if (role === 'assistant') {
        if (item.reasoning) {
          const details = document.createElement('details')
          const summary = el('summary', S.thoughtSummary, t('thought'))
          const thoughtBody = el('div', S.thoughtBody, item.reasoning)
          details.appendChild(summary)
          details.appendChild(thoughtBody)
          node.appendChild(details)
        }
        const body = el('div', S.markdown)
        body.className = 'markdown-body'
        body.innerHTML = renderMarkdown(item.text)
        node.appendChild(body)
        if (item.meta) {
          const metaEl = el('div', S.meta, item.meta)
          node.appendChild(metaEl)
        }
      } else {
        const body = el('div', '', item.text)
        node.appendChild(body)
      }
      container.appendChild(node)
    }

    function createStreamingAssistantNode() {
      const node = el('div', `${S.msg}${S.msgAssistant}`)
      const roleLabel = el('span', S.msgRole, 'Assistant')
      node.appendChild(roleLabel)
      const details = document.createElement('details')
      details.open = true
      const summary = el('summary', S.thoughtSummary, t('thought'))
      const thoughtBody = el('div', S.thoughtBody, t('thinking'))
      details.appendChild(summary)
      details.appendChild(thoughtBody)
      const answer = el('div', S.markdown)
      answer.className = 'markdown-body'
      const meta = el('div', S.meta, '')
      node.appendChild(details)
      node.appendChild(answer)
      node.appendChild(meta)
      return { node, details, summary, thoughtBody, answer, meta }
    }

    function formatDurationMs(ms) {
      if (ms === null || ms === undefined) return '—'
      return `${(ms / 1000).toFixed(1)}s`
    }

    function metaLine(durations, usage) {
      if (!durations) return ''
      const parts = []
      if (durations.firstReasoningMs !== null && durations.firstReasoningMs !== undefined) {
        parts.push(`思考 ${formatDurationMs(durations.firstReasoningMs)}`)
      }
      if (durations.firstTextMs !== null && durations.firstTextMs !== undefined) {
        parts.push(`首字 ${formatDurationMs(durations.firstTextMs)}`)
      }
      if (durations.totalMs !== null && durations.totalMs !== undefined) {
        parts.push(`总耗时 ${formatDurationMs(durations.totalMs)}`)
      }
      if (usage) {
        if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
          parts.push(`输入 ${usage.inputTokens} · 输出 ${usage.outputTokens}`)
        }
      }
      return parts.join(' · ')
    }

    // --- streaming SSE -----------------------------------------------------------

    function streamAnswer(req, onEvent) {
      return new Promise((resolve, reject) => {
        fetch(ANSWER_STREAM_PATH, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify(req),
        }).then(async (res) => {
          if (!res.ok || !res.body) {
            let data = {}
            try { data = await res.json() } catch { /* ignore */ }
            throw new Error(data.error || `HTTP ${res.status}`)
          }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let final = null
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let idx
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
              const raw = buffer.slice(0, idx)
              buffer = buffer.slice(idx + 2)
              for (const line of raw.split('\n')) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.slice(5).trim()
                if (!payload) continue
                let event
                try { event = JSON.parse(payload) } catch { continue }
                if (event.type === 'error') {
                  reject(new Error(event.error || 'stream error'))
                  return
                }
                if (event.type === 'done') {
                  final = event
                  onEvent(event)
                  resolve(final)
                  return
                }
                onEvent(event)
              }
            }
          }
          if (!final) {
            reject(new Error('stream ended unexpectedly'))
          }
        }).catch(reject)
      })
    }

    // --- rendering ------------------------------------------------------------

    function renderTranscript() {
      if (!panel || !discussion) return
      const messagesEl = panel.querySelector('[data-aiq-messages]')
      if (messagesEl) {
        messagesEl.innerHTML = ''
        for (const item of discussion.history) {
          appendMessage(messagesEl, item)
        }
        if (discussion.pending) {
          appendMessage(messagesEl, { role: 'user', text: discussion.pending.text })
        }
        if (discussion.thinking && !discussion.stream) {
          const note = el('div', S.thinking, t('thinking'))
          messagesEl.appendChild(note)
        }
        messagesEl.scrollTop = messagesEl.scrollHeight
      }
      const errorEl = panel.querySelector('[data-aiq-error]')
      if (errorEl) {
        errorEl.style.display = discussion.error ? 'block' : 'none'
        errorEl.textContent = discussion.error ? `${t('error')}: ${discussion.error}` : ''
      }
      const sendBtn = panel.querySelector('[data-aiq-send]')
      const ta = panel.querySelector('[data-aiq-input]')
      if (sendBtn) sendBtn.disabled = discussion.thinking || discussion.pending !== null
      if (ta) ta.disabled = discussion.thinking
    }

    function renderPanel() {
      if (panel) panel.remove()
      const p = el('div', S.panel)
      p.id = 'dsh-ask-in-sidebar-panel'
      p.setAttribute('role', 'dialog')
      p.setAttribute('aria-modal', 'false')
      p.setAttribute('aria-label', t('title'))

      const header = el('div', S.header)
      const title = el('h2', S.headerTitle, t('title'))
      const closeBtn = el('button', S.closeBtn, '×')
      closeBtn.type = 'button'
      closeBtn.setAttribute('aria-label', t('closeAria'))
      closeBtn.title = t('close')
      closeBtn.addEventListener('click', () => closePanel())
      header.appendChild(title)
      header.appendChild(closeBtn)
      p.appendChild(header)

      const quoteWrap = el('div', S.quoteWrap)
      const quoteLabel = el('div', S.quoteLabel, t('quote'))
      const quote = el('blockquote', S.quote, discussion && discussion.quote ? discussion.quote : t('quoteEmpty'))
      quoteWrap.appendChild(quoteLabel)
      quoteWrap.appendChild(quote)
      p.appendChild(quoteWrap)

      const messages = el('div', S.messages)
      messages.setAttribute('data-aiq-messages', '1')
      p.appendChild(messages)

      const error = el('div', S.error)
      error.setAttribute('data-aiq-error', '1')
      error.style.display = 'none'
      p.appendChild(error)

      const composer = el('div', S.composer)
      const ta = el('textarea', S.textarea)
      ta.setAttribute('data-aiq-input', '1')
      ta.placeholder = t('placeholder')
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          sendCurrentQuestion()
        }
      })
      const sendBtn = el('button', S.sendBtn, t('send'))
      sendBtn.type = 'button'
      sendBtn.setAttribute('data-aiq-send', '1')
      sendBtn.addEventListener('click', () => sendCurrentQuestion())
      composer.appendChild(ta)
      composer.appendChild(sendBtn)
      p.appendChild(composer)

      document.body.appendChild(p)
      panel = p
      renderTranscript()
      ta.focus()
    }

    // --- actions ----------------------------------------------------------------

    async function sendCurrentQuestion() {
      if (!discussion || !panel) return
      const ta = panel.querySelector('[data-aiq-input]')
      const question = ta ? ta.value.trim() : ''
      if (!question || discussion.thinking || discussion.pending) return
      const isFirst = discussion.history.length === 0
      const displayText = isFirst && discussion.quote
        ? `Quoted from the main conversation:\n"""\n${discussion.quote}\n"""\n\nQuestion: ${question}`
        : question

      discussion.pending = { role: 'user', text: displayText }
      discussion.thinking = true
      discussion.error = ''
      if (ta) ta.value = ''

      const req = {
        discussionId: discussion.id,
        sessionId: discussion.sessionId,
        quote: discussion.quote,
        question,
        history: discussion.history.map(item => ({ role: item.role, text: item.text })),
      }

      const streamNode = createStreamingAssistantNode()
      const streamState = {
        node: streamNode.node,
        details: streamNode.details,
        thoughtBody: streamNode.thoughtBody,
        answerEl: streamNode.answer,
        metaEl: streamNode.meta,
        reasoning: '',
        answer: '',
        startedAt: Date.now(),
        firstReasoningAt: null,
        firstTextAt: null,
        usage: null,
      }
      discussion.stream = streamState
      renderTranscript()
      const messagesEl = panel.querySelector('[data-aiq-messages]')
      messagesEl.appendChild(streamNode.node)
      messagesEl.scrollTop = messagesEl.scrollHeight

      const handleEvent = (event) => {
        if (!discussion || discussion.id !== req.discussionId || !discussion.stream) return
        if (event.type === 'start') {
          streamState.startedAt = event.startedAt || Date.now()
          streamState.metaEl.textContent = `${t('started')}: ${event.model || ''}`
          return
        }
        if (event.type === 'reasoning') {
          if (streamState.firstReasoningAt === null) streamState.firstReasoningAt = Date.now()
          streamState.reasoning += event.text || ''
          streamState.thoughtBody.textContent = streamState.reasoning || t('noThought')
          streamState.details.open = true
          return
        }
        if (event.type === 'text') {
          if (streamState.firstTextAt === null) streamState.firstTextAt = Date.now()
          streamState.answer += event.text || ''
          streamState.answerEl.innerHTML = renderMarkdown(streamState.answer)
          const now = Date.now()
          streamState.metaEl.textContent = `${t('thinking')} ${formatDurationMs(now - streamState.startedAt)}`
          streamNode.node.scrollIntoView({ block: 'nearest' })
          return
        }
        if (event.type === 'usage') {
          streamState.usage = event.usage || null
          return
        }
        if (event.type === 'done') {
          const durations = event.durations || {}
          streamState.usage = event.usage || streamState.usage
          streamState.answer = event.answer || streamState.answer
          streamState.reasoning = event.reasoning || streamState.reasoning
          const meta = metaLine(durations, streamState.usage)
          streamState.metaEl.textContent = meta
          streamState.thoughtBody.textContent = streamState.reasoning || t('noThought')
          streamState.answerEl.innerHTML = renderMarkdown(streamState.answer)
          return
        }
      }

      try {
        const final = await streamAnswer(req, handleEvent)
        if (!discussion || discussion.id !== req.discussionId) return
        const durations = final.durations || {}
        const meta = metaLine(durations, final.usage || null)
        discussion.history.push({ role: 'user', text: displayText })
        discussion.history.push({
          role: 'assistant',
          text: final.answer || streamState.answer,
          meta,
          reasoning: (final.reasoning || streamState.reasoning || '').trim(),
        })
        discussion.pending = null
        discussion.thinking = false
        discussion.stream = null
        discussion.error = ''
        renderTranscript()
        const ta2 = panel && panel.querySelector('[data-aiq-input]')
        if (ta2) ta2.focus()
      } catch (err) {
        if (!discussion || discussion.id !== req.discussionId) return
        discussion.pending = null
        discussion.thinking = false
        discussion.stream = null
        discussion.error = err && err.message ? err.message : String(err)
        renderTranscript()
      }
    }

    function closePanel() {
      if (discussion) {
        const id = discussion.id
        fetch(DISCARD_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ discussionId: id }),
        }).catch(() => { /* best-effort cleanup */ })
        discussion = null
      }
      if (panel) {
        panel.remove()
        panel = null
      }
      hideSelectionButton()
    }

    function startNewAsk(quote) {
      const sessionId = getCurrentSessionId()
      if (!sessionId) {
        console.warn('[dsh-ask-in-sidebar] no current session; cannot start an ask')
        return
      }
      closePanel()
      discussion = {
        id: randomId(),
        sessionId,
        quote: String(quote || '').trim(),
        history: [],
        pending: null,
        thinking: false,
        error: '',
        stream: null,
      }
      renderPanel()
    }

    // --- selection ---------------------------------------------------------------

    function hideSelectionButton() {
      if (selectionButton) {
        selectionButton.remove()
        selectionButton = null
      }
    }

    function inAssistantAnswer(node) {
      if (!node) return false
      const isText = node.nodeType === Node.TEXT_NODE
      const element = isText ? node.parentElement : node
      if (!element || typeof element.closest !== 'function') return false
      const flow = element.closest('[data-chat-flow-kind]')
      if (!flow) return false
      if (flow.getAttribute('data-chat-flow-kind') !== 'assistant-step') return false
      if (panel && panel.contains(element)) return false
      return true
    }

    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        hideSelectionButton()
        return
      }
      const text = sel.toString().trim()
      if (!text) {
        hideSelectionButton()
        return
      }
      const anchorOk = inAssistantAnswer(sel.anchorNode)
      const focusOk = inAssistantAnswer(sel.focusNode)
      if (!anchorOk && !focusOk) {
        hideSelectionButton()
        return
      }
      showSelectionButton(text, sel.getRangeAt(0))
    }

    function showSelectionButton(text, range) {
      hideSelectionButton()
      const btn = el('button', S.selectionButton, t('ask'))
      btn.id = 'dsh-ask-in-sidebar-selection-button'
      btn.type = 'button'
      const rect = range.getBoundingClientRect()
      const width = 170
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width))
      const below = rect.bottom + 8
      const top = below + 36 < window.innerHeight
        ? below
        : Math.max(12, rect.top - 36)
      btn.style.left = `${Math.round(left)}px`
      btn.style.top = `${Math.round(top)}px`
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', () => {
        startNewAsk(text)
        hideSelectionButton()
      })
      document.body.appendChild(btn)
      selectionButton = btn
    }

    // --- apply -----------------------------------------------------------------

    function ensurePanelStyle() {
      if (panelStyle && panelStyle.parentNode) return
      panelStyle = document.createElement('style')
      panelStyle.id = 'dsh-ask-in-sidebar-style'
      panelStyle.textContent = `
        #dsh-ask-in-sidebar-panel .markdown-body > :first-child { margin-top: 0; }
        #dsh-ask-in-sidebar-panel .markdown-body p { margin: 0 0 8px; }
        #dsh-ask-in-sidebar-panel .markdown-body h1,
        #dsh-ask-in-sidebar-panel .markdown-body h2,
        #dsh-ask-in-sidebar-panel .markdown-body h3,
        #dsh-ask-in-sidebar-panel .markdown-body h4 { margin: 12px 0 6px; font-size: 14px; line-height: 20px; }
        #dsh-ask-in-sidebar-panel .markdown-body ul,
        #dsh-ask-in-sidebar-panel .markdown-body ol { margin: 0 0 8px; padding-left: 20px; }
        #dsh-ask-in-sidebar-panel .markdown-body li { margin: 2px 0; }
        #dsh-ask-in-sidebar-panel .markdown-body blockquote { margin: 0 0 8px; padding: 2px 0 2px 10px; border-left: 3px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35)); color: var(--dsw-alias-label-secondary,#555); }
        #dsh-ask-in-sidebar-panel .markdown-body pre { margin: 0 0 8px; padding: 8px 10px; background: var(--dsw-alias-bg-subtle,rgba(128,128,128,.08)); border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 18px; }
        #dsh-ask-in-sidebar-panel .markdown-body code { background: var(--dsw-alias-bg-subtle,rgba(128,128,128,.1)); border-radius: 4px; padding: 1px 4px; font-size: 12px; }
        #dsh-ask-in-sidebar-panel .markdown-body pre code { background: transparent; padding: 0; }
        #dsh-ask-in-sidebar-panel .markdown-body table { border-collapse: collapse; margin: 0 0 8px; font-size: 12px; line-height: 18px; }
        #dsh-ask-in-sidebar-panel .markdown-body th,
        #dsh-ask-in-sidebar-panel .markdown-body td { border: 1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); padding: 4px 6px; text-align: left; }
        #dsh-ask-in-sidebar-panel .markdown-body a { color: var(--dsw-alias-accent-solid,#4f6bfe); }
        #dsh-ask-in-sidebar-panel .markdown-body hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2)); margin: 8px 0; }
      `
      document.head.appendChild(panelStyle)
    }

    function apply(ctx) {
      // Register an invisible shell-overlay entry so the client skeleton is a
      // valid slot-based DSH plugin. The real UI is a plain-DOM overlay; this
      // no-op entry is only the registration anchor required by the harness.
      if (ctx.slots && typeof ctx.slots.register === 'function') {
        ctx.effect(() => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-ask-in-sidebar',
          order: 999,
          locale: NS,
        }, function DshAskInSidebarOverlayNoop() {
          return null
        }), 'dsh-ask-in-sidebar: shell overlay noop')
      }

      sessionsSvc = ctx.get('sessions')
      if (!sessionsSvc) {
        ctx.inject(['sessions'], (sub) => {
          sessionsSvc = sub.sessions
        })
      }
      ctx.effect(() => {
        ensurePanelStyle()
        document.addEventListener('selectionchange', handleSelectionChange)
        const onScroll = () => hideSelectionButton()
        window.addEventListener('scroll', onScroll, true)
        return () => {
          document.removeEventListener('selectionchange', handleSelectionChange)
          window.removeEventListener('scroll', onScroll, true)
          hideSelectionButton()
          if (panel) {
            panel.remove()
            panel = null
          }
          if (discussion) {
            const id = discussion.id
            discussion = null
            fetch(DISCARD_PATH, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ discussionId: id }),
            }).catch(() => { /* best-effort cleanup */ })
          }
          if (panelStyle && panelStyle.parentNode) {
            panelStyle.parentNode.removeChild(panelStyle)
            panelStyle = null
          }
        }
      }, 'dsh-ask-in-sidebar: dom listeners')
    }

    return { apply, inject: ['slots'] }
  },
})
