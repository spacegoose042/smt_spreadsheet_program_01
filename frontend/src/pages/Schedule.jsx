import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWorkOrders, getLines, createWorkOrder, updateWorkOrder, deleteWorkOrder, completeWorkOrder, getDashboard } from '../api'
import { Plus, Edit2, Trash2, Lock, Unlock, CheckCircle, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import WorkOrderForm from '../components/WorkOrderForm'
import CompleteJobModal from '../components/CompleteJobModal'

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

export default function Schedule() {
  const [showForm, setShowForm] = useState(false)
  const [editingWO, setEditingWO] = useState(null)
  const [completingWO, setCompletingWO] = useState(null)
  const [filterLine, setFilterLine] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [draggedWO, setDraggedWO] = useState(null)
  const [dragOverWO, setDragOverWO] = useState(null)
  
  const queryClient = useQueryClient()

  const { data: workOrders, isLoading: loadingWOs } = useQuery({
    queryKey: ['workOrders', filterLine, filterStatus],
    queryFn: () => getWorkOrders({
      line_id: filterLine === 'unscheduled' ? undefined : (filterLine || undefined),
      status: filterStatus || undefined,
      include_complete: false
    }),
  })

  // Filter unscheduled if that option is selected
  const filteredWorkOrders = workOrders?.data.filter(wo => {
    if (filterLine === 'unscheduled') {
      return !wo.line_id
    }
    return true
  })

  const { data: lines } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(),
  })

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  })

  const createMutation = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateWorkOrder(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
      setEditingWO(null)
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
    },
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

  const toggleLock = (wo) => {
    updateMutation.mutate({
      id: wo.id,
      data: { is_locked: !wo.is_locked }
    })
  }

  const handleEdit = (wo) => {
    setEditingWO(wo)
    setShowForm(true)
  }

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this work order?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleSubmit = (data) => {
    if (editingWO) {
      updateMutation.mutate({ id: editingWO.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingWO(null)
  }

  const handleComplete = (data) => {
    completeMutation.mutate({ id: completingWO.id, data })
  }

  // Drag and drop handlers (only when filtered to single line)
  const isDraggable = filterLine && filterLine !== 'unscheduled' && filterLine !== ''

  const handleDragStart = (e, wo) => {
    if (!isDraggable || wo.is_locked) {
      e.preventDefault()
      return
    }
    setDraggedWO(wo)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, wo) => {
    if (!isDraggable) return
    e.preventDefault()
    setDragOverWO(wo)
  }

  const handleDragEnd = () => {
    setDraggedWO(null)
    setDragOverWO(null)
  }

  const handleDrop = async (e, targetWO) => {
    e.preventDefault()
    
    if (!draggedWO || !targetWO || draggedWO.id === targetWO.id) {
      setDraggedWO(null)
      setDragOverWO(null)
      return
    }

    // Update the dragged work order's position to match the target
    try {
      await updateWorkOrder(draggedWO.id, {
        line_position: targetWO.line_position
      })
      queryClient.invalidateQueries(['workOrders'])
      queryClient.invalidateQueries(['dashboard'])
    } catch (error) {
      console.error('Error reordering:', error)
      alert(error.response?.data?.detail || 'Failed to reorder work order')
    }
    
    setDraggedWO(null)
    setDragOverWO(null)
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

  return (
    <div className="container">
      {showForm && (
        <WorkOrderForm
          initialData={editingWO}
          lines={lines?.data || []}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}
      
      <div className="page-header">
        <h1 className="page-title">Production Schedule</h1>
        <p className="page-description">Manage all work orders across production lines</p>
      </div>

      {/* Line Completion Summary */}
      {dashboard?.data && (
        <div className="card" style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          color: 'white',
          marginBottom: '1rem',
          padding: '1rem'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginBottom: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            <Calendar size={16} />
            Line Completion Dates
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '0.75rem' 
          }}>
            {dashboard.data.lines
              .filter(line => line.line.is_active)
              .map(line => (
              <div 
                key={line.line.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                <div style={{ 
                  fontSize: '0.75rem', 
                  opacity: 0.9,
                  fontWeight: 500
                }}>
                  {line.line.name}
                </div>
                <div style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {line.completion_date ? (
                    <>
                      {format(new Date(line.completion_date), 'MMM d, yyyy')}
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                        ({line.total_jobs} jobs)
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>No jobs</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <select 
              className="form-select"
              value={filterLine}
              onChange={(e) => setFilterLine(e.target.value)}
            >
              <option value="">All Lines</option>
              <option value="unscheduled">⚠️ Unscheduled</option>
              {lines?.data.map(line => (
                <option key={line.id} value={line.id}>{line.name}</option>
              ))}
            </select>
          </div>
          
          <div style={{ flex: 1, minWidth: '200px' }}>
            <select 
              className="form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Clear to Build">Clear to Build</option>
              <option value="Clear to Build *">Clear to Build *</option>
              <option value="Running">Running</option>
              <option value="2nd Side Running">2nd Side Running</option>
              <option value="On Hold">On Hold</option>
              <option value="Program/Stencil">Program/Stencil</option>
            </select>
          </div>
          
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Add Work Order
          </button>
        </div>
        
        {/* Drag and drop hint */}
        {isDraggable && (
          <div style={{ 
            marginTop: '0.75rem', 
            padding: '0.5rem 0.75rem', 
            background: '#e7f3ff', 
            borderLeft: '3px solid var(--primary)',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#004085'
          }}>
            💡 <strong>Drag &amp; Drop enabled:</strong> Drag work order rows to reorder them on this line. Locked jobs cannot be moved.
          </div>
        )}
      </div>

      {/* Work Orders Table */}
      {loadingWOs ? (
        <div className="loading">Loading work orders...</div>
      ) : !filteredWorkOrders || filteredWorkOrders.length === 0 ? (
        <div className="card empty-state">
          <p>{filterLine === 'unscheduled' ? 'No unscheduled work orders.' : 'No work orders found. Click "Add Work Order" to create one.'}</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
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
                <th>Line</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Ship Date</th>
                <th>Time</th>
                <th>Trolleys</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders
                .sort((a, b) => {
                  // Sort by line, then position
                  if (a.line_id !== b.line_id) return (a.line_id || 999) - (b.line_id || 999)
                  return (a.line_position || 999) - (b.line_position || 999)
                })
                .map((wo) => (
                <tr 
                  key={wo.id} 
                  draggable={isDraggable && !wo.is_locked}
                  onDragStart={(e) => handleDragStart(e, wo)}
                  onDragOver={(e) => handleDragOver(e, wo)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, wo)}
                  style={{ 
                    background: wo.is_locked ? '#fff3cd' : dragOverWO?.id === wo.id ? '#e3f2fd' : 'transparent',
                    opacity: draggedWO?.id === wo.id ? 0.5 : (wo.run_together_group ? 0.95 : 1),
                    cursor: isDraggable && !wo.is_locked ? 'move' : 'default',
                    transition: 'all 0.2s'
                  }}
                >
                  <td>{wo.line_position || '-'}</td>
                  <td>{wo.customer}</td>
                  <td>
                    {wo.assembly} {wo.revision}
                    {wo.is_new_rev_assembly && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
                  </td>
                  <td><code>{wo.wo_number}</code></td>
                  <td>{wo.quantity}</td>
                  <td><StatusBadge status={wo.status} /></td>
                  <td><PriorityBadge priority={wo.priority} /></td>
                  <td>
                    {wo.line?.name || <em style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠️ Unscheduled</em>}
                  </td>
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
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-sm btn-success" 
                        onClick={() => setCompletingWO(wo)}
                        title="Mark as Complete"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => toggleLock(wo)}
                        title={wo.is_locked ? 'Unlock' : 'Lock'}
                      >
                        {wo.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                      </button>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => handleEdit(wo)}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-danger" 
                        onClick={() => handleDelete(wo.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

