import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, getWorkOrders, completeWorkOrder, getCurrentCapacity } from '../api'
import { format } from 'date-fns'
import { Clock, Package, Calendar, CheckCircle, AlertTriangle } from 'lucide-react'
import CompleteJobModal from '../components/CompleteJobModal'
import ReportIssueModal from '../components/ReportIssueModal'

function StatusBadge({ status, statusName, statusColor }) {
  // Use new status system if available, fallback to legacy, default to Unassigned
  const name = statusName || (status ? status : 'Unassigned')
  const color = statusColor
  
  // Legacy fallback colors if no color provided
  const legacyColors = {
    'Running': 'badge-success',
    '2nd Side Running': 'badge-success',
    'Clear to Build': 'badge-info',
    'Clear to Build *': 'badge-info',
    'On Hold': 'badge-warning',
    'Program/Stencil': 'badge-secondary'
  }
  
  if (color) {
    return (
      <span 
        className="badge"
        style={{ background: color, color: 'white', padding: '0.25rem 0.5rem' }}
      >
        {name}
      </span>
    )
  }
  
  return <span className={`badge ${legacyColors[name] || 'badge-secondary'}`}>{name}</span>
}

function PriorityBadge({ priority }) {
  const colors = {
    'Critical Mass': 'badge-danger',
    'Overclocked': 'badge-warning',
    'Factory Default': 'badge-info',
    'Trickle Charge': 'badge-secondary',
    'Power Down': 'badge-secondary'
  }
  return <span className={`badge ${colors[priority] || 'badge-secondary'}`}>{priority}</span>
}

