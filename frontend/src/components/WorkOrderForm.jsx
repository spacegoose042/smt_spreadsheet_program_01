import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStatuses } from '../api'
import { X, Plus, Edit2 } from 'lucide-react'

export default function WorkOrderForm({ initialData, lines, onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    customer: '',
    assembly: '',
    revision: '',
    wo_number: '',
    quantity: '',
    status_id: '',  // New: use status_id
    priority: 'Factory Default',
    is_locked: false,
    is_new_rev_assembly: false,
    cetec_ship_date: '',
    time_minutes: '',
    trolley_count: 1,
    sides: 'Single',
    line_id: '', // Default to unscheduled
    line_position: '',
    th_wo_number: '',
    th_kit_status: 'N/A',
    run_together_group: '',
    notes: '',
    ...initialData
  })

  // Fetch statuses
  const { data: statusesData } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => getStatuses(false).then(res => res.data)
  })

  const statuses = statusesData || []

  // Convert dates to YYYY-MM-DD format for input
  useEffect(() => {
    if (initialData?.cetec_ship_date) {
      const date = new Date(initialData.cetec_ship_date)
      setFormData(prev => ({
        ...prev,
        cetec_ship_date: date.toISOString().split('T')[0]
      }))
    }
  }, [initialData])

  // Map status_name to status_id when editing (if using new system)
  useEffect(() => {
    if (initialData?.status_name && statuses.length > 0 && !formData.status_id) {
      const matchingStatus = statuses.find(s => s.name === initialData.status_name)
      if (matchingStatus) {
        setFormData(prev => ({
          ...prev,
          status_id: matchingStatus.id
        }))
      }
    } else if (!initialData && statuses.length > 0 && !formData.status_id) {
      // Set default status to "Clear to Build" for new work orders
      const defaultStatus = statuses.find(s => s.name === 'Clear to Build')
      if (defaultStatus) {
        setFormData(prev => ({
          ...prev,
          status_id: defaultStatus.id
        }))
      }
    }
  }, [initialData, statuses])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }
      
      // If changing line to unscheduled, clear position
      if (name === 'line_id' && !value) {
        updated.line_position = ''
      }
      
      return updated
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Convert string numbers to integers/floats
    const submitData = {
      ...formData,
      quantity: parseInt(formData.quantity),
      time_minutes: parseFloat(formData.time_minutes),
      trolley_count: parseInt(formData.trolley_count),
      line_id: formData.line_id ? parseInt(formData.line_id) : null,
      line_position: formData.line_position ? parseInt(formData.line_position) : null,
      status_id: formData.status_id ? parseInt(formData.status_id) : null,
    }
    
    // Remove legacy status field
    delete submitData.status
    
    onSubmit(submitData)
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
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{
          position: 'sticky',
          top: 0,
          background: 'white',
          borderBottom: '1px solid var(--border)',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          <h2 style={{ 
            fontSize: '1.1rem', 
            fontWeight: 700, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            margin: 0
          }}>
            {initialData ? (
              <>
                <Edit2 size={18} />
                Edit Work Order
              </>
            ) : (
              <>
                <Plus size={18} />
                New Work Order
              </>
            )}
          </h2>
          <button 
            onClick={onCancel} 
            style={{ 
              border: 'none', 
              background: 'none', 
              cursor: 'pointer', 
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center'
            }}
            disabled={isSubmitting}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        
    <form onSubmit={handleSubmit} style={{ padding: '1rem' }}>
      <div className="grid grid-cols-3" style={{ gap: '0.75rem' }}>
        {/* Basic Info */}
        <div className="form-group">
          <label className="form-label">Customer *</label>
          <input
            type="text"
            name="customer"
            className="form-input"
            value={formData.customer}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Assembly *</label>
          <input
            type="text"
            name="assembly"
            className="form-input"
            value={formData.assembly}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Revision *</label>
          <input
            type="text"
            name="revision"
            className="form-input"
            value={formData.revision}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">WO Number *</label>
          <input
            type="text"
            name="wo_number"
            className="form-input"
            value={formData.wo_number}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Quantity *</label>
          <input
            type="number"
            name="quantity"
            className="form-input"
            value={formData.quantity}
            onChange={handleChange}
            required
            min="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cetec Ship Date *</label>
          <input
            type="date"
            name="cetec_ship_date"
            className="form-input"
            value={formData.cetec_ship_date}
            onChange={handleChange}
            required
          />
        </div>

        {/* Timing */}
        <div className="form-group">
          <label className="form-label">Time (minutes) *</label>
          <input
            type="number"
            name="time_minutes"
            className="form-input"
            value={formData.time_minutes}
            onChange={handleChange}
            required
            min="1"
            step="0.1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Trolley Count *</label>
          <input
            type="number"
            name="trolley_count"
            className="form-input"
            value={formData.trolley_count}
            onChange={handleChange}
            required
            min="1"
            max="8"
          />
        </div>

        {/* Status and Priority */}
        <div className="form-group">
          <label className="form-label">Status *</label>
          <select
            name="status_id"
            className="form-select"
            value={formData.status_id}
            onChange={handleChange}
            required
          >
            <option value="">Select status...</option>
            {statuses.map(status => (
              <option key={status.id} value={status.id}>{status.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Priority *</label>
          <select
            name="priority"
            className="form-select"
            value={formData.priority}
            onChange={handleChange}
            required
          >
            <option value="Critical Mass">Critical Mass</option>
            <option value="Overclocked">Overclocked</option>
            <option value="Factory Default">Factory Default</option>
            <option value="Trickle Charge">Trickle Charge</option>
            <option value="Power Down">Power Down</option>
          </select>
        </div>

        {/* Line Assignment */}
        <div className="form-group">
          <label className="form-label">
            Line
            {formData.is_locked && <span style={{ marginLeft: '0.5rem', color: 'var(--warning)', fontSize: '0.75rem' }}>🔒 Locked</span>}
          </label>
          <select
            name="line_id"
            className="form-select"
            value={formData.line_id}
            onChange={handleChange}
            disabled={formData.is_locked}
            style={formData.is_locked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
          >
            <option value="">⚠️ Unscheduled</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>
          <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
            {formData.is_locked 
              ? '🔒 Unlock this work order to change the line'
              : formData.line_id 
                ? 'Assigned to a production line' 
                : 'Not yet scheduled - assign to a line when ready'}
          </small>
        </div>

        <div className="form-group">
          <label className="form-label">
            Line Position
            {formData.is_locked && <span style={{ marginLeft: '0.5rem', color: 'var(--warning)', fontSize: '0.75rem' }}>🔒 Locked</span>}
          </label>
          <input
            type="number"
            name="line_position"
            className="form-input"
            value={formData.line_position}
            onChange={handleChange}
            min="1"
            placeholder="Auto-assigned if empty"
            disabled={!formData.line_id || formData.is_locked}
            style={formData.is_locked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
          />
          <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
            {formData.is_locked 
              ? '🔒 Unlock this work order to change the position'
              : !formData.line_id 
                ? 'Select a line first' 
                : 'Auto-assigned if empty'}
          </small>
        </div>

        {/* Board Type */}
        <div className="form-group">
          <label className="form-label">Sides *</label>
          <select
            name="sides"
            className="form-select"
            value={formData.sides}
            onChange={handleChange}
            required
          >
            <option value="Single">Single</option>
            <option value="Double">Double</option>
          </select>
        </div>

        {/* Through-Hole Info */}
        <div className="form-group">
          <label className="form-label">TH Kit Status *</label>
          <select
            name="th_kit_status"
            className="form-select"
            value={formData.th_kit_status}
            onChange={handleChange}
            required
          >
            <option value="N/A">N/A</option>
            <option value="Clear to Build">Clear to Build</option>
            <option value="Missing">Missing</option>
            <option value="SMT ONLY">SMT ONLY</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">TH WO Number</label>
          <input
            type="text"
            name="th_wo_number"
            className="form-input"
            value={formData.th_wo_number}
            onChange={handleChange}
          />
        </div>

        {/* Grouping */}
        <div className="form-group">
          <label className="form-label">Run Together Group</label>
          <input
            type="text"
            name="run_together_group"
            className="form-input"
            value={formData.run_together_group}
            onChange={handleChange}
            placeholder="e.g., Group A"
          />
        </div>
      </div>

      {/* Checkboxes */}
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            name="is_new_rev_assembly"
            checked={formData.is_new_rev_assembly}
            onChange={handleChange}
          />
          New Rev/Assembly
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            name="is_locked"
            checked={formData.is_locked}
            onChange={handleChange}
          />
          Lock Position
        </label>
      </div>

      {/* Notes */}
      <div className="form-group" style={{ marginTop: '0.75rem' }}>
        <label className="form-label">Notes</label>
        <textarea
          name="notes"
          className="form-input"
          value={formData.notes}
          onChange={handleChange}
          rows="2"
          placeholder="Additional notes..."
          style={{ fontSize: '0.8rem' }}
        />
      </div>

      {/* Actions */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        marginTop: '1rem', 
        paddingTop: '0.75rem',
        borderTop: '1px solid var(--border)',
        justifyContent: 'flex-end'
      }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          <X size={16} />
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : initialData ? 'Update Work Order' : 'Create Work Order'}
        </button>
      </div>
    </form>
      </div>
    </div>
  )
}

