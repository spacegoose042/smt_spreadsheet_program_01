import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function autoSchedule({ mode, dryRun }) {
  const response = await axios.post(
    `${API_URL}/api/auto-schedule?mode=${mode}&dry_run=${dryRun}`,
    {},
    { withCredentials: true }
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
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={24} />
            <h2 style={{ margin: 0 }}>Auto-Schedule Jobs</h2>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Mode Selection */}
          <div className="form-group">
            <label className="form-label">Optimization Mode</label>
            <select
              className="form-input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={previewMutation.isPending || applyMutation.isPending}
            >
              <option value="balanced">Balanced (Default)</option>
              <option value="throughput_max">Maximum Throughput</option>
              <option value="promise_focused">Promise Date Focused</option>
            </select>
            <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
              {mode === 'balanced' && 'Distributes jobs evenly across lines while maximizing throughput'}
              {mode === 'throughput_max' && 'Prioritizes maximum jobs/day, may have uneven line loading'}
              {mode === 'promise_focused' && 'Slight bias toward hitting promise dates, lower throughput'}
            </p>
          </div>

          {/* Preview Results */}
          {results && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>
                {isPreview ? '📋 Preview Results' : '✅ Applied Successfully!'}
              </h3>

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ background: '#e3f2fd', padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#1976d2', marginBottom: '0.25rem' }}>Jobs Scheduled</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1565c0' }}>{results.jobs_scheduled}</div>
                </div>

                <div className="card" style={{ background: '#fff3e0', padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#f57c00', marginBottom: '0.25rem' }}>At Risk</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef6c00' }}>{results.jobs_at_risk?.length || 0}</div>
                </div>

                <div className="card" style={{ background: '#ffebee', padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#d32f2f', marginBottom: '0.25rem' }}>Will Be Late</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c62828' }}>{results.jobs_will_be_late?.length || 0}</div>
                </div>

                {isPreview && (
                  <div className="card" style={{ background: '#f3e5f5', padding: '1rem' }}>
                    <div style={{ fontSize: '0.875rem', color: '#7b1fa2', marginBottom: '0.25rem' }}>Changes</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6a1b9a' }}>{results.changes?.length || 0}</div>
                  </div>
                )}
              </div>

              {/* Line Assignments */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Line Distribution</h4>
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
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem' }}>Trolley Utilization (Positions 1+2)</h4>
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
                <div>
                  <h4 style={{ marginBottom: '0.75rem', color: '#d32f2f' }}>
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

        <div className="modal-footer">
          {!results && (
            <>
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button 
                onClick={handlePreview} 
                className="btn-primary"
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? 'Loading...' : '👁️ Preview Schedule'}
              </button>
            </>
          )}

          {results && isPreview && (
            <>
              <button onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button 
                onClick={handlePreview} 
                className="btn-secondary"
                disabled={previewMutation.isPending}
              >
                🔄 Re-Preview
              </button>
              <button 
                onClick={handleApply} 
                className="btn-primary"
                disabled={applyMutation.isPending}
              >
                {applyMutation.isPending ? 'Applying...' : '✅ Apply Schedule'}
              </button>
            </>
          )}

          {results && !isPreview && (
            <button onClick={onClose} className="btn-primary">
              <CheckCircle2 size={16} style={{ marginRight: '0.5rem' }} />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

