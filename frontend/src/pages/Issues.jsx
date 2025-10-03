import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIssues, updateIssue, deleteIssue, getIssueTypes, getResolutionTypes } from '../api'
import { AlertTriangle, CheckCircle, Clock, Filter, Trash2, User, X } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

function IssueBadge({ issueType, color }) {
  return (
    <span 
      className="badge"
      style={{ background: color, color: 'white', border: `1px solid ${color}` }}
    >
      {issueType}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const colors = {
    'Minor': { bg: '#d1ecf1', text: '#0c5460', border: '#bee5eb' },
    'Major': { bg: '#fff3cd', text: '#856404', border: '#ffeaa7' },
    'Blocker': { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
  }
  const style = colors[severity] || colors['Minor']
  
  return (
    <span 
      className="badge"
      style={{ 
        background: style.bg, 
        color: style.text,
        border: `1px solid ${style.border}`
      }}
    >
      {severity}
    </span>
  )
}

function StatusBadge({ status }) {
  const colors = {
    'Open': { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' },
    'In Progress': { bg: '#fff3cd', text: '#856404', border: '#ffeaa7' },
    'Resolved': { bg: '#d4edda', text: '#155724', border: '#b1dfbb' }
  }
  const style = colors[status] || colors['Open']
  
  return (
    <span 
      className="badge"
      style={{ 
        background: style.bg, 
        color: style.text,
        border: `1px solid ${style.border}`
      }}
    >
      {status}
    </span>
  )
}

export default function Issues() {
  const { user, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('')
  const [filterIssueType, setFilterIssueType] = useState('')
  const [resolvingIssue, setResolvingIssue] = useState(null)
  const [resolutionData, setResolutionData] = useState({
    resolution_type_id: '',
    resolution_notes: ''
  })

  const { data: issues, isLoading } = useQuery({
    queryKey: ['issues', filterStatus],
    queryFn: () => {
      const params = {}
      if (filterStatus) params.status = filterStatus
      return getIssues(params).then(res => res.data)
    }
  })

  const { data: issueTypes } = useQuery({
    queryKey: ['issue-types'],
    queryFn: () => getIssueTypes(false).then(res => res.data)
  })

  const { data: resolutionTypes } = useQuery({
    queryKey: ['resolution-types'],
    queryFn: () => getResolutionTypes(false).then(res => res.data)
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateIssue(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['issues'])
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: () => {
      queryClient.invalidateQueries(['issues'])
    }
  })

  const handleStatusChange = (issue, newStatus) => {
    if (newStatus === 'Resolved') {
      // Open resolution modal
      setResolvingIssue(issue)
      setResolutionData({ resolution_type_id: '', resolution_notes: '' })
    } else {
      // Simple status update
      updateMutation.mutate({
        id: issue.id,
        data: { status: newStatus }
      })
    }
  }

  const handleResolve = (e) => {
    e.preventDefault()
    updateMutation.mutate({
      id: resolvingIssue.id,
      data: {
        status: 'Resolved',
        resolution_type_id: parseInt(resolutionData.resolution_type_id),
        resolution_notes: resolutionData.resolution_notes
      }
    })
    setResolvingIssue(null)
  }

  const handleDelete = (issue) => {
    if (confirm(`Delete this issue?\n\n"${issue.description}"`)) {
      deleteMutation.mutate(issue.id)
    }
  }

  // Filter issues by type
  const filteredIssues = issues?.filter(issue => {
    if (!filterIssueType) return true
    return issue.issue_type_id === parseInt(filterIssueType)
  }) || []

  // Calculate statistics
  const stats = {
    total: filteredIssues.length,
    open: filteredIssues.filter(i => i.status === 'Open').length,
    inProgress: filteredIssues.filter(i => i.status === 'In Progress').length,
    resolved: filteredIssues.filter(i => i.status === 'Resolved').length,
    blocker: filteredIssues.filter(i => i.severity === 'Blocker' && i.status !== 'Resolved').length
  }

  if (isLoading) return <div className="container loading">Loading...</div>

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Issue Reports</h1>
          <p className="page-description">Track and resolve work order issues</p>
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <AlertTriangle size={16} />
            Total Issues
          </div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open</div>
          <div className="stat-value danger">{stats.open}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value warning">{stats.inProgress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resolved</div>
          <div className="stat-value success">{stats.resolved}</div>
        </div>
        {stats.blocker > 0 && (
          <div className="stat-card">
            <div className="stat-label">Active Blockers</div>
            <div className="stat-value danger">{stats.blocker}</div>
            <div className="stat-sublabel">Require immediate attention</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Filter size={18} style={{ color: 'var(--text-secondary)' }} />
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <select
              className="form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <select
              className="form-select"
              value={filterIssueType}
              onChange={(e) => setFilterIssueType(e.target.value)}
            >
              <option value="">All Issue Types</option>
              {issueTypes?.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Issues Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>WO Number</th>
              <th>Assembly</th>
              <th>Issue Type</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Description</th>
              <th>Resolution</th>
              <th>Reported By</th>
              <th>Reported</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.length > 0 ? (
              filteredIssues.map(issue => (
                <tr key={issue.id}>
                  <td><code>{issue.work_order_id}</code></td>
                  <td>
                    {/* We'd need to join work order data - for now showing ID */}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      WO #{issue.work_order_id}
                    </span>
                  </td>
                  <td>
                    <IssueBadge 
                      issueType={issue.issue_type_name} 
                      color={issue.issue_type_color}
                    />
                  </td>
                  <td><SeverityBadge severity={issue.severity} /></td>
                  <td><StatusBadge status={issue.status} /></td>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {issue.description}
                    </div>
                  </td>
                  <td>
                    {issue.status === 'Resolved' && issue.resolution_type_name ? (
                      <div>
                        <span 
                          className="badge"
                          style={{ background: issue.resolution_type_color, color: 'white', marginBottom: '0.25rem' }}
                        >
                          {issue.resolution_type_name}
                        </span>
                        {issue.resolution_notes && (
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--text-secondary)',
                            marginTop: '0.25rem',
                            fontStyle: 'italic'
                          }}>
                            {issue.resolution_notes.substring(0, 50)}{issue.resolution_notes.length > 50 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <User size={12} />
                      {issue.reported_by_username}
                    </div>
                  </td>
                  <td>
                    <div>{format(new Date(issue.reported_at), 'MMM d, yyyy')}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                      {format(new Date(issue.reported_at), 'h:mm a')}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {issue.status !== 'Resolved' && (
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleStatusChange(issue, 'Resolved')}
                          title="Mark as Resolved"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {issue.status === 'Open' && (
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={() => handleStatusChange(issue, 'In Progress')}
                          title="Mark In Progress"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      {(isAdmin || issue.reported_by_id === user?.id) && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(issue)}
                          title="Delete Issue"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <CheckCircle size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                  <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>No issues found</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    {filterStatus || filterIssueType ? 'Try adjusting your filters' : 'All work orders are running smoothly!'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Resolution Modal */}
      {resolvingIssue && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            maxWidth: '600px',
            width: '100%',
            boxShadow: 'var(--shadow-xl)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={24} style={{ color: 'var(--success)' }} />
                Resolve Issue
              </h2>
              <button
                onClick={() => setResolvingIssue(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '1rem', 
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <IssueBadge issueType={resolvingIssue.issue_type_name} color={resolvingIssue.issue_type_color} />
                {' '}
                <SeverityBadge severity={resolvingIssue.severity} />
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {resolvingIssue.description}
              </div>
            </div>

            <form onSubmit={handleResolve}>
              <div className="form-group">
                <label className="form-label">Resolution Type *</label>
                <select
                  className="form-select"
                  value={resolutionData.resolution_type_id}
                  onChange={(e) => setResolutionData(prev => ({ ...prev, resolution_type_id: e.target.value }))}
                  required
                >
                  <option value="">Select resolution type...</option>
                  {resolutionTypes?.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Resolution Notes</label>
                <textarea
                  className="form-input"
                  value={resolutionData.resolution_notes}
                  onChange={(e) => setResolutionData(prev => ({ ...prev, resolution_notes: e.target.value }))}
                  rows={4}
                  placeholder="Describe how this issue was resolved..."
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={updateMutation.isPending}
                >
                  <CheckCircle size={18} />
                  {updateMutation.isPending ? 'Resolving...' : 'Mark as Resolved'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setResolvingIssue(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

