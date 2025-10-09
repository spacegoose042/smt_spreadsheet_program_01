import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function autoSchedule({ mode, dryRun }) {
  const token = localStorage.getItem('token')
  const response = await axios.post(
    `${API_URL}/api/auto-schedule?mode=${mode}&dry_run=${dryRun}`,
    {},
    {
      withCredentials: true,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  return response.data
}

export default function AutoScheduleModal({ onClose }) {
  const [mode, setMode] = useState('balanced')
  const [results, setResults] = useState(null)
  const [isPreview, setIsPreview] = useState(true)
  const queryClient = useQueryClient()

  const previewMutation = useMutation({
    mutationFn: () => autoSchedule({ mode, dryRun: true }),
    onSuccess: (data) => {
      setResults(data)
      setIsPreview(true)
    }
  })

  const applyMutation = useMutation({
    mutationFn: () => autoSchedule({ mode, dryRun: false }),
    onSuccess: (data) => {
      setResults(data)
      setIsPreview(false)
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
      // Auto-close after 3 seconds on success
      setTimeout(() => {
        onClose()
      }, 3000)
    }
  })

  const handlePreview = () => {
    previewMutation.mutate()
  }

  const handleApply = () => {
    if (window.confirm('Apply auto-schedule? This will move unlocked jobs to optimize throughput.')) {
      applyMutation.mutate()
    }
  }

  return (
    <div 
      className="modal-overlay" 
      style={{ 
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div 
        className="modal" 
        style={{ 
          maxWidth: '1200px', 
          width: '95%',
          maxHeight: '95vh', 
          overflow: 'auto',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div 
          className="modal-header" 
          style={{ 
            padding: '1.5rem 2rem',
            borderBottom: '2px solid #e9ecef',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            borderRadius: '12px 12px 0 0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Zap size={28} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Auto-Schedule Jobs</h2>
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9 }}>Optimize your production schedule</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn-icon"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              padding: '0.5rem',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '2rem' }}>
          {/* Mode Selection */}
          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Optimization Mode
            </label>
            <select
              className="form-input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={previewMutation.isPending || applyMutation.isPending}
              style={{
                fontSize: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '2px solid #e9ecef',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="balanced">⚖️ Balanced (Recommended)</option>
              <option value="throughput_max">🚀 Maximum Throughput</option>
              <option value="promise_focused">📅 Promise Date Focused</option>
            </select>
            <div 
              style={{ 
                fontSize: '0.875rem', 
                color: '#6c757d', 
                marginTop: '0.75rem',
                padding: '0.75rem 1rem',
                background: '#f8f9fa',
                borderRadius: '8px',
                borderLeft: '4px solid #667eea'
              }}
            >
              {mode === 'balanced' && '⚖️ Distributes jobs evenly across lines while maximizing throughput'}
              {mode === 'throughput_max' && '🚀 Prioritizes maximum jobs/day, may have uneven line loading'}
              {mode === 'promise_focused' && '📅 Slight bias toward hitting promise dates, lower throughput'}
            </div>
          </div>

          {/* Preview Results */}
          {results && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid #e9ecef'
              }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                  {isPreview ? '📋 Preview Results' : '✅ Applied Successfully!'}
                </h3>
              </div>

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '1px solid #90caf9',
                  boxShadow: '0 4px 12px rgba(33, 150, 243, 0.1)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#1565c0', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Jobs Scheduled</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0d47a1' }}>{results.jobs_scheduled}</div>
                </div>

                <div style={{ 
                  background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '1px solid #ffb74d',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#ef6c00', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>At Risk</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e65100' }}>{results.jobs_at_risk?.length || 0}</div>
                </div>

                <div style={{ 
                  background: 'linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '1px solid #ef5350',
                  boxShadow: '0 4px 12px rgba(244, 67, 54, 0.1)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#c62828', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Will Be Late</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#b71c1c' }}>{results.jobs_will_be_late?.length || 0}</div>
                </div>

                {isPreview && (
                  <div style={{ 
                    background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)', 
                    padding: '1.5rem', 
                    borderRadius: '12px',
                    border: '1px solid #ba68c8',
                    boxShadow: '0 4px 12px rgba(156, 39, 176, 0.1)'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#6a1b9a', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Changes</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4a148c' }}>{results.changes?.length || 0}</div>
                  </div>
                )}
              </div>

              {/* Line Assignments */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600, color: '#495057' }}>📊 Line Distribution</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {Object.entries(results.line_assignments || {}).map(([lineName, load]) => (
                    <div key={lineName} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{lineName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        <div>{load.job_count} jobs</div>
                        <div>{load.total_hours} hours</div>
                        <div style={{ fontSize: '0.75rem', color: '#999' }}>
                          Complete: {load.completion_date}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trolley Utilization */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600, color: '#495057' }}>🛒 Trolley Utilization (Positions 1+2)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {Object.entries(results.trolley_utilization || {}).map(([lineName, util]) => (
                    <div 
                      key={lineName} 
                      className="card" 
                      style={{ 
                        padding: '0.75rem',
                        background: util.exceeds_limit ? '#ffebee' : '#e8f5e9',
                        border: util.exceeds_limit ? '2px solid #d32f2f' : '2px solid #4caf50'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{lineName}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        {util.positions_1_2} / {util.limit}
                        {util.exceeds_limit && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '1rem' }}>
                            <AlertTriangle size={16} style={{ color: '#d32f2f' }} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Late Jobs List */}
              {results.jobs_will_be_late && results.jobs_will_be_late.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600, color: '#d32f2f' }}>
                    ⚠️ Jobs That Will Miss Promise Dates
                  </h4>
                  <div className="card" style={{ padding: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '0.875rem' }}>
                      <thead>
                        <tr>
                          <th>WO#</th>
                          <th>Customer</th>
                          <th>Assembly</th>
                          <th>Days Late</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.jobs_will_be_late.map((job) => (
                          <tr key={job.wo_number}>
                            <td>{job.wo_number}</td>
                            <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.customer}
                            </td>
                            <td>{job.assembly}</td>
                            <td style={{ color: '#d32f2f', fontWeight: 600 }}>+{job.variance_days}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Changes List (Preview only) */}
              {isPreview && results.changes && results.changes.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem' }}>Proposed Changes ({results.changes.length})</h4>
                  <div className="card" style={{ padding: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ fontSize: '0.875rem' }}>
                      <thead>
                        <tr>
                          <th>WO#</th>
                          <th>From</th>
                          <th>To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.changes.map((change, idx) => (
                          <tr key={idx}>
                            <td>{change.wo_number}</td>
                            <td>
                              {change.old_line_id ? `Line ${change.old_line_id}` : 'Unscheduled'}
                              {change.old_position && ` (Pos ${change.old_position})`}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              Line {change.new_line_id} (Pos {change.new_position})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {(previewMutation.isError || applyMutation.isError) && (
            <div className="card" style={{ background: '#ffebee', padding: '1rem', marginTop: '1rem' }}>
              <div style={{ color: '#d32f2f', fontWeight: 600 }}>
                ❌ Error: {previewMutation.error?.message || applyMutation.error?.message}
              </div>
            </div>
          )}
        </div>

        <div 
          className="modal-footer" 
          style={{ 
            padding: '1.5rem 2rem',
            borderTop: '2px solid #e9ecef',
            background: '#f8f9fa',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'flex-end'
          }}
        >
          {!results && (
            <>
              <button 
                onClick={onClose} 
                className="btn-secondary"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handlePreview} 
                className="btn-primary"
                disabled={previewMutation.isPending}
                style={{
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
              >
                {previewMutation.isPending ? '⏳ Loading...' : '👁️ Preview Schedule'}
              </button>
            </>
          )}

          {results && isPreview && (
            <>
              <button 
                onClick={onClose} 
                className="btn-secondary"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handlePreview} 
                className="btn-secondary"
                disabled={previewMutation.isPending}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  fontWeight: 600
                }}
              >
                🔄 Re-Preview
              </button>
              <button 
                onClick={handleApply} 
                className="btn-success"
                disabled={applyMutation.isPending}
                style={{
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                  border: 'none',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(56, 239, 125, 0.3)'
                }}
              >
                {applyMutation.isPending ? '⏳ Applying...' : '✅ Apply Schedule'}
              </button>
            </>
          )}

          {results && !isPreview && (
            <button 
              onClick={onClose} 
              className="btn-success"
              style={{
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                borderRadius: '8px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                border: 'none',
                color: 'white'
              }}
            >
              <CheckCircle2 size={18} />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

