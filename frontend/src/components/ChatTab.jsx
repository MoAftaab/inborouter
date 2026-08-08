import React, { useState, useRef, useEffect, useCallback } from 'react'

const PRESET_QUESTIONS = [
  'How many RFPs?',
  'Show triage items',
  'Spurious rate?',
  'High priority tasks?',
  'Which emails were skipped?',
  'Finance summary',
]

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function hasZeroValues(data) {
  if (!data || typeof data !== 'object') return false
  return Object.values(data).some(v => v === 0 || v === '0')
}

function SupportingData({ data }) {
  if (!data) return null

  return (
    <details className="supporting-data">
      <summary>
        <span className="supporting-data-title">Supporting data</span>
        <span className="supporting-data-action">View JSON</span>
      </summary>
      <pre>
        {JSON.stringify(data, null, 2)
          .split('\n')
          .map((line, i) => (
            <span key={i}>
              {line}
              {'\n'}
            </span>
          ))}
      </pre>
      {hasZeroValues(data) && (
        <div className="supporting-data-flags">
          {Object.entries(data)
            .filter(([, v]) => v === 0 || v === '0')
            .map(([k]) => (
              <span className="supporting-data-flag" key={k}>
                {k}: 0
              </span>
            ))}
        </div>
      )}
    </details>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  const isOutOfScope = msg.out_of_scope === true || msg.is_out_of_scope === true
  const content = msg.content || msg.answer || msg.response
  const hasSupportingData = Boolean(msg.supporting_data)

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="chat-avatar" aria-hidden="true">*</div>}
      <div className={`chat-message-body${hasSupportingData ? ' has-supporting-content' : ''}`}>
        <div className={`${isUser ? 'chat-bubble user' : isOutOfScope ? 'chat-bubble out-of-scope' : 'chat-bubble ai'}${hasSupportingData ? ' has-supporting-data' : ''}`}>
          {isOutOfScope && <span className="out-of-scope-icon" aria-hidden="true">!</span>}
          <span>{content}</span>
          {hasSupportingData && <SupportingData data={msg.supporting_data} />}
        </div>
        <div className="chat-meta">{isUser ? 'You' : 'InboxRouter AI'} - {formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="chat-message assistant typing-row">
      <div className="chat-avatar" aria-hidden="true">*</div>
      <div className="chat-message-body">
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </div>
  )
}

const WELCOME_MSG = {
  role: 'ai',
  content: 'Hi! I\'m your InboxRouter AI assistant. Ask me anything about your processed emails, tasks, routing statistics, or performance metrics.',
  timestamp: new Date().toISOString(),
}

export default function ChatTab({ apiUrl, candidateId, runIds = [], runHistory = [] }) {
  const [messages, setMessages] = useState([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [scopeMode, setScopeMode] = useState('latest')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const latestRunIds = runIds.length > 0 ? runIds : (runHistory[0]?.run_id ? [runHistory[0].run_id] : [])
  const activeRunIds = scopeMode === 'all'
    ? []
    : scopeMode === 'latest'
      ? latestRunIds
      : [scopeMode]

  useEffect(() => {
    setScopeMode('latest')
  }, [runIds.join('|')])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  const sendMessage = useCallback(async (query) => {
    const q = query || input.trim()
    if (!q || loading) return

    const userMsg = { role: 'user', content: q, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          query: q,
          ...(scopeMode !== 'all' ? { run_ids: activeRunIds } : {}),
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      const data = await res.json()
      const aiMsg = {
        role: 'ai',
        content: data.answer || data.response || data.message || JSON.stringify(data),
        supporting_data: data.supporting_data || data.data || null,
        out_of_scope: data.out_of_scope || data.is_out_of_scope || false,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Sorry, I encountered an error: ${err.message}`,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [apiUrl, candidateId, input, loading, scopeMode, activeRunIds])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="glass-card chat-container">
      <div className="chat-header">
        <div className="chat-header-icon" aria-hidden="true">*</div>
        <div className="chat-header-copy">
          <div className="chat-header-title">Routing assistant</div>
          <div className="chat-header-subtitle"><span className="chat-status-dot" /> Grounded in your processed email data</div>
        </div>
        <div className="chat-header-badge">AI insights</div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-scope-bar">
          <div className="chat-scope-copy">
            <span className="chat-scope-kicker">Data scope</span>
            <span>
              {scopeMode === 'all'
                ? 'All processed history'
                : scopeMode === 'latest'
                  ? (latestRunIds.length > 0 ? `Latest batch - ${latestRunIds.length} ingest run${latestRunIds.length === 1 ? '' : 's'}` : 'No batch selected')
                  : `Selected batch - ${scopeMode}`}
            </span>
          </div>
          {runHistory.length > 0 && (
            <select
              className="dark-input chat-scope-select"
              value={scopeMode}
              onChange={(event) => setScopeMode(event.target.value)}
              aria-label="Chat batch scope"
            >
              <option value="latest">Latest routed batch</option>
              <option value="all">All processed history</option>
              {runHistory.map((run) => (
                <option key={run.run_id} value={run.run_id}>
                  {run.run_id} ({run.processed || 0} processed)
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="chat-presets">
          {PRESET_QUESTIONS.map((q) => (
            <button
              key={q}
              className="preset-chip"
              onClick={() => sendMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="chat-input-row">
          <input
            ref={inputRef}
            type="text"
            className="dark-input"
            placeholder="Ask about your emails, tasks, or routing stats..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            title="Send message"
          >
            {loading ? (
              <span className="spinner" style={{ width: 16, height: 16 }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <div className="chat-input-hint">Press Enter to send · Your questions are scoped to the selected batch</div>
      </div>
    </div>
  )
}
