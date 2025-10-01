import { useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'

export default function CompleteJobModal({ workOrder, onComplete, onCancel, isSubmitting }) {
  const today = new Date().toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    actual_start_date: today,
    actual_finish_date: today,
    actual_time_clocked_minutes: workOrder.time_minutes || ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    const submitData = {
      work_order_id: workOrder.id,
      actual_start_date: formData.actual_start_date,
      actual_finish_date: formData.actual_finish_date,
      actual_time_clocked_minutes: parseFloat(formData.actual_time_clocked_minutes)
    }
    
    onComplete(submitData)
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
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={24} color="var(--success)" />
            Complete Work Order
          </h2>
          <button 
            onClick={onCancel} 
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0.5rem' }}
            disabled={isSubmitting}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            {workOrder.customer} - {workOrder.assembly} {workOrder.revision}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            WO: {workOrder.wo_number} • Qty: {workOrder.quantity}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Estimated Time: {workOrder.time_minutes} minutes
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Actual Start Date *</label>
            <input
              type="date"
              name="actual_start_date"
              className="form-input"
              value={formData.actual_start_date}
              onChange={handleChange}
              required
              max={today}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Actual Finish Date *</label>
            <input
              type="date"
              name="actual_finish_date"
              className="form-input"
              value={formData.actual_finish_date}
              onChange={handleChange}
              required
              max={today}
              min={formData.actual_start_date}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Actual Time Clocked (minutes) *</label>
            <input
              type="number"
              name="actual_time_clocked_minutes"
              className="form-input"
              value={formData.actual_time_clocked_minutes}
              onChange={handleChange}
              required
              min="1"
              step="0.1"
            />
            {formData.actual_time_clocked_minutes && workOrder.time_minutes && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {parseFloat(formData.actual_time_clocked_minutes) > workOrder.time_minutes ? (
                  <span style={{ color: 'var(--danger)' }}>
                    ⚠️ Over estimate by {(parseFloat(formData.actual_time_clocked_minutes) - workOrder.time_minutes).toFixed(1)} minutes
                  </span>
                ) : (
                  <span style={{ color: 'var(--success)' }}>
                    ✓ Under estimate by {(workOrder.time_minutes - parseFloat(formData.actual_time_clocked_minutes)).toFixed(1)} minutes
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onCancel}
              disabled={isSubmitting}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-success" 
              disabled={isSubmitting}
              style={{ flex: 1 }}
            >
              {isSubmitting ? 'Completing...' : 'Mark as Complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

