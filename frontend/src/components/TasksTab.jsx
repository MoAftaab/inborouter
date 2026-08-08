import React, { useEffect, useState, useCallback } from 'react'

const FILTERS = [
  { key: 'all',           label: 'All' },
  { key: 'enterprise_rfp', label: 'Enterprise RFP' },
  { key: 'smb_enquiry',   label: 'SMB' },
  { key: 'marketing',     label: 'Marketing' },
  { key: 'alliances',     label: 'Alliances' },
  { key: 'finance',       label: 'Finance' },
  { key: 'triage',        label: 'Triage' },
  { key: 'skipped',       label: 'Skipped' },
  { key: 'unassigned',    label: 'Unassigned' },
  { key: 'high_priority', label: 'High priority' },
  { key: 'low_confidence', label: 'Low confidence' },
]

const ASSIGNEE_NAMES = {
  u_aarti: 'Aarti Menon',
  u_rohit: 'Rohit Sharma',
  u_meera: 'Meera Iyer',
  u_karan: 'Karan Doshi',
  u_divya: 'Divya Rao',
  u_triage: 'Triage Queue',
}

function getPriorityClass(p) {
  if (!p) return 'priority-low'
  const l = p.toLowerCase()
  if (l === 'high')   return 'priority-high'
  if (l === 'medium') return 'priority-medium'
  return 'priority-low'
}

function getConfClass(conf) {
  const n = Number(conf) || 0
  if (n > 80) return 'conf-high'
  if (n > 50) return 'conf-medium'
  return 'conf-low'
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getAssigneeName(task) {
  return task.assignee || task.assigned_to || ASSIGNEE_NAMES[task.assignee_id] || 'Unassigned'
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

function TaskCard({ task, index, onSelect }) {
  const cat = task.category || 'triage'
  const isSkipped = cat === 'skipped' || task.skipped === true || task.status === 'skipped'
  const confidence = task.confidence !== undefined
    ? Math.round(Number(task.confidence) * (task.confidence <= 1 ? 100 : 1))
    : null
  const assigneeName = getAssigneeName(task)
  const lowConfidence = confidence !== null && confidence < 50

  return (
    <div
      className={`glass-card task-card ${cat} stagger-${(index % 5) + 1}`}
      style={{ animationDelay: `${index * 0.04}s`, cursor: onSelect ? 'pointer' : 'default' }}
      onClick={() => onSelect?.(task)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect?.(task) }}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="task-card-header">
        <div className="task-badges">
          <span className={`badge badge-${cat}`}>{cat.replace(/_/g, ' ')}</span>
          {task.priority && !isSkipped && (
            <span className={`priority-badge ${getPriorityClass(task.priority)}`}>
              {task.priority}
            </span>
          )}
        </div>
        {confidence !== null && !isSkipped && (
          <span className={`confidence-badge ${getConfClass(confidence)}`}>
            {confidence}%
          </span>
        )}
      </div>

      <div className="task-title">{task.title || task.subject || 'Untitled'}</div>

      {isSkipped ? (
        <div className="skip-reason">
          🚫 {task.skip_reason || task.reason || 'Skipped — no action required'}
        </div>
      ) : (
        <div className="task-desc">
          {task.description || task.body_preview || task.body || '—'}
        </div>
      )}

      {!isSkipped && (
        <div className="task-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="assignee-circle">
              {getInitials(assigneeName)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {assigneeName}
            </span>
          </div>
          <div className="task-due">
            📅 {fmtDate(task.due_date)}
          </div>
        </div>
      )}

      {!isSkipped && (task.company_name || (task.deal_value_inr !== null && task.deal_value_inr !== undefined) || lowConfidence) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          {task.company_name && <span>{task.company_name}</span>}
          {task.deal_value_inr !== null && task.deal_value_inr !== undefined && (
            <span>₹{Number(task.deal_value_inr).toLocaleString('en-IN')}</span>
          )}
          {lowConfidence && <span style={{ color: '#f87171' }}>⚠ Review: low confidence</span>}
        </div>
      )}

      {!isSkipped && (task.source_email_id || task.thread_id) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          {task.source_email_id && <span title="Source email ID">email: {task.source_email_id}</span>}
          {task.thread_id && <span title="Thread ID">thread: {task.thread_id}</span>}
        </div>
      )}
    </div>
  )
}

