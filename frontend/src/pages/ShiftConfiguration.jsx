import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, getCapacityCalendar, createShift, updateShift, createShiftBreak } from '../api'
import '../styles/ShiftConfiguration.css'

export default function ShiftConfiguration() {
  const queryClient = useQueryClient()
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [editingShift, setEditingShift] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showBreakModal, setShowBreakModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [selectedShiftForBreak, setSelectedShiftForBreak] = useState(null)
  const [selectedShiftForCopy, setSelectedShiftForCopy] = useState(null)
  const [targetLines, setTargetLines] = useState([])
  const [newShift, setNewShift] = useState({
    name: 'Day Shift',
    shift_number: 1,
    start_time: '07:30',
    end_time: '16:30',
    active_days: '1,2,3,4,5',
    is_active: true
  })
  const [newBreak, setNewBreak] = useState({
    name: 'Lunch',
    start_time: '11:30',
    end_time: '12:30',
    is_paid: false
  })

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

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: createShift,
    onSuccess: () => {
      queryClient.invalidateQueries(['capacity-calendar'])
      setShowCreateModal(false)
      setNewShift({
        name: 'Day Shift',
        shift_number: 1,
        start_time: '07:30',
        end_time: '16:30',
        active_days: '1,2,3,4,5',
        is_active: true
      })
    }
  })

  // Update shift mutation
  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => updateShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['capacity-calendar'])
      setEditingShift(null)
    }
  })

  // Create break mutation
  const createBreakMutation = useMutation({
    mutationFn: createShiftBreak,
    onSuccess: () => {
      queryClient.invalidateQueries(['capacity-calendar'])
      setShowBreakModal(false)
      setSelectedShiftForBreak(null)
      setNewBreak({
        name: 'Lunch',
        start_time: '11:30',
        end_time: '12:30',
        is_paid: false
      })
    }
  })

  function calculateShiftHours(shift) {
    if (!shift.start_time || !shift.end_time) return 0

    const start = parseTime(shift.start_time)
    const end = parseTime(shift.end_time)
    let hours = (end - start) / (1000 * 60 * 60)

    // If end time is before start time, shift crosses midnight
    if (hours < 0) {
      hours += 24
    }

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

  function handleCreateShift() {
    createShiftMutation.mutate({
      ...newShift,
      line_id: selectedLineId
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

  function handleAddBreak(shift) {
    setSelectedShiftForBreak(shift)
    setShowBreakModal(true)
  }

  function handleCreateBreak() {
    createBreakMutation.mutate({
      ...newBreak,
      shift_id: selectedShiftForBreak.id
    })
  }

  function handleCopyShift(shift) {
    setSelectedShiftForCopy(shift)
    setTargetLines([])
    setShowCopyModal(true)
  }

  async function handleCopyToLines() {
    if (!selectedShiftForCopy || targetLines.length === 0) return

    try {
      // Create the shift on each target line
      for (const lineId of targetLines) {
        const newShiftData = {
          line_id: lineId,
          name: selectedShiftForCopy.name,
          shift_number: selectedShiftForCopy.shift_number,
          start_time: selectedShiftForCopy.start_time,
          end_time: selectedShiftForCopy.end_time,
          active_days: selectedShiftForCopy.active_days,
          is_active: selectedShiftForCopy.is_active
        }
        
        const createdShift = await createShift(newShiftData).then(res => res.data)
        
        // Copy breaks if any
        if (selectedShiftForCopy.breaks && selectedShiftForCopy.breaks.length > 0) {
          for (const breakItem of selectedShiftForCopy.breaks) {
            await createShiftBreak({
              shift_id: createdShift.id,
              name: breakItem.name,
              start_time: breakItem.start_time,
              end_time: breakItem.end_time,
              is_paid: breakItem.is_paid
            })
          }
        }
      }

      queryClient.invalidateQueries(['capacity-calendar'])
      setShowCopyModal(false)
      setSelectedShiftForCopy(null)
      setTargetLines([])
      alert(`Successfully copied shift to ${targetLines.length} line(s)!`)
    } catch (error) {
      console.error('Error copying shift:', error)
      alert('Failed to copy shift. Please try again.')
    }
  }

  function toggleLineSelection(lineId) {
    setTargetLines(prev => 
      prev.includes(lineId) 
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    )
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
        <div className="shifts-list-header">
          <h3>Default Shift Templates</h3>
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Create Shift
          </button>
        </div>
        
        {shifts.length === 0 ? (
          <div className="no-shifts">
            <p>No shifts configured for this line.</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + Create First Shift
            </button>
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

                      <div className="shift-actions">
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEditShift(shift)}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAddBreak(shift)}
                        >
                          + Break
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopyShift(shift)}
                        >
                          📋 Copy
                        </button>
                      </div>
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
          <strong>Note:</strong> Use the "Create Shift" button to add shifts for each line. 
          You can configure multiple shifts per line (e.g., Day Shift, Evening Shift).
        </div>
      </div>

      {/* Create Shift Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Shift</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateShift(); }}>
              <div className="form-group">
                <label>Shift Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={newShift.name}
                  onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                  placeholder="e.g., Day Shift, Evening Shift"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newShift.start_time}
                    onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newShift.end_time}
                    onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Active Days</label>
                <select
                  className="form-select"
                  value={newShift.active_days}
                  onChange={(e) => setNewShift({ ...newShift, active_days: e.target.value })}
                >
                  <option value="1,2,3,4,5">Monday - Friday</option>
                  <option value="1,2,3,4,5,6">Monday - Saturday</option>
                  <option value="1,2,3,4,5,6,7">All Week</option>
                  <option value="6,7">Weekends Only</option>
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newShift.is_active}
                    onChange={(e) => setNewShift({ ...newShift, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={createShiftMutation.isPending}
                >
                  {createShiftMutation.isPending ? 'Creating...' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Shift Modal */}
      {showCopyModal && selectedShiftForCopy && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Copy "{selectedShiftForCopy.name}" to Other Lines</h2>
              <button className="close-btn" onClick={() => setShowCopyModal(false)}>×</button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <p style={{ marginBottom: '1rem', color: '#6c757d' }}>
                Select which lines you want to copy this shift to. The shift and all its breaks will be duplicated.
              </p>

              <div className="lines-checklist">
                {lines
                  .filter(l => l.id !== selectedLineId) // Don't show current line
                  .map(line => (
                    <label key={line.id} className="line-checkbox">
                      <input
                        type="checkbox"
                        checked={targetLines.includes(line.id)}
                        onChange={() => toggleLineSelection(line.id)}
                      />
                      <span>{line.name}</span>
                    </label>
                  ))}
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowCopyModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleCopyToLines}
                  disabled={targetLines.length === 0}
                >
                  Copy to {targetLines.length} Line{targetLines.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Break Modal */}
      {showBreakModal && selectedShiftForBreak && (
        <div className="modal-overlay" onClick={() => setShowBreakModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Break to {selectedShiftForBreak.name}</h2>
              <button className="close-btn" onClick={() => setShowBreakModal(false)}>×</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateBreak(); }}>
              <div className="form-group">
                <label>Break Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={newBreak.name}
                  onChange={(e) => setNewBreak({ ...newBreak, name: e.target.value })}
                  placeholder="e.g., Lunch, Morning Break"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newBreak.start_time}
                    onChange={(e) => setNewBreak({ ...newBreak, start_time: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newBreak.end_time}
                    onChange={(e) => setNewBreak({ ...newBreak, end_time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newBreak.is_paid}
                    onChange={(e) => setNewBreak({ ...newBreak, is_paid: e.target.checked })}
                  />
                  Paid Break
                </label>
                <small className="form-hint">Unpaid breaks are subtracted from total shift hours</small>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowBreakModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={createBreakMutation.isPending}
                >
                  {createBreakMutation.isPending ? 'Adding...' : 'Add Break'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

