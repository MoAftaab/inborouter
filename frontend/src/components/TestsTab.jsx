import React, { useState, useCallback } from 'react'

const TEST_GROUPS = [
  {
    id: 'A',
    label: 'Group A — Routing Accuracy',
    color: '#a855f7',
    apiGroups: 'A',
    description: 'Tests that emails route to correct categories',
  },
  {
    id: 'B',
    label: 'Group B — Task API Validation',
    color: '#3b82f6',
    apiGroups: 'B',
    description: 'Validates task creation and update API endpoints',
  },
  {
    id: 'CD',
    label: 'Groups C+D — Currency & Deadline Unit Tests',
    color: '#10b981',
    apiGroups: 'C,D',
    description: 'Unit tests for currency extraction and deadline parsing',
  },
  {
    id: 'EF',
    label: 'Groups E+F — Idempotency & Threads',
    color: '#f59e0b',
    apiGroups: 'E,F',
    description: 'Tests duplicate handling and thread grouping logic',
  },
  {
    id: 'G',
    label: 'Group G — Chat Grounding',
    color: '#ec4899',
    apiGroups: 'G',
    description: 'Verifies chat responses are grounded in actual data',
  },
  {
    id: 'H',
    label: 'Group H — Email Generation',
    color: '#f97316',
    apiGroups: 'H',
    description: 'Tests the synthetic email generation endpoint',
  },
]

function TestItem({ test, index }) {
  const pass = test.status === 'pass' || test.passed === true || test.result === 'pass'
  return (
    <div className="test-item" style={{ animationDelay: `${index * 0.03}s` }}>
      <div className="test-status">{pass ? '✅' : '❌'}</div>
      <div style={{ flex: 1 }}>
        <div className={`test-name ${pass ? 'pass' : 'fail'}`}>
          {test.name || test.test_name || test.description || `Test ${index + 1}`}
        </div>
        {!pass && (test.expected !== undefined || test.actual !== undefined || test.error) && (
          <div className="test-diff">
            {test.error && (
              <div className="actual">Error: {String(test.error)}</div>
            )}
            {test.expected !== undefined && (
              <div className="expected">Expected: {JSON.stringify(test.expected)}</div>
            )}
            {test.actual !== undefined && (
              <div className="actual">Actual:   {JSON.stringify(test.actual)}</div>
            )}
          </div>
        )}
      </div>
      <div className="test-duration">
        {test.duration_ms !== undefined ? `${test.duration_ms}ms` :
         test.duration !== undefined ? `${test.duration}ms` : '—'}
      </div>
    </div>
  )
}

