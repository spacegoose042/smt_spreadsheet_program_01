import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, getCapacityCalendar, createCapacityOverride, deleteCapacityOverride } from '../api'
import OverrideModal from '../components/OverrideModal'
import '../styles/CapacityCalendar.css'

export default function CapacityCalendar() {
  const queryClient = useQueryClient()
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [startDate, setStartDate] = useState(getMonday(new Date()))
  const [contextMenu, setContextMenu] = useState(null)
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)

  // Fetch lines
  const { data: linesData, isLoading: linesLoading, error: linesError } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(false).then(res => res.data)
  })

  const lines = Array.isArray(linesData) ? linesData : []

  // Set default line to first line
  useEffect(() => {
    if (lines.length > 0 && !selectedLineId) {
      setSelectedLineId(lines[0].id)
    }
  }, [lines, selectedLineId])

  // Fetch capacity calendar
  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['capacity-calendar', selectedLineId, startDate],
    queryFn: () => getCapacityCalendar(selectedLineId, formatDate(startDate)).then(res => res.data),
    enabled: !!selectedLineId
  })

  // Delete override mutation
  const deleteOverrideMutation = useMutation({
    mutationFn: deleteCapacityOverride,
    onSuccess: () => {
      queryClient.invalidateQueries(['capacity-calendar'])
    }
  })

  // Helper functions
  function getMonday(date) {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0]
  }

  function addWeeks(date, weeks) {
    const result = new Date(date)
    result.setDate(result.getDate() + weeks * 7)
    return result
  }

  // Generate 8 weeks of dates
  function generateCalendarDates() {
    const dates = []
    for (let week = 0; week < 8; week++) {
      const weekDates = []
      for (let day = 0; day < 7; day++) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + week * 7 + day)
        weekDates.push(date)
      }
      dates.push(weekDates)
    }
    return dates
  }

  // Get override for a specific date
  function getOverrideForDate(date) {
    if (!calendarData?.overrides) return null
    
    const dateStr = formatDate(date)
    return calendarData.overrides.find(o => {
      return dateStr >= o.start_date && dateStr <= o.end_date
    })
  }

  // Get default hours for a day
  function getDefaultHours(date) {
    if (!calendarData?.default_shifts) return 0
    
    // Convert JS day (0=Sunday, 6=Saturday) to our format (1=Monday, 7=Sunday)
    const dayOfWeek = date.getDay()
    const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek // Convert Sunday from 0 to 7
    
    // Filter shifts that are active on this day
    const shiftsForDay = calendarData.default_shifts.filter(s => {
      if (!s.is_active || !s.active_days) return false
      const activeDays = s.active_days.split(',').map(d => parseInt(d))
      return activeDays.includes(dayNumber)
    })
    
    if (shiftsForDay.length === 0) return 0
    
    // Calculate total hours from shifts
    let totalHours = 0
    shiftsForDay.forEach(shift => {
      if (shift.start_time && shift.end_time) {
        const start = parseTime(shift.start_time)
        const end = parseTime(shift.end_time)
        let hours = (end - start) / (1000 * 60 * 60)
        
        // Subtract break time
        shift.breaks?.forEach(b => {
          if (!b.is_paid) {
            const breakStart = parseTime(b.start_time)
            const breakEnd = parseTime(b.end_time)
            hours -= (breakEnd - breakStart) / (1000 * 60 * 60)
          }
        })
        
        totalHours += hours
      }
    })
    
    return totalHours
  }

  function parseTime(timeStr) {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, seconds || 0, 0)
    return date
  }

  // Handle right-click
  function handleContextMenu(e, date) {
    e.preventDefault()
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      date: date
    })
  }

  // Handle context menu actions
  function handleQuickAction(action, date) {
    setSelectedDate(date)
    setContextMenu(null)
    
    const defaultHours = getDefaultHours(date)
    
    let overrideData = {
      line_id: selectedLineId,
      start_date: formatDate(date),
      end_date: formatDate(date),
      total_hours: defaultHours,
      reason: ''
    }
    
    switch (action) {
      case 'overtime':
        overrideData.total_hours = defaultHours + 2
        overrideData.reason = 'Overtime (+2 hours)'
        break
      case 'single-shift':
        overrideData.total_hours = 8
        overrideData.reason = 'Single shift only'
        break
      case 'half-day':
        overrideData.total_hours = defaultHours / 2
        overrideData.reason = 'Half day'
        break
      case 'closed':
        overrideData.total_hours = 0
        overrideData.reason = 'Maintenance / Closed'
        break
      case 'custom':
        setShowOverrideModal(true)
        return
      default:
        return
    }
    
    createCapacityOverride(overrideData).then(() => {
      queryClient.invalidateQueries(['capacity-calendar'])
    })
  }

  function handleDeleteOverride(overrideId) {
    if (confirm('Delete this capacity override?')) {
      deleteOverrideMutation.mutate(overrideId)
    }
  }

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  if (linesLoading) {
    return <div className="loading">Loading lines...</div>
  }

  if (linesError) {
    return <div className="error">Error loading lines: {linesError.message}</div>
  }

  if (isLoading) {
    return <div className="loading">Loading capacity calendar...</div>
  }

  const calendarDates = generateCalendarDates()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="capacity-calendar-container">
      <div className="capacity-header">
        <h1>📅 Capacity Calendar</h1>
        
        <div className="capacity-controls">
          <select 
            value={selectedLineId || ''} 
            onChange={(e) => setSelectedLineId(Number(e.target.value))}
            className="form-select"
          >
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>

          <div className="week-navigation">
            <button 
              className="btn btn-secondary"
              onClick={() => setStartDate(addWeeks(startDate, -1))}
            >
              ← Prev Week
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setStartDate(getMonday(new Date()))}
            >
              Today
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => setStartDate(addWeeks(startDate, 1))}
            >
              Next Week →
            </button>
          </div>
        </div>
      </div>

      <div className="capacity-info">
        <div className="info-item">
          <strong>Default Capacity:</strong> {calendarData?.line?.hours_per_day || 0} hrs/day, {calendarData?.line?.hours_per_week || 0} hrs/week
        </div>
        <div className="info-item">
          <span className="legend-item">
            <span className="legend-box default"></span> Default
          </span>
          <span className="legend-item">
            <span className="legend-box override"></span> Override
          </span>
          <span className="legend-item">
            <span className="legend-box weekend"></span> Weekend
          </span>
        </div>
      </div>

      <div className="calendar-grid">
        {/* Day headers */}
        <div className="calendar-header-row">
          {dayNames.map(day => (
            <div key={day} className="calendar-header-cell">{day}</div>
          ))}
        </div>

        {/* Weeks */}
        {calendarDates.map((week, weekIndex) => (
          <div key={weekIndex} className="calendar-week-row">
            {week.map((date, dayIndex) => {
              const override = getOverrideForDate(date)
              const defaultHours = getDefaultHours(date)
              const hours = override ? override.total_hours : defaultHours
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const isToday = formatDate(date) === formatDate(new Date())
              
              return (
                <div 
                  key={dayIndex}
                  className={`calendar-cell ${isWeekend ? 'weekend' : ''} ${override ? 'has-override' : ''} ${isToday ? 'today' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, date)}
                >
                  <div className="cell-date">{date.getDate()}</div>
                  <div className="cell-month">{date.toLocaleDateString('en-US', { month: 'short' })}</div>
                  
                  {hours > 0 && (
                    <div className="cell-hours">
                      {hours}h
                      {override && <span className="override-indicator">*</span>}
                    </div>
                  )}
                  
                  {override && (
                    <div className="cell-reason" title={override.reason}>
                      {override.reason}
                    </div>
                  )}
                  
                  {override && (
                    <button 
                      className="delete-override-btn"
                      onClick={() => handleDeleteOverride(override.id)}
                      title="Delete override"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="context-menu-header">
            {contextMenu.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <button onClick={() => handleQuickAction('overtime', contextMenu.date)}>
            ⏰ Add Overtime (+2hrs)
          </button>
          <button onClick={() => handleQuickAction('single-shift', contextMenu.date)}>
            🔄 Single Shift Only
          </button>
          <button onClick={() => handleQuickAction('half-day', contextMenu.date)}>
            🕐 Half Day
          </button>
          <button onClick={() => handleQuickAction('closed', contextMenu.date)}>
            🔧 Maintenance / Closed
          </button>
          <hr />
          <button onClick={() => handleQuickAction('custom', contextMenu.date)}>
            ✏️ Custom Override...
          </button>
        </div>
      )}

      {/* Custom Override Modal */}
      {showOverrideModal && (
        <OverrideModal 
          date={selectedDate}
          lineId={selectedLineId}
          defaultHours={getDefaultHours(selectedDate)}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={() => {
            setShowOverrideModal(false)
            queryClient.invalidateQueries(['capacity-calendar'])
          }}
        />
      )}
    </div>
  )
}