export default function LineView() {
  const { lineId } = useParams()
  const [completingWO, setCompletingWO] = useState(null)
  const [reportingIssueWO, setReportingIssueWO] = useState(null)
  const queryClient = useQueryClient()
  
  const { data: lines } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(),
  })

  const { data: currentCapacity } = useQuery({
    queryKey: ['currentCapacity'],
    queryFn: () => getCurrentCapacity(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: workOrders, isLoading } = useQuery({
    queryKey: ['workOrders', lineId],
    queryFn: () => getWorkOrders({ 
      line_id: lineId || undefined,
      include_complete: false
    }),
    enabled: !!lineId || !lineId, // Always enabled
    refetchInterval: 10000, // Refresh every 10 seconds for operators
  })

  // Filter work orders to only show SMT PRODUCTION for visual scheduling
  const filteredWorkOrders = workOrders?.data?.filter(wo => {
    // If viewing a specific line, show all work orders for that line
    if (lineId) return true
    
    // For visual scheduling (no lineId), only show SMT PRODUCTION work orders
    return wo.current_location === 'SMT PRODUCTION'
  }) || []

  const completeMutation = useMutation({
    mutationFn: ({ id, data }) => completeWorkOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['completed'])
      setCompletingWO(null)
    },
  })

  const handleComplete = (data) => {
    completeMutation.mutate({ id: completingWO.id, data })
  }

  // Group work orders by line if no specific line selected
  const groupedByLine = !lineId && filteredWorkOrders && lines?.data
    ? lines.data.map(line => ({
        line,
        workOrders: filteredWorkOrders
          .filter(wo => wo.line_id === line.id)
          .sort((a, b) => (a.line_position || 999) - (b.line_position || 999))
      }))
    : null

  const selectedLine = lineId && lines?.data 
    ? lines.data.find(l => l.id === parseInt(lineId))
    : null

  const filteredWOs = lineId && filteredWorkOrders
    ? filteredWorkOrders.sort((a, b) => (a.line_position || 999) - (b.line_position || 999))
    : []

  if (isLoading) {
    return <div className="container loading">Loading...</div>
  }

  if (completingWO) {
    return (
      <>
        <CompleteJobModal
          workOrder={completingWO}
          onComplete={handleComplete}
          onCancel={() => setCompletingWO(null)}
          isSubmitting={completeMutation.isPending}
        />
      </>
    )
  }

  // Render Report Issue Modal
  if (reportingIssueWO) {
    return (
      <>
        <ReportIssueModal
          workOrder={reportingIssueWO}
          onClose={() => setReportingIssueWO(null)}
        />
      </>
    )
  }

  // Single line view
  if (selectedLine) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{selectedLine.name}</h1>
          <p className="page-description">
            {(() => {
              const capacity = currentCapacity?.data?.[selectedLine.id]
              if (capacity) {
                if (capacity.is_down) {
                  return `🔴 DOWN (0h today) • ${selectedLine.hours_per_week}h/week`
                } else if (capacity.is_override) {
                  return `⚡ ${capacity.actual_hours_today}h today (override) • ${selectedLine.hours_per_week}h/week`
                } else {
                  return `${capacity.actual_hours_today}h/day • ${selectedLine.hours_per_week}h/week`
                }
              }
              return `${selectedLine.hours_per_day}h/day • ${selectedLine.hours_per_week}h/week`
            })()}
            {selectedLine.special_customer_name && ` • ${selectedLine.special_customer_name} Dedicated`}
          </p>
        </div>

        {filteredWOs.length === 0 ? (
          <div className="card empty-state">
            <p>No work orders scheduled on this line</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
              <tr>
                <th>Pos</th>
                <th>Customer</th>
                <th>Assembly</th>
                <th>WO #</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Ship Date</th>
                <th>Time</th>
                <th>Trolleys</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
              </thead>
              <tbody>
                {filteredWOs.map((wo, idx) => {
                  const runtimeHours = wo.time_minutes ? Math.round(wo.time_minutes / 60 * 10) / 10 : 0;
                  const setupHours = wo.setup_time_hours || 1;
                  const totalHours = runtimeHours + setupHours;
                  const minStartDate = wo.min_start_date ? format(new Date(wo.min_start_date), 'MMM d, yyyy') : '-';
                  
                  return (
                    <tr 
                      key={wo.id} 
                      style={{ 
                        background: wo.is_locked ? '#fff3cd' : idx === 0 ? '#d4edda' : 'transparent',
                        fontWeight: idx === 0 ? 600 : 'normal',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = wo.is_locked ? '#ffeaa7' : idx === 0 ? '#a8e6cf' : '#f8f9fa';
                        e.currentTarget.style.transform = 'scale(1.01)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = wo.is_locked ? '#fff3cd' : idx === 0 ? '#d4edda' : 'transparent';
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      title={`${wo.customer} - ${wo.assembly} ${wo.revision}\nWO: ${wo.wo_number}\nQty: ${wo.quantity}\nRuntime: ${runtimeHours}h + Setup: ${setupHours}h = ${totalHours}h total\nMin Start: ${minStartDate}\nStatus: ${wo.status_name || wo.status || 'Unassigned'}\nPriority: ${wo.priority}\n${wo.notes ? `Notes: ${wo.notes}` : ''}`}
                    >
                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{wo.line_position}</td>
                      <td style={{ fontWeight: 500 }}>{wo.customer}</td>
                      <td style={{ fontWeight: 500 }}>
                        {wo.assembly} {wo.revision}
                        {wo.is_new_rev_assembly && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
                      </td>
                      <td><code style={{ fontSize: '0.9rem', background: '#f8f9fa', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>{wo.wo_number}</code></td>
                      <td style={{ fontWeight: 500, textAlign: 'center' }}>{wo.quantity}</td>
                      <td><StatusBadge status={wo.status} statusName={wo.status_name} statusColor={wo.status_color} /></td>
                      <td><PriorityBadge priority={wo.priority} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {wo.calculated_start_datetime ? (
                          <div>
                            <div>{format(new Date(wo.calculated_start_datetime), 'MMM d, yyyy')}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                              {format(new Date(wo.calculated_start_datetime), 'h:mm a')}
                            </div>
                          </div>
                        ) : wo.calculated_start_date ? (
                          format(new Date(wo.calculated_start_date), 'MMM d, yyyy')
                        ) : '-'}
                        {minStartDate !== '-' && (
                          <div style={{ fontSize: '0.7rem', color: '#6c757d', marginTop: '0.25rem' }}>
                            Min: {minStartDate}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                        {wo.calculated_end_datetime ? (
                          <div>
                            <div>{format(new Date(wo.calculated_end_datetime), 'MMM d, yyyy')}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                              {format(new Date(wo.calculated_end_datetime), 'h:mm a')}
                            </div>
                          </div>
                        ) : wo.calculated_end_date ? (
                          format(new Date(wo.calculated_end_date), 'MMM d, yyyy')
                        ) : '-'}
                      </td>
                      <td style={{ color: wo.actual_ship_date && new Date(wo.actual_ship_date) < new Date() ? '#dc3545' : 'inherit' }}>
                        {wo.actual_ship_date ? format(new Date(wo.actual_ship_date), 'MMM d') : '-'}
                      </td>
                      <td style={{ fontWeight: 500, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.9rem' }}>
                          <div style={{ color: '#28a745' }}>{runtimeHours}h</div>
                          <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                            +{setupHours}h setup
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#495057', fontWeight: 600 }}>
                            = {totalHours}h total
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 500 }}>{wo.trolley_count}</td>
                      <td style={{ maxWidth: '150px', fontSize: '0.85rem' }}>{wo.notes}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-sm btn-success" 
                            onClick={() => setCompletingWO(wo)}
                            title="Mark as Complete"
                            style={{ padding: '0.4rem 0.6rem' }}
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button 
                            className="btn btn-sm btn-warning" 
                            onClick={() => setReportingIssueWO(wo)}
                            title="Report Issue"
                            style={{ padding: '0.4rem 0.6rem' }}
                          >
                            <AlertTriangle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // All lines overview
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Line Views</h1>
        <p className="page-description">Individual line schedules for operators</p>
      </div>

      <div className="grid grid-cols-2">
        {lines?.data.map(line => (
          <a
            key={line.id}
            href={`/lines/${line.id}`}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>{line.name}</h3>
            {line.special_customer_name && (
              <span className="badge badge-info" style={{ marginBottom: '1rem' }}>
                {line.special_customer_name} Dedicated
              </span>
            )}
            
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={16} />
                {(() => {
                  const capacity = currentCapacity?.data?.[line.id]
                  if (capacity) {
                    if (capacity.is_down) {
                      return <span style={{ color: '#dc3545' }}>🔴 DOWN (0h today)</span>
                    } else if (capacity.is_override) {
                      return <span style={{ color: '#ff6b35' }}>⚡ {capacity.actual_hours_today}h today (override)</span>
                    } else {
                      return `${capacity.actual_hours_today}h/day`
                    }
                  }
                  return `${line.hours_per_day}h/day`
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} />
                {line.hours_per_week}h/week
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Quick Overview */}
      {groupedByLine && (
        <div className="section">
          <h2 className="section-title">All Lines Overview</h2>
          {groupedByLine.map(({ line, workOrders }) => (
            <div key={line.id} className="card">
              <h3>{line.name}</h3>
              {workOrders.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>No jobs scheduled</p>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    {workOrders.length} job{workOrders.length !== 1 ? 's' : ''} queued
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '4px' }}>
                    <strong>Next:</strong> {workOrders[0].customer} - {workOrders[0].assembly} ({workOrders[0].wo_number})
                    <div style={{ marginTop: '0.5rem' }}>
                      <StatusBadge status={workOrders[0].status} statusName={workOrders[0].status_name} statusColor={workOrders[0].status_color} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

