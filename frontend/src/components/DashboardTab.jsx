import React, { useEffect, useState, useCallback } from 'react'

const CATEGORIES = [
  { key: 'enterprise_rfp', label: 'Enterprise RFP', color: '#3b82f6' },
  { key: 'smb_enquiry',    label: 'SMB Enquiry',    color: '#10b981' },
  { key: 'marketing',      label: 'Marketing',      color: '#ec4899' },
  { key: 'alliances',      label: 'Alliances',      color: '#8b5cf6' },
  { key: 'finance',        label: 'Finance',         color: '#f97316' },
  { key: 'triage',         label: 'Triage',          color: '#f59e0b' },
]

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!value) { setDisplay(0); return }
    const target = Number(value) || 0
    const duration = 600
    const steps = 30
    const step = target / steps
    let current = 0
    const timer = setInterval(() => {
      current += step
      if (current >= target) {
        setDisplay(target)
        clearInterval(timer)
      } else {
        setDisplay(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])

  return <>{display.toLocaleString()}</>
}

export default function DashboardTab({ apiUrl, candidateId, stats }) {
  const [tasks, setTasks] = useState([])
  const [taskLoading, setTaskLoading] = useState(false)

  const fetchTasks = useCallback(async () => {
    setTaskLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/tasks?candidate_id=${candidateId}&limit=5`)
      if (!res.ok) throw new Error('Tasks fetch failed')
      const data = await res.json()
      setTasks(Array.isArray(data) ? data.slice(0, 5) : (data.tasks || []).slice(0, 5))
    } catch {
      setTasks([])
    } finally {
      setTaskLoading(false)
    }
  }, [apiUrl, candidateId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const metrics = [
    {
      icon: '📨',
      label: 'Total Processed',
      value: stats?.processed ?? 0,
      colorClass: 'blue',
    },
    {
      icon: '✅',
      label: 'Tasks Created',
      value: stats?.tasks_created ?? 0,
      colorClass: 'green',
    },
    {
      icon: '🔄',
      label: 'Tasks Updated',
      value: stats?.tasks_updated ?? 0,
      colorClass: 'amber',
    },
    {
      icon: '⏭️',
      label: 'Emails Skipped',
      value: stats?.skipped ?? 0,
      colorClass: 'red',
    },
    {
      icon: 'ðŸš©',
      label: 'Spurious Flagged',
      value: stats?.spurious_flagged ?? 0,
      colorClass: 'amber',
    },
  ]

  const catBreakdown = stats?.by_category || {}

  const getPriorityClass = (p) => {
    if (!p) return 'priority-low'
    const lower = p.toLowerCase()
    if (lower === 'high')   return 'priority-high'
    if (lower === 'medium') return 'priority-medium'
    return 'priority-low'
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
    } catch { return '—' }
  }

  return (
    <div>
      {/* METRIC CARDS */}
      <div className="metrics-grid">
        {metrics.map((m, i) => (
          <div key={m.label} className={`glass-card metric-card stagger-${i + 1}`}>
            <div className="metric-icon">{m.icon}</div>
            <div className="metric-label">{m.label}</div>
            <div className={`metric-value ${m.colorClass}`}>
              <AnimatedNumber value={m.value} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* CATEGORY BREAKDOWN */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title">Category Breakdown</div>
              <div className="section-subtitle">Routing distribution across categories</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Count</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => {
                  const count = catBreakdown[cat.key] ?? 0
                  const total = Object.values(catBreakdown).reduce((a, b) => a + b, 0) || 1
                  const pct = ((count / total) * 100).toFixed(1)
                  return (
                    <tr key={cat.key}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="color-dot" style={{ background: cat.color }} />
                          <span className={`badge badge-${cat.key}`}>{cat.label}</span>
                        </div>
                      </td>
                      <td className="primary">{count.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            height: 4,
                            width: 80,
                            background: 'var(--border-subtle)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: cat.color,
                              borderRadius: 2,
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 34 }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RECENT TASKS */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-title">Recent Tasks</div>
              <div className="section-subtitle">Latest 5 processed items</div>
            </div>
            <button
              className="btn-outline"
              style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={fetchTasks}
              disabled={taskLoading}
            >
              {taskLoading ? <span className="spinner" /> : '↻ Refresh'}
            </button>
          </div>

          {taskLoading ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="spinner-purple" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">No tasks yet. Process some emails to get started.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tasks.map((task, i) => (
                <div
                  key={task.id || task.task_id || i}
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    animation: `fadeSlideUp 0.3s ease ${i * 0.06}s both`,
                  }}
                >
                  <div
                    className="assignee-circle"
                    style={{ flexShrink: 0 }}
                  >
                    {getInitials(task.assignee || task.assigned_to || 'U')}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {task.title || task.subject || 'Untitled Task'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {task.category && (
                        <span className={`badge badge-${task.category}`}>
                          {task.category.replace(/_/g, ' ')}
                        </span>
                      )}
                      {task.priority && (
                        <span className={`priority-badge ${getPriorityClass(task.priority)}`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {fmtDate(task.due_date || task.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div className="section-title">Skipped by reason</div>
          <div className="section-subtitle" style={{ marginBottom: 14 }}>Why the router did not create a task</div>
          {Object.keys(stats?.by_skip_reason || {}).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No skipped emails yet.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(stats.by_skip_reason).map(([reason, count]) => (
                <div key={reason} className="stat-pill">
                  {reason.replace(/_/g, ' ')} <strong>{Number(count).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div className="section-title">Recent ingest runs</div>
          <div className="section-subtitle" style={{ marginBottom: 12 }}>Batch-level processing history</div>
          {(stats?.by_run || []).slice(0, 4).map((run) => (
            <div key={run.run_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 11 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.run_id}</span>
              <span style={{ color: run.finished_at ? 'var(--accent-green)' : '#fbbf24', whiteSpace: 'nowrap' }}>{run.processed}/{run.total || '—'}</span>
            </div>
          ))}
          {(stats?.by_run || []).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No ingest runs yet.</div>}
        </div>
      </div>

      {/* SYSTEM STATUS */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            System Status
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--accent-green)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-green)',
              boxShadow: '0 0 6px var(--accent-green)',
              animation: 'pulse 2s infinite',
            }} />
            API Connected
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {apiUrl}
          </div>
        </div>
      </div>
    </div>
  )
}
