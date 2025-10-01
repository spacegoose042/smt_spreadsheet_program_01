import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDashboard, getWorkOrders, updateWorkOrder } from '../api'
import { format, addDays, differenceInDays, startOfWeek, isWeekend } from 'date-fns'
import { Lock, AlertCircle } from 'lucide-react'

const PRIORITY_COLORS = {
  'Critical Mass': '#dc3545',
  'Overclocked': '#ff6b35',
  'Factory Default': '#0066cc',
  'Trickle Charge': '#6c757d',
  'Power Down': '#adb5bd'
}

function WorkOrderBlock({ wo, onDragStart, isDragging }) {
  const canDrag = !wo.is_locked
  
  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => canDrag && onDragStart(e, wo)}
      style={{
        background: PRIORITY_COLORS[wo.priority] || '#0066cc',
        color: 'white',
        padding: '0.4rem 0.5rem',
        borderRadius: '4px',
        cursor: canDrag ? 'grab' : 'not-allowed',
        fontSize: '0.7rem',
        border: '2px solid rgba(0,0,0,0.1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minHeight: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}
      title={`${wo.customer} - ${wo.assembly} ${wo.revision}\nWO: ${wo.wo_number}\n${wo.quantity} units\n${wo.time_minutes} min${wo.is_locked ? ' (LOCKED)' : ''}`}
    >
      {wo.is_locked && (
        <Lock size={10} style={{ position: 'absolute', top: '2px', right: '2px' }} />
      )}
      <div style={{ fontWeight: 600, fontSize: '0.75rem' }}>
        {wo.customer}
      </div>
      <div style={{ fontSize: '0.65rem', opacity: 0.9 }}>
        {wo.assembly} • {wo.quantity}u
      </div>
    </div>
  )
}

export default function VisualScheduler() {
  const queryClient = useQueryClient()
  const [draggedWO, setDraggedWO] = useState(null)
  const [dragOverLine, setDragOverLine] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  
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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateWorkOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['workOrders'])
    },
  })

  // Calculate timeline (show 4 weeks starting from this week)
  const today = new Date()
  const startDate = addDays(startOfWeek(today), weekOffset * 7)
  const days = Array.from({ length: 28 }, (_, i) => addDays(startDate, i))

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

  const getWOPosition = (wo, lineStartDate) => {
    if (!wo.calculated_start_date || !wo.calculated_end_date) return null
    
    const startDate = new Date(wo.calculated_start_date)
    const endDate = new Date(wo.calculated_end_date)
    
    const startDiff = differenceInDays(startDate, lineStartDate)
    const duration = differenceInDays(endDate, startDate) + 1
    
    return {
      left: `${(startDiff / 28) * 100}%`,
      width: `${(duration / 28) * 100}%`,
      startDiff,
      duration
    }
  }

  if (isLoading) {
    return <div className="container loading">Loading visual scheduler...</div>
  }

  const lines = dashboard?.data?.lines || []
  const unscheduledWOs = allWorkOrders?.data?.filter(wo => !wo.line_id) || []

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Visual Scheduler</h1>
        <p className="page-description">Drag and drop work orders between lines</p>
      </div>

      {/* Timeline Controls */}
      <div className="card" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {format(startDate, 'MMM d')} - {format(addDays(startDate, 27), 'MMM d, yyyy')}
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
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div style={{ minWidth: '1200px' }}>
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
              {days.map((day, i) => (
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
              ))}
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
                minHeight: '4rem'
              }}
            >
              {/* Line Name */}
              <div style={{ 
                padding: '0.75rem 0.5rem',
                borderRight: '2px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                  {line.line.name}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  {line.total_jobs} jobs • {line.trolleys_in_use} trolleys
                </div>
                {line.completion_date && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600 }}>
                    → {format(new Date(line.completion_date), 'MMM d')}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div style={{ position: 'relative', padding: '0.5rem 0' }}>
                {/* Weekend shading */}
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
                        background: 'rgba(0,0,0,0.02)',
                        pointerEvents: 'none'
                      }}
                    />
                  )
                ))}

                {/* Work Order Blocks */}
                {line.work_orders
                  .filter(wo => wo.calculated_start_date && wo.calculated_end_date)
                  .map(wo => {
                    const position = getWOPosition(wo, startDate)
                    if (!position || position.startDiff < 0 || position.startDiff > 28) return null

                    return (
                      <div
                        key={wo.id}
                        style={{
                          position: 'absolute',
                          left: position.left,
                          width: position.width,
                          top: '0.5rem',
                          marginBottom: '0.5rem'
                        }}
                      >
                        <WorkOrderBlock 
                          wo={wo} 
                          onDragStart={handleDragStart}
                          isDragging={draggedWO?.id === wo.id}
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

