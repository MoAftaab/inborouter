import React, { useState, useRef } from 'react'

const PAGE_SIZE = 20

function Toast({ message, type, onClose }) {
  if (!message) return null
  return (
    <div className={`toast toast-${type}`}>
      <span>{type === 'error' ? '❌' : '✅'}</span>
      {message}
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: 'auto', fontSize: 16 }}
      >
        ×
      </button>
    </div>
  )
}

function EmailTable({ emails, page, onPageChange }) {
  const total = emails.length
  const pageCount = Math.ceil(total / PAGE_SIZE)
  const start = page * PAGE_SIZE
  const slice = emails.slice(start, start + PAGE_SIZE)

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return d }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-header">
        <div>
          <div className="section-title">Raw Emails Preview</div>
          <div className="section-subtitle">{total} emails loaded · Page {page + 1} of {pageCount}</div>
        </div>
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>From Name</th>
                <th>From Email</th>
                <th>Subject</th>
                <th>Received At</th>
                <th>Thread ID</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((email, i) => (
                <tr key={email.email_id || email.id || `${email.thread_id}-${i}`}>
                  <td className="primary">{email.from_name || email.sender_name || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {email.from_email || email.sender_email || '—'}
                  </td>
                  <td className="primary" style={{ maxWidth: 200 }}>{email.subject || '—'}</td>
                  <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(email.received_at || email.date)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {(email.thread_id || email.id || '—').toString().slice(0, 12)}
                  </td>
                  <td style={{ maxWidth: 300, color: 'var(--text-muted)', fontSize: 12 }}>
                    {(email.body || email.preview || '').slice(0, 80)}{(email.body || email.preview || '').length > 80 ? '…' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="pagination">
          <button className="page-btn" onClick={() => onPageChange(0)} disabled={page === 0}>«</button>
          <button className="page-btn" onClick={() => onPageChange(page - 1)} disabled={page === 0}>‹</button>
          {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
            let p = i
            if (pageCount > 7) {
              const half = 3
              p = Math.max(0, Math.min(page - half + i, pageCount - 7 + i))
            }
            if (p >= pageCount) return null
            return (
              <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPageChange(p)}>
                {p + 1}
              </button>
            )
          })}
          <button className="page-btn" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount - 1}>›</button>
          <button className="page-btn" onClick={() => onPageChange(pageCount - 1)} disabled={page >= pageCount - 1}>»</button>
        </div>
      )}
    </div>
  )
}

