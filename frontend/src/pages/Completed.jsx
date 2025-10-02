import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCompletedWorkOrders, updateCompletedWorkOrder, uncompleteWorkOrder } from '../api'
import { format } from 'date-fns'
import { TrendingUp, TrendingDown, Edit2, RotateCcw, X } from 'lucide-react'

function EditCompletedModal({ completed, onSave, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    actual_start_date: completed.actual_start_date,
    actual_finish_date: completed.actual_finish_date,
    actual_time_clocked_minutes: completed.actual_time_clocked_minutes
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'white', borderRadius: '8px', padding: '1.5rem',
        maxWidth: '500px', width: '90%'
      }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Edit2 size={20} />
          Edit Completion Record
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Actual Start Date</label>
            <input
              type="date"
              className="form-input"
              value={formData.actual_start_date}
              onChange={(e) => setFormData({...formData, actual_start_date: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Actual Finish Date</label>
            <input
              type="date"
              className="form-input"
              value={formData.actual_finish_date}
              onChange={(e) => setFormData({...formData, actual_finish_date: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Quantity Completed</label>
            <input
              type="number"
              className="form-input"
              value={formData.actual_time_clocked_minutes}
              onChange={(e) => setFormData({...formData, actual_time_clocked_minutes: parseFloat(e.target.value)})}
              required
              min="1"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
              <X size={16} /> Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ flex: 1 }}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Completed() {
  const queryClient = useQueryClient()
  const [editingCompleted, setEditingCompleted] = useState(null)

  const { data: completed, isLoading } = useQuery({
    queryKey: ['completed'],
    queryFn: () => getCompletedWorkOrders(100),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCompletedWorkOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['completed'])
      setEditingCompleted(null)
    },
  })

  const uncompleteMutation = useMutation({
    mutationFn: uncompleteWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries(['completed'])
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
    },
  })

  const handleEdit = (completedRecord) => {
    setEditingCompleted(completedRecord)
  }

  const handleSave = (data) => {
    updateMutation.mutate({ id: editingCompleted.id, data })
  }

  const handleUncomplete = (completedRecord) => {
    if (window.confirm('Are you sure you want to mark this job as incomplete? It will return to the active schedule.')) {
      uncompleteMutation.mutate(completedRecord.id)
    }
  }

  if (isLoading) {
    return <div className="container loading">Loading completed jobs...</div>
  }

  if (editingCompleted) {
    return (
      <EditCompletedModal
        completed={editingCompleted}
        onSave={handleSave}
        onCancel={() => setEditingCompleted(null)}
        isSubmitting={updateMutation.isPending}
      />
    )
  }

  const completedData = completed?.data || []

  // Calculate stats
  const totalJobs = completedData.length
  const avgVariance = completedData.length > 0
    ? completedData.reduce((sum, c) => sum + (c.time_variance_minutes || 0), 0) / completedData.length
    : 0
  const onTimeJobs = completedData.filter(c => (c.time_variance_minutes || 0) <= 0).length

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Completed Jobs</h1>
        <p className="page-description">Historical job completion and time tracking</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Completed</div>
          <div className="stat-value">{totalJobs}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Time Variance</div>
          <div className={`stat-value ${avgVariance > 0 ? 'warning' : 'success'}`}>
            {avgVariance > 0 ? '+' : ''}{Math.round(avgVariance)} min
          </div>
          <div className="stat-sublabel">actual vs estimated</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">On/Under Time</div>
          <div className="stat-value success">
            {totalJobs > 0 ? Math.round((onTimeJobs / totalJobs) * 100) : 0}%
          </div>
          <div className="stat-sublabel">{onTimeJobs} of {totalJobs} jobs</div>
        </div>
      </div>

      {/* Completed Jobs Table */}
      {completedData.length === 0 ? (
        <div className="card empty-state">
          <p>No completed jobs yet</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Assembly</th>
                <th>WO #</th>
                <th>Qty</th>
                <th>Start Date</th>
                <th>Finish Date</th>
                <th>Est. Qty</th>
                <th>Actual Qty</th>
                <th>Variance</th>
                <th>Completed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {completedData.map((c) => {
                const variance = c.time_variance_minutes || 0
                const isOverTime = variance > 0
                
                return (
                  <tr key={c.id}>
                    <td>{c.work_order?.customer}</td>
                    <td>{c.work_order?.assembly} {c.work_order?.revision}</td>
                    <td><code>{c.work_order?.wo_number}</code></td>
                    <td>{c.work_order?.quantity}</td>
                    <td>{format(new Date(c.actual_start_date), 'MMM d, yyyy')}</td>
                    <td>{format(new Date(c.actual_finish_date), 'MMM d, yyyy')}</td>
                    <td>{c.work_order?.quantity} units</td>
                    <td>{c.actual_time_clocked_minutes} units</td>
                    <td>
                      <span style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color: c.actual_time_clocked_minutes < c.work_order?.quantity ? 'var(--danger)' : 
                              c.actual_time_clocked_minutes > c.work_order?.quantity ? 'var(--info)' : 'var(--success)'
                      }}>
                        {c.actual_time_clocked_minutes < c.work_order?.quantity ? '⚠️ Short' :
                         c.actual_time_clocked_minutes > c.work_order?.quantity ? 'ℹ️ Over' : '✓ Match'}
                      </span>
                    </td>
                    <td>{format(new Date(c.completed_at), 'MMM d, yyyy')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEdit(c)}
                          title="Edit completion details"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-sm btn-warning"
                          onClick={() => handleUncomplete(c)}
                          title="Mark as incomplete (return to schedule)"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

