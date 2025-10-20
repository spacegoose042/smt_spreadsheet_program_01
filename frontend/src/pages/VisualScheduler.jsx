import { useState, useEffect } from 'react' // Updated with SMT PRODUCTION filter - PRODUCTION FIX
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDashboard, getWorkOrders, updateWorkOrder, getCapacityOverrides } from '../api'
import { format, addDays, differenceInDays, differenceInMinutes, startOfWeek, isWeekend, startOfDay } from 'date-fns'
import { Lock, AlertCircle, Clock, Wrench } from 'lucide-react'

const PRIORITY_COLORS = {
  'Critical Mass': '#dc3545',
  'Overclocked': '#ff6b35',
  'Factory Default': '#0066cc',
  'Trickle Charge': '#6c757d',
  'Power Down': '#adb5bd'
}

function WorkOrderBlock({ wo, onDragStart, isDragging, showTime = false }) {
  const canDrag = !wo.is_locked
  
  // Calculate runtime and setup hours
  const runtimeHours = wo.time_minutes ? Math.round(wo.time_minutes / 60 * 10) / 10 : 0;
  const setupHours = wo.setup_time_hours || 1;
  const totalHours = runtimeHours + setupHours;
  
  // Format time range if available
  const timeRange = wo.calculated_start_datetime && wo.calculated_end_datetime
    ? `${format(new Date(wo.calculated_start_datetime), 'h:mm a')} - ${format(new Date(wo.calculated_end_datetime), 'h:mm a')}`
    : null
  
  // Format min start date
  const minStartDate = wo.min_start_date ? format(new Date(wo.min_start_date), 'MMM d') : null;
  
  // Enhanced tooltip with all important info
  const tooltipContent = `${wo.customer} - ${wo.assembly} ${wo.revision}
WO: ${wo.wo_number}
Qty: ${wo.quantity} units
Runtime: ${runtimeHours}h + Setup: ${setupHours}h = ${totalHours}h total
${minStartDate ? `Min Start: ${minStartDate}` : ''}
Status: ${wo.status_name || wo.status || 'Unassigned'}
Priority: ${wo.priority}
Trolleys: ${wo.trolley_count}
${timeRange ? `Scheduled: ${timeRange}` : ''}
${wo.notes ? `Notes: ${wo.notes}` : ''}${wo.is_locked ? '\n🔒 LOCKED' : ''}`;
  
  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => canDrag && onDragStart(e, wo)}
      style={{
        background: PRIORITY_COLORS[wo.priority] || '#0066cc',
        color: 'white',
        padding: '0.5rem 0.6rem',
        borderRadius: '6px',
        cursor: canDrag ? 'grab' : 'not-allowed',
        fontSize: '0.7rem',
        border: '2px solid rgba(0,0,0,0.1)',
        boxShadow: '0 3px 6px rgba(0,0,0,0.15)',
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minHeight: '2.8rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        lineHeight: '1.2'
      }}
      title={tooltipContent}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          e.currentTarget.style.zIndex = '10';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
          e.currentTarget.style.zIndex = '1';
        }
      }}
    >
      {wo.is_locked && (
        <Lock size={12} style={{ position: 'absolute', top: '3px', right: '3px' }} />
      )}
      
      {/* Customer and Assembly */}
      <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.1rem' }}>
        {wo.customer}
      </div>
      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginBottom: '0.1rem' }}>
        {wo.assembly} • {wo.quantity}u
      </div>
      
      {/* Runtime Information */}
      <div style={{ fontSize: '0.6rem', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <Clock size={8} />
        <span>{runtimeHours}h</span>
        {/* Debug: Show actual times */}
        {wo.calculated_start_datetime && (
          <div style={{ fontSize: '0.5rem', opacity: 0.7, marginTop: '0.1rem' }}>
            {new Date(wo.calculated_start_datetime).toLocaleTimeString()} - {new Date(wo.calculated_end_datetime).toLocaleTimeString()}
          </div>
        )}
        <span style={{ opacity: 0.7 }}>+{setupHours}h</span>
        <span style={{ fontWeight: 600 }}>= {totalHours}h</span>
      </div>
      
      {/* Min Start Date */}
      {minStartDate && (
        <div style={{ fontSize: '0.55rem', opacity: 0.8, marginTop: '0.1rem', fontWeight: 500 }}>
          Min: {minStartDate}
        </div>
      )}
      
      {/* Time Range (if showTime is true) */}
      {showTime && timeRange && (
        <div style={{ fontSize: '0.55rem', opacity: 0.85, marginTop: '0.1rem', fontWeight: 500 }}>
          {timeRange}
        </div>
      )}
    </div>
  )
}

