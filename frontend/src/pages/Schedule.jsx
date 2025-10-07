import { useState } from 'react' // Updated with SMT PRODUCTION filter
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWorkOrders, getLines, createWorkOrder, updateWorkOrder, deleteWorkOrder, completeWorkOrder, getDashboard, getStatuses } from '../api'
import { Plus, Edit2, Trash2, Lock, Unlock, CheckCircle, Calendar, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import WorkOrderForm from '../components/WorkOrderForm'
import CompleteJobModal from '../components/CompleteJobModal'
import ReportIssueModal from '../components/ReportIssueModal'

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
    // Use custom color
    return (
      <span 
        className="badge"
        style={{ background: color, color: 'white', padding: '0.25rem 0.5rem' }}
      >
        {name}
      </span>
    )
  }
  
  // Use legacy color classes
  return <span className={`badge ${legacyColors[name] || 'badge-secondary'}`}>{name}</span>
}

export default function Schedule() {
  const [showForm, setShowForm] = useState(false)
  const [editingWO, setEditingWO] = useState(null)
  const [completingWO, setCompletingWO] = useState(null)
  const [reportingIssueWO, setReportingIssueWO] = useState(null)
  const [filterLine, setFilterLine] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLocation, setFilterLocation] = useState('SMT PRODUCTION') // Default to SMT PRODUCTION
  const [filterMaterialStatus, setFilterMaterialStatus] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortColumn, setSortColumn] = useState('line_position')
  const [sortDirection, setSortDirection] = useState('asc')
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

  // Filter and sort work orders
  const filteredAndSortedWorkOrders = workOrders?.data
    .filter(wo => {
      // Search by WO number, Assembly (assembly + revision), or Customer
      if (searchText && searchText.trim()) {
        const q = searchText.toLowerCase()
        const woNum = (wo.wo_number || '').toLowerCase()
        const assy = `${wo.assembly || ''} ${wo.revision || ''}`.toLowerCase()
        const customer = (wo.customer || '').toLowerCase()
        if (!woNum.includes(q) && !assy.includes(q) && !customer.includes(q)) return false
      }
      if (filterLine === 'unscheduled') {
        if (wo.line_id) return false
      }
      
      // Filter by current location
      if (filterLocation) {
        const woLocation = (wo.current_location || '').toLowerCase()
        const filterLoc = filterLocation.toLowerCase()
        if (!woLocation.includes(filterLoc)) return false
      }
      
      // Filter by material status
      if (filterMaterialStatus) {
        if (wo.material_status !== filterMaterialStatus) return false
      }
      
      return true
    })
    .sort((a, b) => {
      let aVal, bVal
      
      switch (sortColumn) {
        case 'customer':
          aVal = a.customer || ''
          bVal = b.customer || ''
          break
        case 'assembly':
          aVal = `${a.assembly} ${a.revision}`
          bVal = `${b.assembly} ${b.revision}`
          break
        case 'wo_number':
          aVal = a.wo_number || ''
          bVal = b.wo_number || ''
          break
        case 'line_name':
          aVal = (a.line && a.line.name) ? a.line.name : ''
          bVal = (b.line && b.line.name) ? b.line.name : ''
          break
        case 'quantity':
          aVal = a.quantity || 0
          bVal = b.quantity || 0
          break
        case 'status':
          aVal = a.status_name || a.status || ''
          bVal = b.status_name || b.status || ''
          break
        case 'material_status':
          aVal = a.material_status || ''
          bVal = b.material_status || ''
          break
        case 'th_kit_status':
          aVal = a.th_kit_status || ''
          bVal = b.th_kit_status || ''
          break
        case 'priority':
          aVal = a.priority || ''
          bVal = b.priority || ''
          break
        case 'current_location':
          aVal = a.current_location || ''
          bVal = b.current_location || ''
          break
        case 'cetec_ship_date':
          aVal = a.cetec_ship_date || ''
          bVal = b.cetec_ship_date || ''
          break
        case 'min_start_date':
          aVal = a.min_start_date ? new Date(a.min_start_date).getTime() : 0
          bVal = b.min_start_date ? new Date(b.min_start_date).getTime() : 0
          break
        case 'time_minutes':
          aVal = a.time_minutes || 0
          bVal = b.time_minutes || 0
          break
        case 'trolley_count':
          aVal = a.trolley_count || 0
          bVal = b.trolley_count || 0
          break
        case 'line_position':
        default:
          aVal = a.line_position || 999
          bVal = b.line_position || 999
          break
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })

  const filteredWorkOrders = filteredAndSortedWorkOrders
  
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const { data: lines } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(),
  })

  const { data: statusesData } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => getStatuses(false).then(res => res.data)
  })

  const statuses = statusesData || []

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
          background: 'linear-gradient(135deg, #1a7a3e 0%, #d4af37 100%)', 
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
          <div style={{ flex: 2, minWidth: '240px' }}>
            <input
              className="form-input"
              placeholder="Search WO#, Assembly, or Customer"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
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
              {statuses.map(status => (
                <option key={status.id} value={status.name}>{status.name}</option>
              ))}
            </select>
          </div>
          
          <div style={{ flex: 1, minWidth: '200px' }}>
            <select 
              className="form-select"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
            >
              <option value="">All Locations</option>
              <option value="SMT PRODUCTION">SMT PRODUCTION</option>
              <option value="DEPANEL">DEPANEL</option>
              <option value="KITTING">KITTING</option>
              <option value="ASSEMBLY">ASSEMBLY</option>
              <option value="INSPECTION">INSPECTION</option>
              <option value="SHIPPING">SHIPPING</option>
            </select>
          </div>
          
          <div style={{ flex: 1, minWidth: '180px' }}>
            <select 
              className="form-select"
              value={filterMaterialStatus}
              onChange={(e) => setFilterMaterialStatus(e.target.value)}
            >
              <option value="">All Materials</option>
              <option value="Ready">✓ Ready</option>
              <option value="Partial">⚠ Partial</option>
              <option value="Shortage">✗ Shortage</option>
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
          <table style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th 
                  onClick={() => handleSort('line_position')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', whiteSpace: 'nowrap' }}
                  title="Position in queue"
                >
                  # {sortColumn === 'line_position' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('customer')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '120px' }}
                  title="Customer"
                >
                  Cust {sortColumn === 'customer' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('assembly')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '140px' }}
                  title="Assembly & Revision"
                >
                  Assy {sortColumn === 'assembly' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('wo_number')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', whiteSpace: 'nowrap' }}
                  title="Work Order Number"
                >
                  WO# {sortColumn === 'wo_number' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('quantity')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem' }}
                  title="Quantity"
                >
                  Qty {sortColumn === 'quantity' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '100px' }}
                  title="Status"
                >
                  Stat {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('material_status')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '80px' }}
                  title="Material Status"
                >
                  Mat {sortColumn === 'material_status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('current_location')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '100px' }}
                  title="Current Location"
                >
                  Loc {sortColumn === 'current_location' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('priority')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '80px' }}
                  title="Priority"
                >
                  Pri {sortColumn === 'priority' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('line_name')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '80px' }}
                  title="SMT Line"
                >
                  Line {sortColumn === 'line_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('min_start_date')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', whiteSpace: 'nowrap' }}
                  title="Minimum Start Date (calculated)"
                >
                  Min Start {sortColumn === 'min_start_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('cetec_ship_date')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', whiteSpace: 'nowrap' }}
                  title="Ship Date"
                >
                  Ship {sortColumn === 'cetec_ship_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('time_minutes')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem' }}
                  title="Time (hours)"
                >
                  Hrs {sortColumn === 'time_minutes' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('trolley_count')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem' }}
                  title="Trolleys"
                >
                  Trl {sortColumn === 'trolley_count' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  onClick={() => handleSort('th_kit_status')}
                  style={{ cursor: 'pointer', userSelect: 'none', padding: '0.5rem', maxWidth: '100px' }}
                  title="TH Work Order Status"
                >
                  TH Stat {sortColumn === 'th_kit_status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders
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
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>{wo.line_position || '-'}</td>
                  <td style={{ 
                    padding: '0.5rem', 
                    maxWidth: '120px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    backgroundColor: wo.is_new_rev_assembly ? '#e6e6ff' : 'transparent'
                  }} title={wo.customer}>
                    {wo.customer}
                  </td>
                  <td style={{ 
                    padding: '0.5rem', 
                    maxWidth: '140px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    backgroundColor: wo.is_new_rev_assembly ? '#e6e6ff' : 'transparent'
                  }} title={`${wo.assembly} ${wo.revision}`}>
                    {wo.assembly} {wo.revision}
                    {wo.is_new_rev_assembly && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
                  </td>
                  <td style={{ 
                    padding: '0.5rem',
                    backgroundColor: wo.is_new_rev_assembly ? '#e6e6ff' : 'transparent'
                  }}>
                    <code style={{ fontSize: '0.75rem' }}>{wo.wo_number}</code>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>{wo.quantity}</td>
                  <td style={{ padding: '0.5rem' }}><StatusBadge status={wo.status} statusName={wo.status_name} statusColor={wo.status_color} /></td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }} title={wo.material_status}>
                    {wo.material_status && (
                      <span 
                        style={{ 
                          display: 'inline-block',
                          width: '22px',
                          height: '22px',
                          lineHeight: '22px',
                          borderRadius: '4px',
                          background: wo.material_status === 'Ready' ? '#28a745' : wo.material_status === 'Partial' ? '#ffc107' : '#dc3545',
                          color: 'white',
                          fontSize: '0.875rem'
                        }}
                      >
                        {wo.material_status === 'Ready' ? '✓' : wo.material_status === 'Partial' ? '⚠' : '✗'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }} title={wo.current_location}>
                    {wo.current_location && (
                      <span 
                        className="badge" 
                        style={{ 
                          background: wo.current_location.toUpperCase().includes('SMT PRODUCTION') ? '#28a745' :        // Green
                                     wo.current_location.toUpperCase().includes('KIT SHORT SHELF') ? '#fd7e14' :        // Orange
                                     wo.current_location.toUpperCase().includes('KITTING') ? '#007bff' :                // Blue
                                     wo.current_location.toUpperCase().includes('WAREHOUSE') ? '#17a2b8' :              // Cyan
                                     wo.current_location.toUpperCase().includes('DOC CONTROL') ? '#6c757d' :            // Gray
                                     wo.current_location.toUpperCase().includes('UNRELEASED') ? '#6c757d' :             // Gray
                                     wo.current_location.toUpperCase().includes('DEPANEL') ? '#6610f2' :                // Purple
                                     wo.current_location.toUpperCase().includes('ASSEMBLY') ? '#e83e8c' :               // Pink
                                     wo.current_location.toUpperCase().includes('COATING') ? '#6f42c1' :                // Indigo
                                     wo.current_location.toUpperCase().includes('POTTING') ? '#6f42c1' :                // Indigo
                                     wo.current_location.toUpperCase().includes('INSPECTION') ? '#ffc107' :             // Yellow
                                     wo.current_location.toUpperCase().includes('QC') ? '#ffc107' :                     // Yellow
                                     wo.current_location.toUpperCase().includes('SHIPPING') ? '#20c997' :               // Teal
                                     wo.current_location.toUpperCase().includes('RECEIVING') ? '#17a2b8' :              // Cyan
                                     wo.current_location.toUpperCase().includes('HOLD') ? '#dc3545' :                   // Red
                                     wo.current_location.toUpperCase().includes('REWORK') ? '#dc3545' :                 // Red
                                     '#6c757d',                                                                         // Default Gray
                          color: 'white',
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.4rem'
                        }}
                      >
                        {wo.current_location.replace('SMT PRODUCTION', 'SMT').replace('ASSEMBLY', 'ASSY').replace('COATING AND POTTING', 'COAT/POT').substring(0, 12)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}><PriorityBadge priority={wo.priority} /></td>
                  <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                    {wo.line?.name || <em style={{ color: 'var(--warning)', fontWeight: 600, fontSize: '0.75rem' }}>⚠️</em>}
                  </td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {wo.min_start_date ? format(new Date(wo.min_start_date), 'MM/dd/yy') : '-'}
                  </td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {wo.cetec_ship_date ? format(new Date(wo.cetec_ship_date), 'MM/dd/yy') : '-'}
                  </td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', textAlign: 'right' }}>{(wo.time_minutes / 60).toFixed(1)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>{wo.trolley_count}</td>
                  <td style={{ padding: '0.5rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wo.th_kit_status || ''}>
                    {wo.th_kit_status || '-'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                      <button 
                        className="btn btn-sm btn-success" 
                        onClick={() => setCompletingWO(wo)}
                        style={{ padding: '0.25rem 0.5rem' }}
                        title="Mark as Complete"
                      >
                        <CheckCircle size={14} />
                      </button>
                      <button 
                        className="btn btn-sm btn-warning" 
                        onClick={() => setReportingIssueWO(wo)}
                        title="Report Issue"
                      >
                        <AlertTriangle size={14} />
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

