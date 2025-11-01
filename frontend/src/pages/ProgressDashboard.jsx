import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWorkOrders, getCetecCombinedData, getCetecOrdlineWorkProgress, getCetecOrdlineStatuses } from '../api'
import { Package, Clock, AlertCircle, TrendingUp, BarChart3 } from 'lucide-react'

function KpiCard({ title, icon: Icon, accent = 'var(--primary)', headline, subtitle, items = [], footer }) {
  return (
    <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${accent}`, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accent,
          color: '#fff'
        }}>
          <Icon size={18} />
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6c757d' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.75rem', color: '#adb5bd' }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 600, color: accent, lineHeight: 1 }}>
        {headline}
      </div>
      {items.length > 0 && (
        <div style={{
          marginTop: '0.75rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.35rem'
        }}>
          {items.map(({ label, value, tone }, index) => (
            <div
              key={index}
              style={{
                fontSize: '0.8rem',
                color: '#495057',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem'
              }}
            >
              <span style={{ color: '#868e96' }}>{label}</span>
              <strong style={{ color: tone || '#212529' }}>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {footer && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6c757d' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

const formatNumber = (value) => {
  if (value === null || value === undefined) return '—'
  return Number.isFinite(value) ? value.toLocaleString() : String(value)
}

const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) return 'unknown'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days >= 7) {
    const weeks = Math.floor(days / 7)
    const leftoverDays = days % 7
    return leftoverDays ? `${weeks}w ${leftoverDays}d` : `${weeks}w`
  }
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
}

const formatRelativeTime = (baseDate, targetDate) => {
  if (!targetDate || !Number.isFinite(targetDate.getTime())) return '—'
  const diffMs = baseDate.getTime() - targetDate.getTime()
  if (diffMs <= 0) return 'just now'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) {
    const leftoverHours = hours % 24
    return leftoverHours ? `${days}d ${leftoverHours}h ago` : `${days}d ago`
  }
  const weeks = Math.floor(days / 7)
  const leftoverDays = days % 7
  return leftoverDays ? `${weeks}w ${leftoverDays}d ago` : `${weeks}w ago`
}

const getLocationGroup = (location) => {
  if (!location) return 'Unassigned'
  const normalized = location.toUpperCase()
  if (normalized.includes('SMT')) {
    if (normalized.includes('AOI')) return 'AOI'
    if (normalized.includes('WASH')) return 'Wash'
    return 'SMT'
  }
  if (normalized.includes('AOI')) return 'AOI'
  if (normalized.includes('WASH')) return 'Wash'
  if (normalized.includes('REWORK')) return 'Rework'
  if (normalized.includes('WARE')) return 'Warehouse'
  if (normalized.includes('KIT')) return 'Kitting'
  if (normalized.includes('TEST')) return 'Test'
  if (normalized.includes('DOC')) return 'Doc Control'
  return 'Other'
}

function ProcessTable({ title, data, columns }) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>{title}</h3>
        </div>
        <div className="card-body">
          <p>No data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              {columns.map((col, index) => (
                <th key={index} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                {Object.values(item).map((value, cellIndex) => (
                  <td key={cellIndex} style={{ padding: '0.75rem' }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ProgressDashboard() {
  const [selectedLocation, setSelectedLocation] = useState('all')
  const [selectedWorkOrder, setSelectedWorkOrder] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedWOs, setExpandedWOs] = useState({})

  const { data: workOrders, isLoading: loadingWOs } = useQuery({
    queryKey: ['workOrders', 'progress'],
    queryFn: () => getWorkOrders({ include_completed_work: true }),
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  const locationOptions = useMemo(() => {
    const set = new Set()
    ;(workOrders?.data || []).forEach(wo => {
      set.add(wo.current_location || 'Unknown')
    })
    return Array.from(set).sort()
  }, [workOrders])

  const workOrderOptions = useMemo(() => {
    return Array.from(new Set((workOrders?.data || []).map(wo => wo.wo_number))).sort()
  }, [workOrders])

  if (loadingWOs) {
    return (
      <div className="container">
        <div className="loading">Loading progress data...</div>
      </div>
    )
  }

  // Filter work orders based on search and selection
  const filteredWorkOrders = (workOrders?.data || []).filter(wo => {
    // Location filter
    if (selectedLocation !== 'all' && wo.current_location !== selectedLocation) {
      return false
    }
    
    // Work order filter
    if (selectedWorkOrder !== 'all' && wo.wo_number !== selectedWorkOrder) {
      return false
    }
    
    // Search filter
    if (searchTerm && !wo.wo_number.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !wo.customer.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    
    return true
  })

  const processData = useMemo(() => {
    return filteredWorkOrders.reduce((acc, wo) => {
      const location = wo.current_location || 'Unknown'
      const department = getLocationGroup(location)
      const originalQty = wo.cetec_original_qty ?? wo.quantity ?? 0
      const completedQty = wo.cetec_completed_qty ?? 0
      const rawRemaining = wo.cetec_remaining_qty ?? (originalQty - completedQty)
      const remainingQty = Math.max(0, rawRemaining)
      const isActive = remainingQty > 0

      if (!acc.locations[location]) {
        acc.locations[location] = {
          total: 0,
          completed: 0,
          remaining: 0,
          active: 0,
          workOrders: []
        }
      }

      if (!acc.departments[department]) {
        acc.departments[department] = {
          total: 0,
          completed: 0,
          remaining: 0,
          active: 0,
          workOrders: []
        }
      }

      const summary = {
        wo_number: wo.wo_number,
        customer: wo.customer,
        original: originalQty,
        completed: completedQty,
        remaining: remainingQty,
        percentage: originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
      }

      acc.locations[location].total += originalQty
      acc.locations[location].completed += completedQty
      acc.locations[location].remaining += remainingQty
      acc.locations[location].workOrders.push(summary)
      if (isActive) acc.locations[location].active += 1

      acc.departments[department].total += originalQty
      acc.departments[department].completed += completedQty
      acc.departments[department].remaining += remainingQty
      acc.departments[department].workOrders.push(summary)
      if (isActive) acc.departments[department].active += 1

      return acc
    }, { locations: {}, departments: {} })
  }, [filteredWorkOrders])

  const metrics = useMemo(() => {
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000
    const weekMs = dayMs * 7

    let wipCount = 0
    let totalOriginal = 0
    let totalCompleted = 0
    let totalRemaining = 0
    let piecesCompleted24h = 0
    let piecesCompleted7d = 0
    let recentOrders24h = 0
    let recentOrders7d = 0
    let stalled24h = 0
    let stalled72h = 0
    let missingTimestamp = 0
    let negativeRemaining = 0
    let canceledCount = 0
    let deletedCount = 0
    let missingOriginal = 0
    let latestSync = null

    const throughputByLocation = {}
    const stalledCandidates = []

    filteredWorkOrders.forEach(wo => {
      const originalQty = wo.cetec_original_qty ?? wo.quantity ?? 0
      const completedQty = wo.cetec_completed_qty ?? 0
      const rawRemaining = wo.cetec_remaining_qty ?? (originalQty - completedQty)
      const remainingQty = Math.max(0, rawRemaining)
      const location = wo.current_location || 'Unknown'

      totalOriginal += originalQty
      totalCompleted += completedQty
      totalRemaining += remainingQty

      if (rawRemaining < 0) {
        negativeRemaining += 1
      }

      if (remainingQty > 0) {
        wipCount += 1
      }

      const updatedAt = wo.updated_at ? new Date(wo.updated_at) : null
      if (updatedAt && Number.isFinite(updatedAt.getTime())) {
        const ageMs = now - updatedAt
        if (ageMs <= dayMs) {
          piecesCompleted24h += completedQty
          recentOrders24h += 1
          throughputByLocation[location] = (throughputByLocation[location] || 0) + completedQty
        }
        if (ageMs <= weekMs) {
          piecesCompleted7d += completedQty
          recentOrders7d += 1
        }
        if (remainingQty > 0 && ageMs > dayMs) {
          stalled24h += 1
          stalledCandidates.push({ wo: wo.wo_number, location, ageMs })
          if (ageMs > 3 * dayMs) {
            stalled72h += 1
          }
        }
      } else {
        missingTimestamp += 1
        if (remainingQty > 0) {
          stalled24h += 1
          stalledCandidates.push({ wo: wo.wo_number, location, ageMs: Number.POSITIVE_INFINITY })
        }
      }

      if (wo.is_canceled) canceledCount += 1
      if (wo.is_deleted) deletedCount += 1
      if (!wo.cetec_original_qty) missingOriginal += 1

      if (wo.last_cetec_sync) {
        const syncDate = new Date(wo.last_cetec_sync)
        if (Number.isFinite(syncDate.getTime())) {
          if (!latestSync || syncDate > latestSync) {
            latestSync = syncDate
          }
        }
      }
    })

    const topThroughputLocations = Object.entries(throughputByLocation)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, value]) => ({ name, value }))

    const stalledExamples = stalledCandidates
      .sort((a, b) => b.ageMs - a.ageMs)
      .slice(0, 3)

    const avgComplete = totalOriginal > 0 ? Math.round((totalCompleted / totalOriginal) * 100) : 0

    const exceptionCounts = {
      stalled24h,
      stalled72h,
      negativeRemaining,
      missingOriginal,
      canceled: canceledCount,
      deleted: deletedCount,
      missingTimestamp,
      total: stalled24h + negativeRemaining + canceledCount + deletedCount
    }

    return {
      generatedAt: now,
      wipCount,
      totalOriginal,
      totalCompleted,
      totalRemaining,
      avgComplete,
      piecesCompleted24h,
      piecesCompleted7d,
      recentOrders24h,
      recentOrders7d,
      throughputByLocation,
      topThroughputLocations,
      latestSync,
      exceptionCounts,
      stalledExamples
    }
  }, [filteredWorkOrders])

  const datasetSize = workOrders?.data?.length || 0

  const locationRows = Object.entries(processData.locations).map(([location, data]) => ({
    Location: location,
    'WIP': data.active,
    'Total Qty': data.total,
    'Completed Qty': data.completed,
    'Remaining Qty': data.remaining,
    Orders: data.workOrders.length
  }))

  const departmentRows = Object.entries(processData.departments).map(([group, data]) => ({
    'Department/Area': group,
    'WIP': data.active,
    'Total Qty': data.total,
    'Completed Qty': data.completed,
    'Remaining Qty': data.remaining,
    Orders: data.workOrders.length
  }))

  const throughputFooter = metrics.topThroughputLocations.length
    ? (
        <div>
          Top locations:{' '}
          {metrics.topThroughputLocations.map((entry, index) => (
            <span key={entry.name}>
              {entry.name} · {formatNumber(entry.value)} pcs
              {index < metrics.topThroughputLocations.length - 1 ? ' • ' : ''}
            </span>
          ))}
        </div>
      )
    : 'No updates logged in the last 24 hours.'

  const dataGapNote = metrics.exceptionCounts.missingOriginal || metrics.exceptionCounts.missingTimestamp
    ? (
        <div style={{ marginTop: '0.3rem', color: '#adb5bd' }}>
          Data gaps: {formatNumber(metrics.exceptionCounts.missingOriginal)} missing qty · {formatNumber(metrics.exceptionCounts.missingTimestamp)} missing timestamps
        </div>
      )
    : null

  const stalledFooter = metrics.stalledExamples.length
    ? (
        <div>
          <div>
            Oldest:{' '}
            {metrics.stalledExamples.map((entry, index) => (
              <span key={`${entry.wo}-${index}`}>
                {entry.wo} · {entry.location} · {formatDuration(entry.ageMs)}
                {index < metrics.stalledExamples.length - 1 ? ' • ' : ''}
              </span>
            ))}
          </div>
          {dataGapNote}
        </div>
      )
    : (
        <div>
          Flow looks good — no stalled jobs flagged.
          {dataGapNote}
        </div>
      )

  const latestSyncText = formatRelativeTime(metrics.generatedAt, metrics.latestSync)
  const generatedLabel = metrics.generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const activeThroughputLocations = Object.keys(metrics.throughputByLocation || {}).length
  const datasetSummary = `${formatNumber(filteredWorkOrders.length)} / ${formatNumber(datasetSize)}`

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <BarChart3 size={24} />
          Work Order Progress Dashboard
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Filter by Location:
            <select 
              value={selectedLocation} 
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{ padding: '0.5rem' }}
            >
              <option value="all">All Locations</option>
              {locationOptions.map(location => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Filter by Work Order:
            <select 
              value={selectedWorkOrder} 
              onChange={(e) => setSelectedWorkOrder(e.target.value)}
              style={{ padding: '0.5rem', minWidth: '150px' }}
            >
              <option value="all">All Work Orders</option>
              {workOrderOptions.map(woNumber => (
                <option key={woNumber} value={woNumber}>{woNumber}</option>
              ))}
            </select>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Search:
            <input
              type="text"
              placeholder="Search WO# or Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.5rem', minWidth: '200px' }}
            />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <KpiCard
          title="Production WIP"
          icon={Package}
          accent="var(--primary)"
          headline={formatNumber(metrics.wipCount)}
          subtitle="Active work orders"
          items={[
            { label: 'Remaining pcs', value: `${formatNumber(metrics.totalRemaining)}`, tone: 'var(--warning)' },
            { label: 'Completed pcs', value: `${formatNumber(metrics.totalCompleted)}`, tone: 'var(--success)' },
            { label: 'Avg complete', value: `${metrics.avgComplete}%`, tone: 'var(--success)' }
          ]}
          footer={`Total qty: ${formatNumber(metrics.totalOriginal)} pcs`}
        />

        <KpiCard
          title="Throughput"
          icon={TrendingUp}
          accent="var(--success)"
          headline={`${formatNumber(metrics.piecesCompleted24h)} pcs`}
          subtitle="Logged in last 24h"
          items={[
            { label: '7 day total', value: `${formatNumber(metrics.piecesCompleted7d)} pcs` },
            { label: 'Active locations', value: formatNumber(activeThroughputLocations) },
            { label: 'Orders touched', value: formatNumber(metrics.recentOrders24h) }
          ]}
          footer={throughputFooter}
        />

        <KpiCard
          title="Sync & Activity"
          icon={Clock}
          accent="var(--info)"
          headline={latestSyncText}
          subtitle="Latest Cetec sync"
          items={[
            { label: 'Orders touched 24h', value: formatNumber(metrics.recentOrders24h) },
            { label: 'Orders touched 7d', value: formatNumber(metrics.recentOrders7d) },
            { label: 'Dataset', value: datasetSummary }
          ]}
          footer={`Snapshot at ${generatedLabel}`}
        />

        <KpiCard
          title="Exceptions"
          icon={AlertCircle}
          accent="var(--danger)"
          headline={formatNumber(metrics.exceptionCounts.total)}
          subtitle="Needs attention"
          items={[
            { label: 'Stalled >24h', value: formatNumber(metrics.exceptionCounts.stalled24h), tone: 'var(--warning)' },
            { label: 'Stalled >72h', value: formatNumber(metrics.exceptionCounts.stalled72h), tone: 'var(--danger)' },
            { label: 'Negative remaining', value: formatNumber(metrics.exceptionCounts.negativeRemaining), tone: 'var(--danger)' },
            { label: 'Canceled/Deleted', value: formatNumber(metrics.exceptionCounts.canceled + metrics.exceptionCounts.deleted), tone: 'var(--danger)' }
          ]}
          footer={stalledFooter}
        />
      </div>

      {/* Work Order Distribution (when specific WO selected) */}
      {selectedWorkOrder !== 'all' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>Work Order Distribution: {selectedWorkOrder}</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {Object.entries(processData.locations).map(([location, data]) => {
                const woInLocation = data.workOrders.filter(wo => wo.wo_number === selectedWorkOrder)
                if (woInLocation.length === 0) return null
                
                const wo = woInLocation[0]
                return (
                  <div key={location} className="card" style={{ padding: '1rem', backgroundColor: '#f8f9fa' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>{location}</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Original: <strong>{wo.original.toLocaleString()}</strong></span>
                      <span>Completed: <strong style={{ color: 'var(--success)' }}>{wo.completed.toLocaleString()}</strong></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Remaining: <strong style={{ color: 'var(--warning)' }}>{wo.remaining.toLocaleString()}</strong></span>
                      <span>Progress: <strong>{wo.percentage}%</strong></span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '6px', 
                      backgroundColor: '#e9ecef', 
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${wo.percentage}%`,
                        height: '100%',
                        backgroundColor: wo.percentage === 100 ? 'var(--success)' : 'var(--primary)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Operation Breakdown (when specific WO selected) */}
      {selectedWorkOrder !== 'all' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>📊 Detailed Operation Breakdown: {selectedWorkOrder}</h3>
          </div>
          <div className="card-body">
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '1.5rem', 
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>📋 Work Order Summary</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Work Order:</strong> {selectedWorkOrder}
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Original Quantity:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? (wo.cetec_original_qty || wo.quantity || 0).toLocaleString() : 'N/A'
                    })()} pieces
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Balance Due:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? (wo.cetec_balance_due || 0).toLocaleString() : 'N/A'
                    })()} pieces
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Current Location:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? wo.current_location : 'Unknown'
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>🔍 Detailed Progress by Operation</h4>
                <div style={{ 
                  backgroundColor: 'white', 
                  padding: '1rem', 
                  borderRadius: '4px', 
                  border: '1px solid #dee2e6',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr 1fr 1fr', 
                    gap: '1rem',
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    fontWeight: 'bold'
                  }}>
                    <div>Operation/Status</div>
                    <div style={{ textAlign: 'right' }}>Pieces Completed</div>
                    <div style={{ textAlign: 'right' }}>% of Order</div>
                    <div style={{ textAlign: 'center' }}>Status</div>
                  </div>
                  
                  {/* This would be populated with actual operation data from Cetec */}
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '4px',
                    border: '1px solid #ffeaa7',
                    textAlign: 'center',
                    color: '#856404'
                  }}>
                    <strong>📊 Operation Details</strong><br/>
                    <small>Status-specific progress data will be displayed here once the backend feature is re-enabled.</small><br/>
                    <small>This will show each operation (SMT Assembly, Inspection, etc.) with completed quantities.</small>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>💡 Key Insights</h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '1rem' 
                }}>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--success)'
                  }}>
                    <strong style={{ color: 'var(--success)' }}>✅ Progress Status</strong><br/>
                    <small>Work order is actively progressing through operations</small>
                  </div>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--info)'
                  }}>
                    <strong style={{ color: 'var(--info)' }}>📈 Completion Rate</strong><br/>
                    <small>Track progress through each manufacturing step</small>
                  </div>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--warning)'
                  }}>
                    <strong style={{ color: 'var(--warning)' }}>⚠️ Quality Check</strong><br/>
                    <small>Monitor inspection and quality control progress</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Summary */}
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: '#f8f9fa' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Showing {filteredWorkOrders.length} work orders</strong>
              {selectedWorkOrder !== 'all' && <span> for work order <code>{selectedWorkOrder}</code></span>}
              {selectedLocation !== 'all' && <span> in location <code>{selectedLocation}</code></span>}
              {searchTerm && <span> matching "<code>{searchTerm}</code>"</span>}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>
              Total: {formatNumber(datasetSize)} work orders
            </div>
          </div>
        </div>
      </div>

      {/* Process Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <ProcessTable
          title="Work Orders by Location"
          data={locationRows}
          columns={['Location', 'WIP', 'Total Qty', 'Completed Qty', 'Remaining Qty', 'Orders']}
        />
        
        <ProcessTable
          title="Departments / Areas"
          data={departmentRows}
          columns={['Department/Area', 'WIP', 'Total Qty', 'Completed Qty', 'Remaining Qty', 'Orders']}
        />
      </div>

      {/* Detailed Work Order List */}
      <div className="card">
        <div className="card-header">
          <h3>Detailed Work Order Progress</h3>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', width: '36px' }}></th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>WO#</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Line</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Original</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Completed</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Remaining</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders.map((wo, index) => {
                  const originalQty = wo.cetec_original_qty || wo.quantity || 0
                  const completedQty = wo.cetec_completed_qty || 0
                  const remainingQty = wo.cetec_remaining_qty || Math.max(0, originalQty - completedQty)
                  const percentage = originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
                  
                  const isExpanded = !!expandedWOs[wo.wo_number]

                  return (
                    <>
                      <tr key={`${wo.wo_number}-row`} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <button
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedWOs(prev => ({ ...prev, [wo.wo_number]: !isExpanded }))}
                            style={{
                              border: '1px solid #dee2e6',
                              background: 'white',
                              borderRadius: '4px',
                              width: '28px',
                              height: '28px',
                              cursor: 'pointer'
                            }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{wo.wo_number}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.customer}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.current_location || 'Unknown'}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.line?.name || 'Unscheduled'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{originalQty.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--success)' }}>
                          {completedQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--warning)' }}>
                          {remainingQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ 
                              width: '60px', 
                              height: '6px', 
                              backgroundColor: '#e9ecef', 
                              borderRadius: '3px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${percentage}%`,
                                height: '100%',
                                backgroundColor: percentage === 100 ? 'var(--success)' : 'var(--primary)',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#666' }}>{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${wo.wo_number}-details`}>
                          <td colSpan={9} style={{ padding: 0, background: '#f8f9fa' }}>
                            <WorkOrderOperationsPanel workOrder={wo} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function WorkOrderOperationsPanel({ workOrder }) {
  const ordlineId = workOrder.cetec_ordline_id
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cetecCombined', ordlineId],
    queryFn: () => getCetecCombinedData(ordlineId),
    enabled: !!ordlineId
  })
  const progressQuery = useQuery({
    queryKey: ['cetecProgress', ordlineId],
    queryFn: () => getCetecOrdlineWorkProgress(ordlineId),
    enabled: !!ordlineId
  })
  const statusesQuery = useQuery({
    queryKey: ['cetecOrdlineStatuses'],
    queryFn: () => getCetecOrdlineStatuses(),
  })
  const [showDebug, setShowDebug] = useState(false)

  if (!ordlineId) {
    return (
      <div style={{ padding: '1rem' }}>
        <em>No Cetec ordline id available for this work order.</em>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: '1rem' }}>
        Loading Cetec operations…
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '1rem', color: 'var(--danger)' }}>
        Failed to load operations from Cetec.
      </div>
    )
  }

  const payload = data?.data || {}
  const locationMaps = payload.location_maps || []
  const workProgress = progressQuery.data?.data || []
  const statusesList = statusesQuery.data?.data || []
  const statusIdToName = {}
  for (const s of Array.isArray(statusesList) ? statusesList : []) {
    const id = s.id || s.status_id || s.statusid
    const name = s.name || s.status || s.status_name
    if (id != null && name) statusIdToName[id] = String(name)
  }

  // Build a quick lookup for completed qty by operation id or name, plus arrays for fuzzy matching
  const completedByKey = {}
  const progressRows = Array.isArray(workProgress) ? workProgress : []
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  for (const row of progressRows) {
    const derivedName = row.operation_name || row.status_name || statusIdToName[row.status_id]
    const key = String(row.operation_id ?? derivedName ?? row.status_id ?? 'unknown')
    completedByKey[key] = (completedByKey[key] || 0) + (row.completed_qty || 0)
  }

  return (
    <div style={{ padding: '0.25rem 0.75rem 0.5rem 1.25rem', borderTop: '1px solid #dee2e6' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
        <div style={{ textAlign: 'right' }}>
          <button
            onClick={() => setShowDebug(v => !v)}
            style={{ border: '1px solid #dee2e6', background: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {showDebug ? 'Hide debug' : 'Show debug'}
          </button>
        </div>
        {showDebug && (
          <div className="card" style={{ background: '#fff8e1' }}>
            <div className="card-header"><strong>Debug: Raw progress data</strong></div>
            <div className="card-body" style={{ maxHeight: '240px', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {progressQuery.isLoading ? 'Loading…' : JSON.stringify(workProgress, null, 2)}
            </div>
          </div>
        )}
        {locationMaps.length === 0 && (
          <div style={{ background: '#fff3cd', border: '1px solid #ffeaa7', padding: '0.75rem', borderRadius: '6px' }}>
            No locations/operations returned from Cetec for this work order.
          </div>
        )}

        {locationMaps.map((loc, idx) => {
          const ops = loc.operations || []
          const locName = loc.name || loc.location_name || loc.location || loc.title || `Location ${idx + 1}`

          // Compute location-level completed by fuzzy matching progress rows to this location name
          const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
          const ln = norm(locName)
          let locationCompleted = 0
          for (const row of progressRows) {
            const rName = norm(row.operation_name || row.status_name || statusIdToName[row.status_id])
            if (!rName) continue
            if (rName === ln || rName.includes(ln) || ln.includes(rName)) {
              locationCompleted += row.completed_qty || 0
            }
            // Also count if row mentions a known alias (e.g., SMT PRODUCTION vs SMT ASSEMBLY)
            if (!locationCompleted && ln.includes('smt') && rName.includes('production')) {
              locationCompleted += row.completed_qty || 0
            }
          }
          return (
            <div key={idx} className="card" style={{ background: 'white', marginBottom: '0.15rem' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0.5rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>{locName}</strong>
                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {locationCompleted > 0 && (
                    <span style={{
                      fontSize: '0.7rem',
                      background: 'var(--success)',
                      color: 'white',
                      padding: '0 6px',
                      borderRadius: '999px'
                    }}>
                      {locationCompleted.toLocaleString()}
                    </span>
                  )}
                  <span style={{ fontSize: '0.75rem', color: '#666' }}>{ops.length} ops</span>
                </span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '0.3rem 0.4rem', textAlign: 'left' }}>Operation</th>
                      <th style={{ padding: '0.3rem 0.4rem', textAlign: 'right' }}>Completed</th>
                      <th style={{ padding: '0.3rem 0.4rem', textAlign: 'right' }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '0.35rem' }}>
                          <em>No operations defined for this location.</em>
                        </td>
                      </tr>
                    )}
                    {ops.map((op, j) => {
                      const name = op.name || op.operation || `Operation ${j + 1}`
                      const key = String(op.id ?? op.operation_id ?? name)
                      let completed = completedByKey[key] || 0
                      if (!completed) {
                        // Fallback fuzzy match by name tokens (case-insensitive)
                        const opName = norm(name)
                        for (const row of progressRows) {
                          const rName = norm(row.operation_name || row.status_name || statusIdToName[row.status_id])
                          if (rName && (rName === opName || rName.includes(opName) || opName.includes(rName))) {
                            completed += row.completed_qty || 0
                          }
                        }
                        // Special-case: if this looks like SMT Assembly and location has production completions, attribute to this op
                        if (completed === 0 && opName.includes('assembly') && ln.includes('smt') && locationCompleted > 0) {
                          completed = locationCompleted
                        }
                      }
                      const orderQty = (workOrder.cetec_original_qty || workOrder.quantity || 0)
                      const pct = orderQty > 0 ? Math.round((completed / orderQty) * 100) : 0
                      return (
                        <tr key={j} style={{ borderTop: '1px solid #f1f3f5' }}>
                          <td style={{ padding: '0.3rem 0.4rem' }}>{name}</td>
                          <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right' }}>{completed.toLocaleString()}</td>
                          <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right' }}>{pct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
