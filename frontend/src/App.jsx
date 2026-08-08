import React, { useState, useEffect, useCallback } from 'react'
import DashboardTab from './components/DashboardTab.jsx'
import BatchTab from './components/BatchTab.jsx'
import TasksTab from './components/TasksTab.jsx'
import ChatTab from './components/ChatTab.jsx'
import TestsTab from './components/TestsTab.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
// This value must match the candidate_id submitted to the grader and stored by
// the backend. It is configurable for deployment but has the repo's canonical
// value as a safe local default.
const CANDIDATE_ID = (import.meta.env.VITE_CANDIDATE_ID || 'moaftaab786@gmail.com').trim().toLowerCase()

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'batch',     label: '⚡ Batch' },
  { id: 'tasks',     label: '📋 Tasks' },
  { id: 'chat',      label: '💬 Chat' },
  { id: 'tests',     label: '🧪 Tests' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [stats, setStats] = useState({
    processed: 0,
    tasks_created: 0,
    tasks_updated: 0,
    skipped: 0,
    by_category: {},
    last_updated: null,
  })
  const [statsLoading, setStatsLoading] = useState(false)
  const [chatRunIds, setChatRunIds] = useState([])
  const [ingestProgress, setIngestProgress] = useState({
    status: 'idle',
    processed: 0,
    total: 0,
    percent: 0,
  })

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/stats?candidate_id=${CANDIDATE_ID}`)
      if (!res.ok) throw new Error('Stats fetch failed')
      const data = await res.json()
      setStats(data)
    } catch {
      // silently fail — backend may not be running yet
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const handleIngestComplete = useCallback((runIds = []) => {
    setChatRunIds(Array.isArray(runIds) ? runIds : [])
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  const commonProps = {
    apiUrl: API_URL,
    candidateId: CANDIDATE_ID,
    onIngestComplete: handleIngestComplete,
    onIngestProgress: setIngestProgress,
    runIds: chatRunIds,
    runHistory: stats.by_run || [],
  }

  const formatNum = (n) => {
    if (n === undefined || n === null) return '—'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(n)
  }

  const fmtTime = (ts) => {
    if (!ts) return 'never'
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* NAVBAR */}
      <nav className="navbar">
        <span className="navbar-logo">⚡ InboxRouter</span>
        <div className="navbar-links" aria-label="Professional links">
          <span className="navbar-links-label">Connect</span>
          <a
            className="navbar-link"
            href="https://github.com/MoAftaab"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub profile"
          >
            <span className="navbar-link-mark github-mark" aria-hidden="true">GH</span>
            <span className="navbar-link-text">GitHub</span>
          </a>
          <a
            className="navbar-link"
            href="https://www.linkedin.com/in/mohd-aftaab-b49a5624a/"
            target="_blank"
            rel="noreferrer"
            aria-label="Open LinkedIn profile"
          >
            <span className="navbar-link-mark linkedin-mark" aria-hidden="true">in</span>
            <span className="navbar-link-text">LinkedIn</span>
          </a>
          <a
            className="navbar-link"
            href="https://drive.google.com/file/d/15xoj5GhVHKZN3jcREUqMvKmIY3uRkJwI/view?usp=sharing"
            target="_blank"
            rel="noreferrer"
            aria-label="Open resume"
          >
            <span className="navbar-link-mark resume-mark" aria-hidden="true">CV</span>
            <span className="navbar-link-text">Resume</span>
          </a>
        </div>
        <div className="navbar-stats">
          <div className="stat-pill">
            <div className="dot" style={{ background: '#a855f7' }} />
            <span>{formatNum(stats.processed)}</span>
            processed
          </div>
          <div className="stat-pill">
            <div className="dot" style={{ background: '#10b981' }} />
            <span>{formatNum(stats.tasks_created)}</span>
            created
          </div>
          <div className="stat-pill">
            <div className="dot" style={{ background: '#3b82f6' }} />
            <span>{formatNum(stats.tasks_updated)}</span>
            updated
          </div>
          <div className="stat-pill">
            <div className="dot" style={{ background: '#64748b' }} />
            <span>{formatNum(stats.skipped)}</span>
            skipped
          </div>
          <div className="stat-pill" title="Last sync time">
            🕐 <span>{fmtTime(stats.last_updated)}</span>
          </div>
          {ingestProgress.status === 'running' && (
            <div className="stat-pill" title="Live routing progress">
              <div className="dot" style={{ background: '#f59e0b' }} />
              routing {ingestProgress.processed}/{ingestProgress.total} ({ingestProgress.percent}%)
            </div>
          )}
          {statsLoading && <div className="spinner-purple" style={{ marginLeft: 4 }} />}
        </div>
      </nav>

      {/* TABS */}
      <div className="tabs-container">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="main-content">
        <div style={{ display: activeTab === 'batch' ? 'block' : 'none' }}><BatchTab {...commonProps} /></div>
        {activeTab === 'dashboard' && <DashboardTab {...commonProps} stats={stats} />}
        {activeTab === 'tasks' && <TasksTab {...commonProps} />}
        {activeTab === 'chat' && <ChatTab {...commonProps} />}
        {activeTab === 'tests' && <TestsTab {...commonProps} />}
      </div>
    </div>
  )
}