function TestGroup({ group, results, running, onRun, open, onToggle }) {
  const groupResults = results[group.id] || []
  const passed = groupResults.filter(t => t.status === 'pass' || t.passed === true || t.result === 'pass').length
  const failed = groupResults.length - passed
  const isRunning = running === group.id

  return (
    <div className="test-group">
      <div
        className={`test-group-header${open ? ' open' : ''}`}
        onClick={onToggle}
        style={{ borderLeft: `3px solid ${group.color}` }}
      >
        <div className="test-group-title">
          <span style={{ color: group.color }}>▶</span>
          {group.label}
        </div>
        <div className="test-group-stats">
          {isRunning && <span className="spinner-purple" style={{ width: 14, height: 14 }} />}
          {groupResults.length > 0 && (
            <>
              <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>✓ {passed}</span>
              {failed > 0 && <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>✗ {failed}</span>}
              <span style={{ color: 'var(--text-muted)' }}>{groupResults.length} tests</span>
            </>
          )}
          <button
            className="btn-outline"
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={(e) => { e.stopPropagation(); onRun(group) }}
            disabled={!!running}
          >
            {isRunning ? <span className="spinner" style={{ borderTopColor: 'var(--primary-400)', borderColor: 'rgba(168,85,247,0.3)', width: 12, height: 12 }} /> : '▶ Run'}
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="test-list">
          {isRunning ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div className="spinner-purple" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Running {group.label}…</div>
              <div className="progress-bar-container" style={{ maxWidth: 200, margin: '12px auto 0' }}>
                <div className="progress-bar-fill" style={{ width: '100%' }} />
              </div>
            </div>
          ) : groupResults.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {group.description} — click ▶ Run to execute
            </div>
          ) : (
            groupResults.map((test, i) => (
              <TestItem key={test.id || test.name || i} test={test} index={i} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function TestsTab({ apiUrl, candidateId }) {
  const [results, setResults] = useState({})
  const [running, setRunning] = useState(null) // group id or 'all'
  const [openGroups, setOpenGroups] = useState(new Set(['A']))
  const [progress, setProgress] = useState(0)

  const runGroup = useCallback(async (group) => {
    setRunning(group.id)
    setOpenGroups(prev => new Set([...prev, group.id]))
    try {
      const res = await fetch(`${apiUrl}/api/test/run?groups=${group.apiGroups}&candidate_id=${candidateId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const tests = Array.isArray(data) ? data : (data.tests || data.results || data.items || [])
      setResults(prev => ({ ...prev, [group.id]: tests }))
    } catch (err) {
      // Store error result
      setResults(prev => ({
        ...prev,
        [group.id]: [{
          name: `Failed to run group ${group.id}`,
          status: 'fail',
          error: err.message,
        }],
      }))
    } finally {
      setRunning(null)
    }
  }, [apiUrl, candidateId])

  const runAll = useCallback(async () => {
    setRunning('all')
    setProgress(0)
    setOpenGroups(new Set(TEST_GROUPS.map(g => g.id)))
    const allResults = {}
    for (let i = 0; i < TEST_GROUPS.length; i++) {
      const group = TEST_GROUPS[i]
      try {
        const res = await fetch(`${apiUrl}/api/test/run?groups=${group.apiGroups}&candidate_id=${candidateId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const tests = Array.isArray(data) ? data : (data.tests || data.results || data.items || [])
        allResults[group.id] = tests
      } catch (err) {
        allResults[group.id] = [{
          name: `Failed to run group ${group.id}`,
          status: 'fail',
          error: err.message,
        }]
      }
      setProgress(Math.round(((i + 1) / TEST_GROUPS.length) * 100))
      setResults(prev => ({ ...prev, ...allResults }))
    }
    setRunning(null)
    setProgress(100)
  }, [apiUrl, candidateId])

  const toggleGroup = (groupId) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // Aggregate stats
  const allTests = Object.values(results).flat()
  const totalTests = allTests.length
  const totalPassed = allTests.filter(t => t.status === 'pass' || t.passed === true || t.result === 'pass').length
  const totalFailed = totalTests - totalPassed
  const avgDuration = totalTests > 0
    ? Math.round(
        allTests.reduce((acc, t) => acc + (Number(t.duration_ms || t.duration || 0)), 0) / totalTests
      )
    : 0

  return (
    <div>
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="section-title">🧪 Test Suite</div>
          <div className="section-subtitle">Run automated tests against your routing backend</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-green"
            onClick={runAll}
            disabled={!!running}
          >
            {running === 'all' ? <span className="spinner" /> : '▶'}
            Run All Tests
          </button>
        </div>
      </div>

      {/* ALL PROGRESS */}
      {running === 'all' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>Running all test groups…</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar-container" style={{ margin: 0 }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* TEST GROUPS */}
      {TEST_GROUPS.map(group => (
        <TestGroup
          key={group.id}
          group={group}
          results={results}
          running={running}
          onRun={runGroup}
          open={openGroups.has(group.id)}
          onToggle={() => toggleGroup(group.id)}
        />
      ))}

      {/* SUMMARY BAR */}
      {totalTests > 0 && (
        <div className="tests-summary">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span><span className="total-count">{totalTests}</span> tests</span>
            <span>·</span>
            <span><span className="pass-count">{totalPassed}</span> passed</span>
            <span>·</span>
            <span><span className="fail-count">{totalFailed}</span> failed</span>
            {avgDuration > 0 && (
              <>
                <span>·</span>
                <span>avg <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{avgDuration}ms</span></span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 120,
              height: 6,
              background: 'var(--border-subtle)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${totalTests > 0 ? (totalPassed / totalTests) * 100 : 0}%`,
                height: '100%',
                background: totalFailed === 0 ? 'var(--accent-green)' : 'linear-gradient(90deg, var(--accent-green), var(--accent-red))',
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: totalFailed === 0 ? 'var(--accent-green)' : totalPassed > totalFailed ? 'var(--accent-amber)' : 'var(--accent-red)',
            }}>
              {totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
