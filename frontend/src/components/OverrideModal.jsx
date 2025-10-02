import { useState } from 'react'
import { createCapacityOverride } from '../api'

export default function OverrideModal({ date, lineId, defaultHours, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    start_date: formatDate(date),
    end_date: formatDate(date),
    total_hours: defaultHours,
    reason: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  function formatDate(date) {
    return date.toISOString().split('T')[0]
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await createCapacityOverride({
        line_id: lineId,
        ...formData
      })
      onSuccess()
    } catch (error) {
      console.error('Error creating override:', error)
      alert('Failed to create override')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Capacity Override</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                className="form-input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                className="form-input"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Total Hours</label>
            <input
              type="number"
              className="form-input"
              step="0.5"
              min="0"
              max="24"
              value={formData.total_hours}
              onChange={(e) => setFormData({ ...formData, total_hours: parseFloat(e.target.value) })}
              required
            />
            <small className="form-hint">Default: {defaultHours} hours</small>
          </div>

          <div className="form-group">
            <label>Reason</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Overtime to finish urgent order"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

