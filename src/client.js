// dsh-ask-in-sidebar: CLIENT half.
//
// Plain-DOM, no-build browser plugin:
//   - shows a floating "Ask in Sidebar" button when text is selected inside an
//     assistant answer ([data-chat-flow-kind="assistant-step"]);
//   - opens an ephemeral right-side panel with the quote, a question composer,
//     and a running discussion transcript;
//   - sends each question to the host answer endpoint and renders the reply;
//   - never writes to the main conversation; closing the panel discards the
//     in-memory discussion and tells the host to drop its snapshot.
window.__ModuleLoader__.load({
  id: 'dsh-ask-in-sidebar',
  factory: () => {
    const NS = 'dsh-ask-in-sidebar'
    const ANSWER_PATH = '/__dsh-ask-in-sidebar/answer'
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
        close: '关闭',
        closeAria: '关闭侧边栏讨论',
        error: '出错了',
        empty: '请输入问题。',
      },
      en: {
        ask: 'Ask in Sidebar',
        title: 'Ask in Sidebar',
        quote: 'Quote',
        quoteEmpty: '(no quote)',
        placeholder: 'Ask a question…',
        send: 'Send',
        thinking: 'Thinking…',
        close: 'Close',
        closeAria: 'Close sidebar discussion',
        error: 'Error',
        empty: 'Please enter a question.',
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
        'width:min(420px,94vw)', 'z-index:2147483000',
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
        'max-width:96%', 'padding:8px 10px', 'border-radius:10px', 'font-size:13px', 'line-height:20px',
        'white-space:pre-wrap', 'word-break:break-word',
      ].join(';'),
      msgUser: [
        'align-self:flex-end', 'background:var(--dsw-alias-bg-accent-soft,rgba(79,107,254,.12))',
        'color:var(--dsw-alias-label-primary,#1f1f1f)',
      ].join(';'),
      msgAssistant: [
        'align-self:flex-start', 'background:var(--dsw-alias-bg-subtle,rgba(128,128,128,.07))',
        'color:var(--dsw-alias-label-primary,#1f1f1f)',
      ].join(';'),
      msgRole: 'display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#8a8a8e);margin-bottom:2px;',
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

    // --- rendering ------------------------------------------------------------

    function el(tag, style, text) {
      const node = document.createElement(tag)
      if (style) node.style.cssText = style
      if (text !== undefined) node.textContent = text
      return node
    }

    function appendMessage(container, role, text) {
      const node = el('div', `${S.msg}${role === 'assistant' ? S.msgAssistant : S.msgUser}`)
      const roleLabel = el('span', S.msgRole, role === 'assistant' ? 'Assistant' : 'You')
      const body = el('div', '', text)
      roleLabel.style.display = 'block'
      node.appendChild(roleLabel)
      node.appendChild(body)
      container.appendChild(node)
    }

    function renderTranscript() {
      if (!panel || !discussion) return
      const messagesEl = panel.querySelector('[data-aiq-messages]')
      if (messagesEl) {
        messagesEl.innerHTML = ''
        for (const item of discussion.history) {
          appendMessage(messagesEl, item.role, item.text)
        }
        if (discussion.pending) {
          appendMessage(messagesEl, 'user', discussion.pending.text)
        }
        if (discussion.thinking) {
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

    function sendCurrentQuestion() {
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
      renderTranscript()

      const req = {
        discussionId: discussion.id,
        sessionId: discussion.sessionId,
        quote: discussion.quote,
        question,
        history: discussion.history.map(item => ({ role: item.role, text: item.text })),
      }

      fetch(ANSWER_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      }).then(async (res) => {
        let data = {}
        try { data = await res.json() } catch { /* keep {} */ }
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
        return data.answer
      }).then((answer) => {
        if (!discussion || discussion.id !== req.discussionId) return
        discussion.history.push({ role: 'user', text: displayText })
        discussion.history.push({ role: 'assistant', text: answer })
        discussion.pending = null
        discussion.thinking = false
        discussion.error = ''
        renderTranscript()
        const ta2 = panel && panel.querySelector('[data-aiq-input]')
        if (ta2) ta2.focus()
      }).catch((err) => {
        if (!discussion || discussion.id !== req.discussionId) return
        discussion.pending = null
        discussion.thinking = false
        discussion.error = err && err.message ? err.message : String(err)
        renderTranscript()
      })
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
        }
      }, 'dsh-ask-in-sidebar: dom listeners')
    }

    return { apply, inject: ['slots'] }
  },
})