export default function VisualScheduler() {
  const queryClient = useQueryClient()
  const [draggedWO, setDraggedWO] = useState(null)
  const [dragOverLine, setDragOverLine] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [zoomLevel, setZoomLevel] = useState('month') // 'day', 'week', 'month'
  const [dayOffset, setDayOffset] = useState(0) // For day view navigation
  const [scrollPosition, setScrollPosition] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const [zoomSlider, setZoomSlider] = useState(2) // 0=day, 1=week, 2=month
  const [quickDate, setQuickDate] = useState('today')
  
  // Enhanced scrolling and navigation functions
  const handleWheelScroll = (e) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl/Cmd + wheel
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      const zoomLevels = ['day', 'week', 'month']
      const currentIndex = zoomLevels.indexOf(zoomLevel)
      const newIndex = Math.max(0, Math.min(zoomLevels.length - 1, currentIndex + delta))
      setZoomLevel(zoomLevels[newIndex])
    } else {
      // Horizontal scroll with wheel
      e.preventDefault()
      const scrollContainer = e.currentTarget
      const scrollAmount = e.deltaY * 2 // Increase scroll sensitivity
      scrollContainer.scrollLeft += scrollAmount
      setScrollPosition(scrollContainer.scrollLeft)
    }
  }
  
  const handlePanLeft = () => {
    const container = document.querySelector('.timeline-container')
    if (container) {
      const panAmount = zoomLevel === 'day' ? 200 : zoomLevel === 'week' ? 400 : 600
      container.scrollLeft -= panAmount
      setScrollPosition(container.scrollLeft)
    }
  }
  
  const handlePanRight = () => {
    const container = document.querySelector('.timeline-container')
    if (container) {
      const panAmount = zoomLevel === 'day' ? 200 : zoomLevel === 'week' ? 400 : 600
      container.scrollLeft += panAmount
      setScrollPosition(container.scrollLeft)
    }
  }
  
  const handleFitToContent = () => {
    // Find the earliest and latest job times
    let earliestTime = null
    let latestTime = null
    
    lines.forEach(line => {
      line.work_orders.forEach(wo => {
        if (wo.calculated_start_datetime && wo.calculated_end_datetime) {
          const startTime = new Date(wo.calculated_start_datetime)
          const endTime = new Date(wo.calculated_end_datetime)
          
          if (!earliestTime || startTime < earliestTime) {
            earliestTime = startTime
          }
          if (!latestTime || endTime > latestTime) {
            latestTime = endTime
          }
        }
      })
    })
    
    if (earliestTime && latestTime) {
      // Calculate the center point and adjust the view
      const centerTime = new Date((earliestTime.getTime() + latestTime.getTime()) / 2)
      const today = new Date()
      
      if (zoomLevel === 'day') {
        const dayDiff = Math.floor((centerTime - today) / (1000 * 60 * 60 * 24))
        setDayOffset(dayDiff)
      } else {
        const weekDiff = Math.floor((centerTime - today) / (1000 * 60 * 60 * 24 * 7))
        setWeekOffset(weekDiff)
      }
    }
  }
  
  // Zoom slider handler
  const handleZoomSliderChange = (value) => {
    setZoomSlider(value)
    const zoomLevels = ['day', 'week', 'month']
    setZoomLevel(zoomLevels[value])
  }
  
  // Quick date navigation
  const handleQuickDate = (dateType) => {
    setQuickDate(dateType)
    const today = new Date()
    
    switch (dateType) {
      case 'today':
        setDayOffset(0)
        setWeekOffset(0)
        break
      case 'tomorrow':
        setDayOffset(1)
        setWeekOffset(0)
        break
      case 'thisWeek':
        setDayOffset(0)
        setWeekOffset(0)
        break
      case 'nextWeek':
        setDayOffset(0)
        setWeekOffset(1)
        break
      case 'nextMonth':
        setDayOffset(0)
        setWeekOffset(4) // Approximately 4 weeks
        break
    }
  }
  
  // Time range selector
  const handleDateRangeSelect = (startDate, endDate) => {
    const today = new Date()
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // Calculate the center of the range
    const centerTime = new Date((start.getTime() + end.getTime()) / 2)
    
    if (zoomLevel === 'day') {
      const dayDiff = Math.floor((centerTime - today) / (1000 * 60 * 60 * 24))
      setDayOffset(dayDiff)
    } else {
      const weekDiff = Math.floor((centerTime - today) / (1000 * 60 * 60 * 24 * 7))
      setWeekOffset(weekDiff)
    }
  }
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handlePanLeft()
          break
        case 'ArrowRight':
          e.preventDefault()
          handlePanRight()
          break
        case 'Home':
          e.preventDefault()
          const container = document.querySelector('.timeline-container')
          if (container) {
            container.scrollLeft = 0
            setScrollPosition(0)
          }
          break
        case 'End':
          e.preventDefault()
          const containerEnd = document.querySelector('.timeline-container')
          if (containerEnd) {
            containerEnd.scrollLeft = containerEnd.scrollWidth
            setScrollPosition(containerEnd.scrollWidth)
          }
          break
        case '1':
          e.preventDefault()
          setZoomLevel('day')
          break
        case '2':
          e.preventDefault()
          setZoomLevel('week')
          break
        case '3':
          e.preventDefault()
          setZoomLevel('month')
          break
        case 'f':
        case 'F':
          e.preventDefault()
          handleFitToContent()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomLevel])
  
  // Calculate timeline based on zoom level
  const today = new Date()
  let startDate, days, timelineDays
  
  switch (zoomLevel) {
    case 'day':
      startDate = addDays(today, dayOffset)
      // Set to start of day for proper time calculations
      startDate.setHours(0, 0, 0, 0)
      days = [startDate]
      timelineDays = 1
      break
    case 'week':
      startDate = addDays(startOfWeek(today), weekOffset * 7)
      startDate.setHours(0, 0, 0, 0) // Set to start of day
      days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
      timelineDays = 7
      break
    case 'month':
    default:
      startDate = addDays(startOfWeek(today), weekOffset * 7)
      startDate.setHours(0, 0, 0, 0) // Set to start of day
      days = Array.from({ length: 28 }, (_, i) => addDays(startDate, i))
      timelineDays = 28
      break
  }
  
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  })

  // Fetch all work orders to get unscheduled ones
  const { data: allWorkOrders } = useQuery({
    queryKey: ['workOrders'],
    queryFn: () => getWorkOrders({ include_complete: false }),
    refetchInterval: 30000,
  })

  // Fetch capacity overrides to show line downtime
  // Use Monday start date to match capacity calendar (add 1 day to Sunday start)
  const { data: capacityOverrides } = useQuery({
    queryKey: ['capacityOverrides', weekOffset],
    queryFn: () => {
      const capacityStartDate = addDays(startDate, 1) // Monday instead of Sunday
      return getCapacityOverrides(capacityStartDate.toISOString().split('T')[0], 4)
    },
    refetchInterval: 30000,
  })

  // Debug logging for capacity overrides
  if (capacityOverrides) {
    const capacityStartDate = addDays(startDate, 1)
    console.log('Visual Scheduler Start Date:', startDate.toISOString().split('T')[0])
    console.log('Capacity Overrides Start Date:', capacityStartDate.toISOString().split('T')[0])
    console.log('Capacity Overrides Data:', JSON.stringify(capacityOverrides.data, null, 2))
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateWorkOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['workOrders'])
    },
  })

  const handleDragStart = (e, wo) => {
    if (wo.is_locked) {
      e.preventDefault()
      return
    }
    setDraggedWO(wo)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, lineId) => {
    e.preventDefault()
    setDragOverLine(lineId)
  }

  const handleDragLeave = () => {
    setDragOverLine(null)
  }

  const handleDrop = (e, targetLineId) => {
    e.preventDefault()
    setDragOverLine(null)
    
    if (!draggedWO) return

    // If dragging to same line, ignore
    if (draggedWO.line_id === targetLineId) {
      setDraggedWO(null)
      return
    }

    // Move WO to new line
    const updates = {
      line_id: targetLineId || null, // null for unscheduled
      line_position: null // Let backend auto-assign position
    }

    updateMutation.mutate({ id: draggedWO.id, data: updates })
    setDraggedWO(null)
  }

  // Helper function to check if a line is down on a specific date
  const isLineDownOnDate = (lineId, checkDate) => {
    if (!capacityOverrides?.data?.overrides_by_line?.[lineId]) {
      console.log(`No overrides found for line ${lineId}`)
      return false
    }
    
    const overrides = capacityOverrides.data.overrides_by_line[lineId]
    
    // Normalize checkDate to date-only (YYYY-MM-DD string) to avoid timezone issues
    const checkDateStr = format(checkDate, 'yyyy-MM-dd')
    console.log(`Checking line ${lineId} on ${checkDateStr}, ${overrides.length} overrides`)
    
    const isDown = overrides.some(override => {
      const startDateStr = override.start_date
      const endDateStr = override.end_date
      const isDownDay = override.is_down
      
      // Compare date strings directly to avoid timezone issues
      const inRange = checkDateStr >= startDateStr && checkDateStr <= endDateStr
      
      console.log(`  Override: ${startDateStr} to ${endDateStr}, ${override.total_hours}h, down=${isDownDay}, inRange=${inRange}`)
      
      // Debug logging
      if (inRange && isDownDay) {
        console.log(`✅ Line ${lineId} is down on ${checkDateStr}`, override)
      }
      
      return inRange && isDownDay
    })
    
    console.log(`Line ${lineId} down result: ${isDown}`)
    return isDown
  }

  const getWOPosition = (wo, lineStartDate) => {
    // Use datetimes if available, fall back to dates
    if (wo.calculated_start_datetime && wo.calculated_end_datetime) {
      const startDT = new Date(wo.calculated_start_datetime)
      const endDT = new Date(wo.calculated_end_datetime)
      
      // For day view, we need to calculate position within the day
      if (zoomLevel === 'day') {
        const dayStart = new Date(lineStartDate)
        dayStart.setHours(0, 0, 0, 0) // Start of day
        
        const startMinutes = differenceInMinutes(startDT, dayStart)
        const durationMinutes = differenceInMinutes(endDT, startDT)
        const totalMinutes = 24 * 60 // 24 hours in minutes
        
        return {
          left: `${(startMinutes / totalMinutes) * 100}%`,
          width: `${(durationMinutes / totalMinutes) * 100}%`,
          startMinutes,
          durationMinutes
        }
      } else {
        // For week/month view, calculate position from timeline start
        const totalMinutes = timelineDays * 24 * 60  // Dynamic based on zoom level
        const startMinutes = differenceInMinutes(startDT, lineStartDate)
        const durationMinutes = differenceInMinutes(endDT, startDT)
        
        return {
          left: `${(startMinutes / totalMinutes) * 100}%`,
          width: `${(durationMinutes / totalMinutes) * 100}%`,
          startMinutes,
          durationMinutes
        }
      }
    }
    
    // Fallback to date-only positioning
    if (!wo.calculated_start_date || !wo.calculated_end_date) return null
    
    const [startY, startM, startD] = wo.calculated_start_date.split('-').map(Number)
    const [endY, endM, endD] = wo.calculated_end_date.split('-').map(Number)
    
    const startDate = new Date(startY, startM - 1, startD)
    const endDate = new Date(endY, endM - 1, endD)
    
    const startDiff = differenceInDays(startDate, lineStartDate)
    const duration = differenceInDays(endDate, startDate) + 1
    
    return {
      left: `${(startDiff / timelineDays) * 100}%`,
      width: `${(duration / timelineDays) * 100}%`,
      startDiff,
      duration
    }
  }

  if (isLoading) {
    return <div className="container loading">Loading visual scheduler...</div>
  }

  const lines = dashboard?.data?.lines || []
  const unscheduledWOs = allWorkOrders?.data?.filter(wo => 
    !wo.line_id && wo.current_location === 'SMT PRODUCTION' // Only SMT PRODUCTION for scheduling
  ) || []

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Visual Scheduler</h1>
        <p className="page-description">Drag and drop work orders between lines • Dynamic zoom and navigation</p>
      </div>

      {/* Timeline Controls */}
      <div className="card" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Zoom Level Controls */}
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, marginRight: '0.5rem' }}>View:</span>
              <button 
                className={`btn btn-sm ${zoomLevel === 'day' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setZoomLevel('day')}
              >
                Day
              </button>
              <button 
                className={`btn btn-sm ${zoomLevel === 'week' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setZoomLevel('week')}
              >
                Week
              </button>
              <button 
                className={`btn btn-sm ${zoomLevel === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setZoomLevel('month')}
              >
                Month
              </button>
            </div>
            
            {/* Navigation Controls */}
            {zoomLevel === 'day' ? (
              <>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setDayOffset(dayOffset - 1)}
                >
                  ← Previous Day
                </button>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setDayOffset(0)}
                >
                  Today
                </button>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setDayOffset(dayOffset + 1)}
                >
                  Next Day →
                </button>
              </>
            ) : (
              <>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setWeekOffset(weekOffset - 1)}
                >
                  ← Previous Week
                </button>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setWeekOffset(0)}
                >
                  This Week
                </button>
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setWeekOffset(weekOffset + 1)}
                >
                  Next Week →
                </button>
              </>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {format(startDate, 'MMM d')} - {format(addDays(startDate, timelineDays - 1), 'MMM d, yyyy')}
          </div>
          
          {/* Enhanced Navigation Controls */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Pan Controls */}
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <button 
                className="btn btn-sm btn-outline-secondary" 
                onClick={handlePanLeft}
                title="Pan Left (←)"
              >
                ←
              </button>
              <button 
                className="btn btn-sm btn-outline-secondary" 
                onClick={handlePanRight}
                title="Pan Right (→)"
              >
                →
              </button>
            </div>
            
            {/* Fit to Content */}
            <button 
              className="btn btn-sm btn-outline-primary" 
              onClick={handleFitToContent}
              title="Fit to Content (F)"
            >
              📐 Fit
            </button>
            
            {/* Scroll Position Indicator */}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              <div>📍 Scroll: {Math.round(scrollPosition)}px</div>
            </div>
            
            {/* Keyboard Shortcuts Help */}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              <div>⌨️ 1=Day, 2=Week, 3=Month</div>
              <div>←→ Pan, Home/End=Jump, F=Fit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Interactive Controls */}
      <div className="card" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Zoom Slider */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Zoom:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Day</span>
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                value={zoomSlider}
                onChange={(e) => handleZoomSliderChange(parseInt(e.target.value))}
                style={{
                  width: '100px',
                  height: '4px',
                  background: 'var(--border)',
                  outline: 'none',
                  borderRadius: '2px'
                }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Month</span>
            </div>
            <div style={{ 
              fontSize: '0.65rem', 
              color: 'var(--primary)', 
              fontWeight: 600,
              padding: '0.25rem 0.5rem',
              background: 'var(--primary-light)',
              borderRadius: '4px',
              border: '1px solid var(--primary)'
            }}>
              {zoomLevel === 'day' ? '🔍 Day View' : zoomLevel === 'week' ? '📅 Week View' : '📊 Month View'}
            </div>
          </div>

          {/* Quick Date Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Quick Jump:</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                className={`btn btn-sm ${quickDate === 'today' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleQuickDate('today')}
                title="Jump to Today"
              >
                📅 Today
              </button>
              <button 
                className={`btn btn-sm ${quickDate === 'tomorrow' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleQuickDate('tomorrow')}
                title="Jump to Tomorrow"
              >
                📅 Tomorrow
              </button>
              <button 
                className={`btn btn-sm ${quickDate === 'thisWeek' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleQuickDate('thisWeek')}
                title="Jump to This Week"
              >
                📅 This Week
              </button>
              <button 
                className={`btn btn-sm ${quickDate === 'nextWeek' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleQuickDate('nextWeek')}
                title="Jump to Next Week"
              >
                📅 Next Week
              </button>
              <button 
                className={`btn btn-sm ${quickDate === 'nextMonth' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleQuickDate('nextMonth')}
                title="Jump to Next Month"
              >
                📅 Next Month
              </button>
            </div>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Date Range:</span>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <input
                type="date"
                style={{
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'white'
                }}
                onChange={(e) => {
                  const endDate = document.getElementById('endDateRange')
                  if (endDate && e.target.value) {
                    endDate.min = e.target.value
                  }
                }}
                title="Start Date"
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>to</span>
              <input
                id="endDateRange"
                type="date"
                style={{
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'white'
                }}
                title="End Date"
              />
              <button 
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  const startInput = document.querySelector('input[type="date"]:not(#endDateRange)')
                  const endInput = document.getElementById('endDateRange')
                  if (startInput?.value && endInput?.value) {
                    handleDateRangeSelect(startInput.value, endInput.value)
                  }
                }}
                title="Jump to Selected Date Range"
              >
                🎯 Go
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unscheduled Pool */}
      <div className="card" style={{ background: '#fff3cd', borderLeft: '4px solid #ffc107', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <AlertCircle size={16} />
          <strong style={{ fontSize: '0.8rem' }}>Unscheduled Work Orders ({unscheduledWOs.length})</strong>
        </div>
        <div 
          style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            flexWrap: 'wrap',
            minHeight: unscheduledWOs.length > 0 ? 'auto' : '3rem',
            padding: '0.5rem',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: '4px'
          }}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          {unscheduledWOs.length > 0 ? (
            unscheduledWOs.map(wo => (
              <div key={wo.id} style={{ width: '150px' }}>
                <WorkOrderBlock 
                  wo={wo} 
                  onDragStart={handleDragStart}
                  isDragging={draggedWO?.id === wo.id}
                />
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '0.5rem' }}>
              All work orders are scheduled. Drag a job here to unschedule it.
            </div>
          )}
        </div>
      </div>

      {/* Timeline Header */}
      <div 
        className="card timeline-container" 
        style={{ 
          padding: 0, 
          overflow: 'auto',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'thin'
        }}
        onWheel={handleWheelScroll}
        onScroll={(e) => setScrollPosition(e.target.scrollLeft)}
      >
        <div style={{ 
          minWidth: zoomLevel === 'day' ? '2400px' : zoomLevel === 'week' ? '1200px' : '1200px',
          transition: 'min-width 0.3s ease-in-out'
        }}>
          {/* Date Header */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '180px 1fr',
            borderBottom: '2px solid var(--border)',
            background: 'var(--bg-secondary)',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}>
            <div style={{ padding: '0.5rem', fontWeight: 600, fontSize: '0.75rem' }}>
              PRODUCTION LINE
            </div>
            <div style={{ display: 'flex' }}>
              {days.map((day, i) => {
                if (zoomLevel === 'day') {
                  // Show hours for day view
                  const hours = Array.from({ length: 24 }, (_, h) => h)
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex' }}>
                      {hours.map(hour => (
                        <div
                          key={hour}
                          style={{
                            flex: 1,
                            padding: '0.2rem 0.1rem',
                            textAlign: 'center',
                            fontSize: '0.6rem',
                            borderLeft: hour > 0 ? '1px solid var(--border)' : 'none',
                            background: hour >= 7 && hour < 16 ? '#e8f5e8' : hour >= 15 && hour < 24 ? '#e8f0ff' : '#f8f9fa',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {hour === 0 ? '12A' : hour < 12 ? `${hour}A` : hour === 12 ? '12P' : `${hour-12}P`}
                        </div>
                      ))}
                    </div>
                  )
                } else {
                  // Show days for week/month view
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        padding: '0.3rem 0.2rem',
                        textAlign: 'center',
                        fontSize: '0.65rem',
                        background: isWeekend(day) ? '#f8f9fa' : 'transparent',
                        borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                        color: isWeekend(day) ? 'var(--text-secondary)' : 'var(--text-primary)'
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{format(day, 'EEE')}</div>
                      <div>{format(day, 'd')}</div>
                    </div>
                  )
                }
              })}
            </div>
          </div>

          {/* Production Lines */}
          {lines.filter(l => l.line.is_active).map(line => (
            <div
              key={line.line.id}
              onDragOver={(e) => handleDragOver(e, line.line.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, line.line.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr',
                borderBottom: '1px solid var(--border)',
                background: dragOverLine === line.line.id ? '#e3f2fd' : 'white',
                transition: 'background 0.2s',
                minHeight: '5rem'
              }}
            >
              {/* Line Name */}
              <div style={{ 
                padding: '0.75rem 0.5rem',
                borderRight: '2px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                background: isLineDownOnDate(line.line.id, new Date()) ? '#ffe6e6' : 'transparent',
                border: isLineDownOnDate(line.line.id, new Date()) ? '2px solid #ff6b6b' : 'none',
                borderRadius: '4px'
              }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {line.line.name}
                  {isLineDownOnDate(line.line.id, new Date()) && (
                    <Wrench size={12} style={{ color: '#dc3545' }} title="Line Currently Down" />
                  )}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  {line.total_jobs} jobs • {line.trolleys_in_use} trolleys
                </div>
                {line.completion_date && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600 }}>
                    → {format(new Date(line.completion_date), 'MMM d')}
                  </div>
                )}
                {isLineDownOnDate(line.line.id, new Date()) && (
                  <div style={{ fontSize: '0.6rem', color: '#dc3545', fontWeight: 600 }}>
                    ⚠️ DOWN
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div style={{ position: 'relative', padding: '0.5rem 0' }}>
                {/* Maintenance/Downtime indicators */}
                {days.map((day, dayIndex) => {
                  if (isLineDownOnDate(line.line.id, day)) {
                    const leftPercent = (dayIndex / 28) * 100
                    const widthPercent = (1 / 28) * 100
                    
                    return (
                      <div
                        key={`maintenance-${dayIndex}`}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          height: '100%',
                          background: 'repeating-linear-gradient(45deg, #ff6b6b, #ff6b6b 10px, #ff5252 10px, #ff5252 20px)',
                          opacity: 0.7,
                          zIndex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none'
                        }}
                        title="Line Down for Maintenance"
                      >
                        <Wrench size={16} style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
                      </div>
                    )
                  }
                  return null
                })}
                {/* Weekend shading - make more visible */}
                {days.map((day, i) => (
                  isWeekend(day) && (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${(i / 28) * 100}%`,
                        width: `${(1 / 28) * 100}%`,
                        top: 0,
                        bottom: 0,
                        background: 'repeating-linear-gradient(45deg, #f8f9fa, #f8f9fa 10px, #e9ecef 10px, #e9ecef 20px)',
                        borderLeft: '2px solid #dee2e6',
                        borderRight: '2px solid #dee2e6',
                        pointerEvents: 'none',
                        zIndex: 1
                      }}
                    />
                  )
                ))}

                {/* Work Order Blocks */}
                {line.work_orders
                  .filter(wo => wo.calculated_start_datetime || wo.calculated_start_date)
                  .map(wo => {
                    const position = getWOPosition(wo, startDate)
                    if (!position) return null
                    // Only show if within visible timeline
                    if (position.startMinutes !== undefined) {
                      if (zoomLevel === 'day') {
                        // For day view, show if job is within the 24-hour period
                        if (position.startMinutes < 0 || position.startMinutes > 24 * 60) return null
                      } else {
                        // For week/month view, show if job is within the timeline period
                        if (position.startMinutes < 0 || position.startMinutes > timelineDays * 24 * 60) return null
                      }
                    }
                    if (position.startDiff !== undefined && (position.startDiff < 0 || position.startDiff > timelineDays)) return null

                    return (
                      <div
                        key={wo.id}
                        style={{
                          position: 'absolute',
                          left: position.left,
                          width: position.width,
                          top: '0.5rem',
                          marginBottom: '0.5rem',
                          zIndex: 5
                        }}
                      >
                        <WorkOrderBlock 
                          wo={wo} 
                          onDragStart={handleDragStart}
                          isDragging={draggedWO?.id === wo.id}
                          showTime={true}
                        />
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="card" style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          PRIORITY LEGEND:
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
          {Object.entries(PRIORITY_COLORS).map(([priority, color]) => (
            <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                background: color, 
                borderRadius: '3px',
                border: '1px solid rgba(0,0,0,0.1)'
              }} />
              {priority}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
            <Lock size={12} />
            Locked (cannot drag)
          </div>
        </div>
      </div>
    </div>
  )
}

