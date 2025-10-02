import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, getCapacityCalendar, updateShift } from '../api'
import '../styles/ShiftConfiguration.css'

export default function ShiftConfiguration() {
  const queryClient = useQueryClient()
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [editingShift, setEditingShift] = useState(null)

  // Fetch lines
  const { data: linesData } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(false).then(res => res.data)
  })

  const lines = Array.isArray(linesData) ? linesData : []

  // Set default line
  if (lines.length > 0 && !selectedLineId) {
    setSelectedLineId(lines[0].id)
  }

  // Fetch shifts for selected line
  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['capacity-calendar', selectedLineId],
    queryFn: () => getCapacityCalendar(selectedLineId).then(res => res.data),
    enabled: !!selectedLineId
  })

  // Update shift mutation
  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => updateShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['capacity-calendar'])
      setEditingShift(null)
    }
  })

  function calculateShiftHours(shift) {
    if (!shift.start_time || !shift.end_time) return 0

    const start = parseTime(shift.start_time)
    const end = parseTime(shift.end_time)
    let hours = (end - start) / (1000 * 60 * 60)

    // Subtract unpaid breaks
    shift.breaks?.forEach(b => {
      if (!b.is_paid) {
        const breakStart = parseTime(b.start_time)
        const breakEnd = parseTime(b.end_time)
        hours -= (breakEnd - breakStart) / (1000 * 60 * 60)
      }
    })

    return hours
  }

  function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  function getDayName(dayNum) {
    const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return days[dayNum] || ''
  }

  function handleEditShift(shift) {
    setEditingShift({
      id: shift.id,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_active: shift.is_active
    })
  }

  function handleSaveShift() {
    if (!editingShift) return

    updateShiftMutation.mutate({
      id: editingShift.id,
      data: {
        start_time: editingShift.start_time,
        end_time: editingShift.end_time,
        is_active: editingShift.is_active
      }
    })
  }

  if (isLoading) {
    return <div className="loading">Loading shift configuration...</div>
  }

  const shifts = calendarData?.default_shifts || []
  const line = lines.find(l => l.id === selectedLineId)

  return (
    <div className="shift-config-container">
      <div className="shift-config-header">
        <h1>⚙️ Shift Configuration</h1>
        
        <select 
          value={selectedLineId || ''} 
          onChange={(e) => setSelectedLineId(Number(e.target.value))}
          className="form-select"
        >
          {lines.map(line => (
            <option key={line.id} value={line.id}>{line.name}</option>
          ))}
        </select>
      </div>

      {line && (
        <div className="line-summary">
          <h2>{line.name}</h2>
          <p>Default Capacity: {line.hours_per_day} hrs/day, {line.hours_per_week} hrs/week</p>
        </div>
      )}

      <div className="shifts-list">
        <h3>Default Shift Templates</h3>
        
        {shifts.length === 0 ? (
          <div className="no-shifts">
            <p>No shifts configured for this line.</p>
            <p className="hint">Contact an administrator to set up default shifts.</p>
          </div>
        ) : (
          <div className="shifts-grid">
            {shifts.map(shift => {
              const activeDays = shift.active_days ? shift.active_days.split(',').map(d => parseInt(d)) : []
              const hours = calculateShiftHours(shift)
              const isEditing = editingShift?.id === shift.id

              return (
                <div key={shift.id} className={`shift-card ${!shift.is_active ? 'inactive' : ''}`}>
                  <div className="shift-card-header">
                    <h4>{shift.name}</h4>
                    <span className={`status-badge ${shift.is_active ? 'active' : 'inactive'}`}>
                      {shift.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="shift-edit-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Start Time</label>
                          <input
                            type="time"
                            className="form-input"
                            value={editingShift.start_time}
                            onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>End Time</label>
                          <input
                            type="time"
                            className="form-input"
                            value={editingShift.end_time}
                            onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editingShift.is_active}
                            onChange={(e) => setEditingShift({ ...editingShift, is_active: e.target.checked })}
                          />
                          Active
                        </label>
                      </div>

                      <div className="form-actions">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingShift(null)}
                        >
                          Cancel
                        </button>
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveShift}
                          disabled={updateShiftMutation.isPending}
                        >
                          {updateShiftMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="shift-details">
                        <div className="detail-row">
                          <span className="label">Time:</span>
                          <span className="value">{shift.start_time} - {shift.end_time}</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Hours:</span>
                          <span className="value">{hours.toFixed(2)} hrs/day</span>
                        </div>
                        <div className="detail-row">
                          <span className="label">Days:</span>
                          <span className="value">
                            {activeDays.map(d => getDayName(d)).join(', ')}
                          </span>
                        </div>
                      </div>

                      {shift.breaks && shift.breaks.length > 0 && (
                        <div className="shift-breaks">
                          <strong>Breaks:</strong>
                          {shift.breaks.map(b => (
                            <div key={b.id} className="break-item">
                              {b.name}: {b.start_time} - {b.end_time} 
                              {b.is_paid ? ' (Paid)' : ' (Unpaid)'}
                            </div>
                          ))}
                        </div>
                      )}

                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEditShift(shift)}
                      >
                        ✏️ Edit Times
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="help-section">
        <h3>💡 How Shift Configuration Works</h3>
        <ul>
          <li><strong>Default Shifts</strong> - These are the weekly templates for each line</li>
          <li><strong>Active Days</strong> - Which days of the week this shift runs (Mon-Fri, etc.)</li>
          <li><strong>Hours Calculation</strong> - Automatically subtracts unpaid break time</li>
          <li><strong>Capacity Overrides</strong> - Use the Capacity Calendar to override specific dates (overtime, half-day, etc.)</li>
        </ul>
        
        <div className="help-note">
          <strong>Note:</strong> Currently, you can only edit shift times and active status. 
          To change which days a shift runs or to add/remove shifts, contact your system administrator.
        </div>
      </div>
    </div>
  )
}