export default function TasksTab({ apiUrl, candidateId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedTask, setSelectedTask] = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `${apiUrl}/api/tasks?candidate_id=${candidateId}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setTasks(data)
      } else {
        const taskRows = data.tasks || data.items || []
        const skippedRows = (data.skipped || []).map(email => ({
          ...email,
          category: 'skipped',
          status: 'skipped',
          title: email.email_id,
        }))
        setTasks([...taskRows, ...skippedRows])
      }
    } catch (err) {
      setError(err.message)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [apiUrl, candidateId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const isUnassigned = (task) => {
    const skipped = task.category === 'skipped' || task.skipped === true || task.status === 'skipped'
    return !skipped && !task.assignee_id && !task.assignee && !task.assigned_to
  }
  const filteredTasks = tasks.filter(task => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'skipped') return task.category === 'skipped' || task.skipped === true || task.status === 'skipped'
    if (activeFilter === 'unassigned') return isUnassigned(task)
    if (activeFilter === 'high_priority') return task.priority === 'high'
    if (activeFilter === 'low_confidence') {
      const confidence = task.confidence === undefined ? null : Number(task.confidence) * (Number(task.confidence) <= 1 ? 100 : 1)
      return confidence !== null && confidence < 50
    }
    return task.category === activeFilter
  })

  const filterCount = (key) => tasks.filter(task => {
    if (key === 'all') return true
    if (key === 'skipped') return task.category === 'skipped' || task.skipped === true || task.status === 'skipped'
    if (key === 'unassigned') return isUnassigned(task)
    if (key === 'high_priority') return task.priority === 'high'
    if (key === 'low_confidence') {
      const confidence = task.confidence === undefined ? null : Number(task.confidence) * (Number(task.confidence) <= 1 ? 100 : 1)
      return confidence !== null && confidence < 50
    }
    return task.category === key
  }).length

  const skippedReasonCounts = tasks
    .filter(task => task.category === 'skipped' || task.skipped === true || task.status === 'skipped')
    .reduce((counts, task) => {
      const reason = task.skip_reason || 'other'
      counts[reason] = (counts[reason] || 0) + 1
      return counts
    }, {})

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="section-title">Tasks</div>
          <div className="section-subtitle">
            {loading ? 'Loading…' : `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''} shown`}
          </div>
        </div>
        <button
          className="btn-outline"
          onClick={fetchTasks}
          disabled={loading}
          style={{ padding: '8px 16px', fontSize: 12 }}
        >
          {loading ? <span className="spinner" style={{ borderTopColor: 'var(--primary-400)', borderColor: 'rgba(168,85,247,0.3)' }} /> : '↻ Refresh'}
        </button>
      </div>

      {/* FILTER PILLS */}
      <div className="filter-pills">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`filter-pill${activeFilter === f.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
            {f.key !== 'all' && tasks.length > 0 && (() => {
              const count = filterCount(f.key)
              return count > 0 ? (
                <span style={{
                  marginLeft: 4,
                  background: 'rgba(168,85,247,0.2)',
                  color: 'var(--primary-400)',
                  borderRadius: 999,
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {count}
                </span>
              ) : null
            })()}
          </button>
        ))}
      </div>

      {Object.keys(skippedReasonCounts).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Skipped by reason:</span>
          {Object.entries(skippedReasonCounts).map(([reason, count]) => (
            <span key={reason} className="stat-pill">{reason.replace(/_/g, ' ')} <strong>{count}</strong></span>
          ))}
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8,
          color: '#f87171',
          fontSize: 13,
          marginBottom: 16,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="empty-state">
          <div className="spinner-purple" />
          <div className="empty-state-text">Loading tasks…</div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">
            {activeFilter === 'all'
              ? 'No tasks found. Process some emails in the Batch tab first.'
              : `No ${activeFilter.replace(/_/g, ' ')} tasks found.`}
          </div>
        </div>
      ) : (
        <div className="tasks-grid">
          {filteredTasks.map((task, i) => (
            <TaskCard key={`${task.id || task.task_id || task.thread_id || 'task'}-${i}`} task={task} index={i} onSelect={setSelectedTask} />
          ))}
        </div>
      )}

      {selectedTask && (
        <div
          role="presentation"
          onClick={() => setSelectedTask(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Task details"
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(520px, 100%)', height: '100%', overflowY: 'auto', padding: 24, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)' }}
          >
            <div className="section-header">
              <div>
                <div className="section-title">Task details</div>
                <div className="section-subtitle">Review the routing decision and source metadata</div>
              </div>
              <button className="btn-outline" onClick={() => setSelectedTask(null)} style={{ padding: '6px 10px' }}>Close</button>
            </div>

            <div className="glass-card" style={{ padding: 18 }}>
              <div className="task-badges" style={{ marginBottom: 12 }}>
                <span className={`badge badge-${selectedTask.category || 'triage'}`}>{(selectedTask.category || 'triage').replace(/_/g, ' ')}</span>
                {selectedTask.priority && <span className={`priority-badge ${getPriorityClass(selectedTask.priority)}`}>{selectedTask.priority}</span>}
                {selectedTask.confidence !== undefined && (
                  <span className={`confidence-badge ${getConfClass(Number(selectedTask.confidence) * (Number(selectedTask.confidence) <= 1 ? 100 : 1))}`}>
                    {Math.round(Number(selectedTask.confidence) * (Number(selectedTask.confidence) <= 1 ? 100 : 1))}% confidence
                  </span>
                )}
              </div>
              <div className="task-title">{selectedTask.title || selectedTask.subject || 'Untitled'}</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{selectedTask.description || selectedTask.llm_reasoning || 'No explanation stored.'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, fontSize: 12 }}>
                <div><div className="metric-label">Assignee</div><div>{getAssigneeName(selectedTask)}</div></div>
                <div><div className="metric-label">Due date</div><div>{fmtDate(selectedTask.due_date)}</div></div>
                <div><div className="metric-label">Company</div><div>{selectedTask.company_name || 'Not detected'}</div></div>
                <div><div className="metric-label">Deal value</div><div>{selectedTask.deal_value_inr !== null && selectedTask.deal_value_inr !== undefined ? `₹${Number(selectedTask.deal_value_inr).toLocaleString('en-IN')}` : 'Not stated'}</div></div>
                <div><div className="metric-label">Source email</div><div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{selectedTask.source_email_id || '—'}</div></div>
                <div><div className="metric-label">Thread</div><div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{selectedTask.thread_id || '—'}</div></div>
              </div>
              {selectedTask.skip_reason && <div className="skip-reason" style={{ marginTop: 16 }}>No task created: {selectedTask.skip_reason}</div>}
              {selectedTask.llm_reasoning && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>Full routing reasoning</summary><p style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6 }}>{selectedTask.llm_reasoning}</p></details>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
