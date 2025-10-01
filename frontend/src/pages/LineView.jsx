import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, getWorkOrders, completeWorkOrder } from '../api'
import { format } from 'date-fns'
import { Clock, Package, Calendar, CheckCircle } from 'lucide-react'
import CompleteJobModal from '../components/CompleteJobModal'

function StatusBadge({ status }) {
  const colors = {
    'Running': 'badge-success',
    '2nd Side Running': 'badge-success',
    'Clear to Build': 'badge-info',
    'Clear to Build *': 'badge-info',
    'On Hold': 'badge-warning',
    'Program/Stencil': 'badge-secondary'
  }
  return <span className={`badge ${colors[status] || 'badge-secondary'}`}>{status}</span>
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
  const queryClient = useQueryClient()
  
  const { data: lines } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(),
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
  const groupedByLine = !lineId && workOrders?.data && lines?.data
    ? lines.data.map(line => ({
        line,
        workOrders: workOrders.data
          .filter(wo => wo.line_id === line.id)
          .sort((a, b) => (a.line_position || 999) - (b.line_position || 999))
      }))
    : null

  const selectedLine = lineId && lines?.data 
    ? lines.data.find(l => l.id === parseInt(lineId))
    : null

  const filteredWOs = lineId && workOrders?.data
    ? workOrders.data.sort((a, b) => (a.line_position || 999) - (b.line_position || 999))
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

  // Single line view
  if (selectedLine) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{selectedLine.name}</h1>
          <p className="page-description">
            {selectedLine.hours_per_day}h/day • {selectedLine.hours_per_week}h/week
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
                {filteredWOs.map((wo, idx) => (
                  <tr key={wo.id} style={{ 
                    background: wo.is_locked ? '#fff3cd' : idx === 0 ? '#d4edda' : 'transparent',
                    fontWeight: idx === 0 ? 600 : 'normal'
                  }}>
                    <td>{wo.line_position}</td>
                    <td>{wo.customer}</td>
                    <td>
                      {wo.assembly} {wo.revision}
                      {wo.is_new_rev_assembly && <span style={{ color: 'var(--danger)' }}>*</span>}
                    </td>
                    <td><code>{wo.wo_number}</code></td>
                    <td>{wo.quantity}</td>
                    <td><StatusBadge status={wo.status} /></td>
                    <td><PriorityBadge priority={wo.priority} /></td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {wo.calculated_start_datetime ? (
                        <div>
                          <div>{format(new Date(wo.calculated_start_datetime), 'MMM d, yyyy')}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                            {format(new Date(wo.calculated_start_datetime), 'h:mm a')}
                          </div>
                        </div>
                      ) : wo.calculated_start_date ? (
                        format(new Date(wo.calculated_start_date), 'MMM d, yyyy')
                      ) : '-'}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                      {wo.calculated_end_datetime ? (
                        <div>
                          <div>{format(new Date(wo.calculated_end_datetime), 'MMM d, yyyy')}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                            {format(new Date(wo.calculated_end_datetime), 'h:mm a')}
                          </div>
                        </div>
                      ) : wo.calculated_end_date ? (
                        format(new Date(wo.calculated_end_date), 'MMM d, yyyy')
                      ) : '-'}
                    </td>
                    <td>{wo.actual_ship_date ? format(new Date(wo.actual_ship_date), 'MMM d') : '-'}</td>
                    <td>{wo.time_minutes} min</td>
                    <td>{wo.trolley_count}</td>
                    <td>{wo.notes}</td>
                    <td>
                      <button 
                        className="btn btn-sm btn-success" 
                        onClick={() => setCompletingWO(wo)}
                        title="Mark as Complete"
                      >
                        <CheckCircle size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
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
                {line.hours_per_day}h/day
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
                      <StatusBadge status={workOrders[0].status} />
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