export default function BatchTab({ apiUrl, candidateId, onIngestComplete, onIngestProgress }) {
  const [jsonText, setJsonText] = useState('')
  const [emails, setEmails] = useState([])
  const [page, setPage] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [routing, setRouting] = useState(false)
  const [routeProgress, setRouteProgress] = useState({
    status: 'idle',
    processed: 0,
    total: 0,
    percent: 0,
    currentRun: 0,
    totalRuns: 0,
  })
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState(null)
  const textareaRef = useRef(null)
  const progressRef = useRef(routeProgress)

  const publishProgress = (next) => {
    progressRef.current = next
    setRouteProgress(next)
    if (onIngestProgress) onIngestProgress(next)
  }

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }

  const handleTextChange = (val) => {
    setJsonText(val)
    setResult(null)
    setEmails([])
    if (!val.trim()) return
    try {
      const parsed = JSON.parse(val)
      const arr = Array.isArray(parsed) ? parsed : (parsed.emails || parsed.data || [])
      if (Array.isArray(arr) && arr.length > 0) {
        setEmails(arr)
        setPage(0)
      }
    } catch {
      // not valid JSON yet — user is still typing
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setResult(null)
    try {
      const res = await fetch(`${apiUrl}/api/generate-emails`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data.emails || data.data || data)
      const text = JSON.stringify(Array.isArray(arr) ? arr : data, null, 2)
      setJsonText(text)
      setEmails(Array.isArray(arr) ? arr : [])
      setPage(0)
      showToast(`${Array.isArray(arr) ? arr.length : '?'} sample emails generated!`, 'success')
    } catch (err) {
      showToast(`Failed to generate: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleRoute = async () => {
    if (!jsonText.trim()) {
      showToast('Please paste or generate emails first.')
      return
    }

    let payload
    try {
      payload = JSON.parse(jsonText)
    } catch {
      showToast('Invalid JSON! Please check your input.')
      return
    }

    setRouting(true)
    setResult(null)
    try {
      const allEmails = Array.isArray(payload) ? payload : (payload.emails || payload.data || [payload])
      const totalRuns = Math.ceil(allEmails.length / 100)
      const aggregate = { total: allEmails.length, processed: 0, tasks_created: 0, tasks_updated: 0, skipped: 0, errors: [], run_ids: [] }

      publishProgress({ status: 'running', processed: 0, total: allEmails.length, percent: 0, currentRun: 0, totalRuns })

      // The API intentionally caps a synchronous ingest at 100 emails. The
      // sample generator creates 250, so the UI routes it as bounded batches.
      for (let start = 0; start < allEmails.length; start += 100) {
        const batch = allEmails.slice(start, start + 100)
        const runNumber = Math.floor(start / 100) + 1
        const clientRunId = `ui_run_${Date.now()}_${start}_${Math.random().toString(36).slice(2, 8)}`
        let polling = true

        const pollProgress = async () => {
          while (polling) {
            try {
              const statusRes = await fetch(
                `${apiUrl}/api/ingest/${encodeURIComponent(clientRunId)}?candidate_id=${encodeURIComponent(candidateId)}`
              )
              if (statusRes.ok) {
                const status = await statusRes.json()
                const processed = Math.min(allEmails.length, start + Number(status.processed || 0))
                publishProgress({
                  status: status.status || 'running',
                  processed,
                  total: allEmails.length,
                  percent: allEmails.length ? Math.round((processed / allEmails.length) * 100) : 100,
                  currentRun: runNumber,
                  totalRuns,
                })
                if (status.status === 'completed') break
              }
            } catch {
              // The ingest request may not have inserted its run row yet.
            }
            if (polling) await wait(500)
          }
        }

        const pollPromise = pollProgress()
        try {
          const res = await fetch(`${apiUrl}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate_id: candidateId,
              run_id: clientRunId,
              emails: batch,
            }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
          const data = await res.json()
          aggregate.processed += Number(data.processed || 0)
          aggregate.tasks_created += Number(data.tasks_created || 0)
          aggregate.tasks_updated += Number(data.tasks_updated || 0)
          aggregate.skipped += Number(data.skipped || 0)
          aggregate.errors.push(...(data.errors || []))
          if (data.run_id) aggregate.run_ids.push(data.run_id)

          const processed = Math.min(allEmails.length, start + batch.length)
          publishProgress({
            status: 'running',
            processed,
            total: allEmails.length,
            percent: allEmails.length ? Math.round((processed / allEmails.length) * 100) : 100,
            currentRun: runNumber,
            totalRuns,
          })
        } finally {
          polling = false
          await pollPromise
        }
      }

      setResult(aggregate)
      if (onIngestComplete) onIngestComplete(aggregate.run_ids)
      publishProgress({ status: 'completed', processed: allEmails.length, total: allEmails.length, percent: 100, currentRun: totalRuns, totalRuns })
      showToast('Emails routed successfully!', 'success')
    } catch (err) {
      publishProgress({ ...progressRef.current, status: 'error' })
      showToast(`Routing failed: ${err.message}`)
    } finally {
      setRouting(false)
    }
  }

  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-title">Batch Email Router</div>
          <div className="section-subtitle">Paste inbox JSON or generate samples, then route them</div>
        </div>
      </div>

      {/* TEXTAREA */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 0 }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            inbox.json
          </span>
          {jsonText && (
            <button
              onClick={() => { setJsonText(''); setEmails([]); setResult(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
            >
              ✕ Clear
            </button>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="dark-textarea"
          rows={10}
          placeholder={'Paste inbox.json emails here...\n\nExpected format: [{\"thread_id\": \"...\", \"subject\": \"...\", \"from_email\": \"...\", \"body\": \"...\"}, ...]'}
          value={jsonText}
          onChange={(e) => handleTextChange(e.target.value)}
        />

        {/* BUTTONS */}
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            className="btn-outline"
            onClick={handleGenerate}
            disabled={generating || routing}
          >
            {generating ? <span className="spinner" style={{ borderTopColor: 'var(--primary-400)', borderColor: 'rgba(168,85,247,0.3)' }} /> : '✨'}
            Generate 250 Samples
          </button>

          <button
            className="btn-primary"
            onClick={handleRoute}
            disabled={routing || generating || !jsonText.trim()}
          >
            {routing ? <span className="spinner" /> : '⚡'}
            Route Emails
          </button>

          {routing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span className="spinner-purple" />
              Processing emails via AI router…
            </div>
          )}
        </div>

        {/* ROUTING PROGRESS */}
        {routing && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Batch {routeProgress.currentRun} of {routeProgress.totalRuns}</span>
              <span>{routeProgress.percent}% complete</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${routeProgress.percent}%`, transition: 'width 300ms ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* RESULT SUMMARY */}
      {result && (
        <div className="result-summary" style={{ marginTop: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            🎉 Routing Complete
          </span>
          <div className="result-pill result-created">
            ✅ {result.created ?? result.tasks_created ?? 0} created
          </div>
          <div className="result-pill result-updated">
            🔄 {result.updated ?? result.tasks_updated ?? 0} updated
          </div>
          <div className="result-pill result-skipped">
            ⏭️ {result.skipped ?? result.emails_skipped ?? 0} skipped
          </div>
          {result.total && (
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {result.total} total
            </div>
          )}
        </div>
      )}

      {/* EMAIL PREVIEW TABLE */}
      {emails.length > 0 && !routing && (
        <EmailTable emails={emails} page={page} onPageChange={setPage} />
      )}

      {emails.length === 0 && !jsonText && (
        <div className="glass-card" style={{ marginTop: 20 }}>
          <div className="empty-state">
            <div className="empty-state-icon">📥</div>
            <div className="empty-state-text">
              Click <strong>Generate 250 Samples</strong> to fetch sample emails,<br />
              or paste your own <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>inbox.json</code> above.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
