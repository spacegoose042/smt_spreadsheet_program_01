import { useState } from 'react'
import { createCapacityOverride } from '../api'

export default function OverrideModal({ date, lineId, defaultHours, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    start_date: formatDate(date),
    end_date: formatDate(date),
    total_hours: defaultHours,
    reason: ''
  })
  const [applyToWeek, setApplyToWeek] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  function getMonday(date) {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }
  
  function getFriday(date) {
    const monday = getMonday(date)
    const friday = new Date(monday)
    friday.setDate(friday.getDate() + 4)
    return friday
  }
  
  // Update date range when "Apply to Whole Week" is toggled
  function handleWeekToggle(checked) {
    setApplyToWeek(checked)
    if (checked) {
      setFormData({
        ...formData,
        start_date: formatDate(getMonday(date)),
        end_date: formatDate(getFriday(date))
      })
    } else {
      setFormData({
        ...formData,
        start_date: formatDate(date),
        end_date: formatDate(date)
      })
    }
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
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={applyToWeek}
                onChange={(e) => handleWeekToggle(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Apply to whole week (Mon-Fri)</span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                className="form-input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                disabled={applyToWeek}
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
                disabled={applyToWeek}
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

