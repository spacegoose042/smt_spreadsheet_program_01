import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIssue, getIssueTypes } from '../api'
import { X, AlertTriangle } from 'lucide-react'

export default function ReportIssueModal({ workOrder, onClose }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    issue_type_id: '',
    severity: 'Minor',
    description: ''
  })

  const { data: issueTypes } = useQuery({
    queryKey: ['issue-types'],
    queryFn: () => getIssueTypes(false).then(res => res.data)
  })

  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries(['issues'])
      queryClient.invalidateQueries(['work-orders'])
      onClose()
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    createMutation.mutate({
      work_order_id: workOrder.id,
      issue_type_id: parseInt(formData.issue_type_id),
      severity: formData.severity,
      description: formData.description
    })
  }

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
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
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: 'var(--shadow-xl)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
            Report Issue
          </h2>
          <button
            onClick={onClose}
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
          <strong>Work Order:</strong> {workOrder.wo_number}<br />
          <strong>Assembly:</strong> {workOrder.assembly} {workOrder.revision}<br />
          <strong>Customer:</strong> {workOrder.customer}
        </div>

        {createMutation.isError && (
          <div style={{
            background: '#f8d7da',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {createMutation.error?.response?.data?.detail || 'Failed to create issue'}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Issue Type *</label>
            <select
              name="issue_type_id"
              className="form-select"
              value={formData.issue_type_id}
              onChange={handleChange}
              required
            >
              <option value="">Select issue type...</option>
              {issueTypes?.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Severity *</label>
            <select
              name="severity"
              className="form-select"
              value={formData.severity}
              onChange={handleChange}
              required
            >
              <option value="Minor">Minor</option>
              <option value="Major">Major</option>
              <option value="Blocker">Blocker</option>
            </select>
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.25rem', display: 'block' }}>
              <strong>Minor:</strong> Can work around | <strong>Major:</strong> Significant impact | <strong>Blocker:</strong> Cannot proceed
            </small>
          </div>

          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea
              name="description"
              className="form-input"
              value={formData.description}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Describe the issue in detail..."
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Reporting...' : 'Report Issue'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
