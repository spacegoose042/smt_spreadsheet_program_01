import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWorkOrders, getCetecCombinedData, getCetecOrdlineWorkProgress, getCetecOrdlineStatuses } from '../api'
import { Package, Clock, AlertCircle, TrendingUp, BarChart3, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const THIRTY_D_MS = 30 * DAY_MS
const LIVE_REFETCH_INTERVAL_MS = 30_000

const DATE_WINDOW_OPTIONS = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
]

const SHIFT_OPTIONS = [
  { value: 'all', label: 'All shifts' },
  { value: 'day', label: 'Day shift' },
  { value: 'night', label: 'Night shift' }
]

const parseISODate = (value) => {
  if (!value) return null
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt
}

const getOrderActivityTimestamp = (wo) => {
  return (
    parseISODate(wo.updated_at) ||
    parseISODate(wo.last_cetec_sync) ||
    parseISODate(wo.calculated_end_datetime) ||
    parseISODate(wo.calculated_start_datetime) ||
    parseISODate(wo.wo_start_datetime) ||
    parseISODate(wo.min_start_date)
  )
}

const getShiftBucketForOrder = (wo) => {
  const start = parseISODate(
    wo.calculated_start_datetime ||
    wo.wo_start_datetime ||
    wo.min_start_date
  )
  if (!start) return 'unknown'
  const hour = start.getHours()
  return hour >= 6 && hour < 18 ? 'day' : 'night'
}

const isOrderStalled = (wo, nowMs) => {
  const originalQty = wo.cetec_original_qty ?? wo.quantity ?? 0
  const completedQty = wo.cetec_completed_qty ?? 0
  const remainingQty = wo.cetec_remaining_qty ?? Math.max(0, originalQty - completedQty)
  if (remainingQty <= 0) {
    return false
  }
  const activity = getOrderActivityTimestamp(wo)
  if (!activity) {
    return true
  }
  return nowMs - activity.getTime() > DAY_MS
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
  const [selectedLocationGroup, setSelectedLocationGroup] = useState('all')
  const [dateWindow, setDateWindow] = useState('7d')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [selectedCustomer, setSelectedCustomer] = useState('all')
  const [onlyWip, setOnlyWip] = useState(false)
  const [onlyWithCompletions, setOnlyWithCompletions] = useState(false)
  const [onlyStalled, setOnlyStalled] = useState(false)
  const [livePolling, setLivePolling] = useState(true)
  const [includeDocControl, setIncludeDocControl] = useState(false)

  const { isAdmin, isScheduler } = useAuth()
  const canToggleDocControl = isAdmin || isScheduler

  const workOrderParams = useMemo(() => {
    const params = {
      include_completed_work: true
    }
    if (includeDocControl) {
      params.include_doc_control = true
    }
    return params
  }, [includeDocControl])

  const { data: workOrders, isLoading: loadingWOs, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['workOrders', 'progress', { includeDocControl }],
    queryFn: () => getWorkOrders(workOrderParams),
    refetchInterval: livePolling ? LIVE_REFETCH_INTERVAL_MS : false,
    keepPreviousData: true
  })

  const rawWorkOrders = workOrders?.data ?? []

  const locationOptions = useMemo(() => {
    const set = new Set()
    rawWorkOrders.forEach(wo => {
      set.add(wo.current_location || 'Unknown')
    })
    return Array.from(set).sort()
  }, [rawWorkOrders])

  const workOrderOptions = useMemo(() => {
    return Array.from(new Set(rawWorkOrders.map(wo => wo.wo_number))).sort()
  }, [rawWorkOrders])

  const locationGroupOptions = useMemo(() => {
    const set = new Set()
    rawWorkOrders.forEach(wo => set.add(getLocationGroup(wo.current_location)))
    return Array.from(set).sort()
  }, [rawWorkOrders])

  const customerOptions = useMemo(() => {
    const set = new Set()
    rawWorkOrders.forEach(wo => {
      if (wo.customer) {
        set.add(wo.customer)
      }
    })
    return Array.from(set).sort()
  }, [rawWorkOrders])

  const filteredWorkOrders = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase()
    const nowMs = Date.now()

    return rawWorkOrders.filter(wo => {
      const location = wo.current_location || 'Unknown'
      const locationGroup = getLocationGroup(location)

      if (selectedLocation !== 'all' && location !== selectedLocation) {
        return false
      }

      if (selectedLocationGroup !== 'all' && locationGroup !== selectedLocationGroup) {
        return false
      }

      if (selectedWorkOrder !== 'all' && wo.wo_number !== selectedWorkOrder) {
        return false
      }

      if (selectedCustomer !== 'all' && wo.customer !== selectedCustomer) {
        return false
      }

      if (searchLower) {
        const woNumber = (wo.wo_number || '').toLowerCase()
        const customer = (wo.customer || '').toLowerCase()
        if (!woNumber.includes(searchLower) && !customer.includes(searchLower)) {
          return false
        }
      }

      const originalQty = wo.cetec_original_qty ?? wo.quantity ?? 0
      const completedQty = wo.cetec_completed_qty ?? 0
      const remainingQty = wo.cetec_remaining_qty ?? Math.max(0, originalQty - completedQty)

      if (onlyWip && remainingQty <= 0) {
        return false
      }

      if (onlyWithCompletions && completedQty <= 0) {
        return false
      }

      if (onlyStalled && !isOrderStalled(wo, nowMs)) {
        return false
      }

      const activity = getOrderActivityTimestamp(wo)
      if (dateWindow !== 'all') {
        if (!activity) {
          return false
        }
        const ageMs = nowMs - activity.getTime()
        if (dateWindow === 'today' && ageMs > DAY_MS) {
          return false
        }
        if (dateWindow === '7d' && ageMs > WEEK_MS) {
          return false
        }
        if (dateWindow === '30d' && ageMs > THIRTY_D_MS) {
          return false
        }
      }

      const shiftBucket = getShiftBucketForOrder(wo)
      if (shiftFilter !== 'all' && shiftBucket !== shiftFilter) {
        return false
      }

      return true
    })
  }, [
    rawWorkOrders,
    selectedLocation,
    selectedLocationGroup,
    selectedWorkOrder,
    selectedCustomer,
    searchTerm,
    onlyWip,
    onlyWithCompletions,
    onlyStalled,
    dateWindow,
    shiftFilter
  ])

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
    const dayMs = DAY_MS
    const weekMs = WEEK_MS

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

      const activityTimestamp = getOrderActivityTimestamp(wo)
      if (activityTimestamp && Number.isFinite(activityTimestamp.getTime())) {
        const ageMs = now - activityTimestamp
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

  const datasetSize = rawWorkOrders.length

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
  const lastUpdatedDate = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const lastUpdatedLabel = lastUpdatedDate && Number.isFinite(lastUpdatedDate.getTime())
    ? formatRelativeTime(new Date(), lastUpdatedDate)
    : 'waiting…'
  const liveDotColor = livePolling ? (isFetching ? '#f59f00' : '#2f9e44') : '#adb5bd'
  const liveStatusLabel = livePolling ? 'Live' : 'Paused'

  if (loadingWOs && rawWorkOrders.length === 0) {
    return (
      <div className="container">
        <div className="loading">Loading progress data...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <BarChart3 size={24} />
          Work Order Progress Dashboard
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '999px',
                backgroundColor: liveDotColor,
                boxShadow: livePolling ? '0 0 0 6px rgba(47, 158, 68, 0.12)' : 'none',
                transition: 'all 0.3s ease'
              }}
            />
            <span>{liveStatusLabel}</span>
            <span>• Updated {lastUpdatedLabel}{isFetching ? ' (syncing…)' : ''}</span>
          </div>
          <button
            onClick={() => setLivePolling(prev => !prev)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #ced4da',
              background: livePolling ? 'white' : 'var(--primary)',
              color: livePolling ? '#495057' : '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {livePolling ? 'Pause live' : 'Resume live'}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--primary)',
              background: 'var(--primary)',
              color: '#fff',
              cursor: isFetching ? 'wait' : 'pointer',
              fontSize: '0.85rem',
              opacity: isFetching ? 0.7 : 1
            }}
          >
            {isFetching ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '180px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Location</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                <option value="all">All locations</option>
                {locationOptions.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '180px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Location group</span>
              <select
                value={selectedLocationGroup}
                onChange={(e) => setSelectedLocationGroup(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                <option value="all">All groups</option>
                {locationGroupOptions.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '180px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Work order</span>
              <select
                value={selectedWorkOrder}
                onChange={(e) => setSelectedWorkOrder(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                <option value="all">All work orders</option>
                {workOrderOptions.map(woNumber => (
                  <option key={woNumber} value={woNumber}>{woNumber}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '200px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Customer</span>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                <option value="all">All customers</option>
                {customerOptions.map(customer => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '170px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Date window</span>
              <select
                value={dateWindow}
                onChange={(e) => setDateWindow(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                {DATE_WINDOW_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', minWidth: '160px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Shift</span>
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              >
                {SHIFT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#6c757d', flex: '1 1 220px', minWidth: '220px' }}>
              <span style={{ marginBottom: '0.25rem' }}>Search</span>
              <input
                type="text"
                placeholder="Search WO# or customer…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.85rem', color: '#6c757d' }}>Quick segments:</strong>
            <button
              onClick={() => setOnlyWip(prev => !prev)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                border: onlyWip ? '1px solid var(--primary)' : '1px solid #ced4da',
                background: onlyWip ? 'var(--primary)' : '#f8f9fa',
                color: onlyWip ? '#fff' : '#495057',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Only WIP
            </button>
            <button
              onClick={() => setOnlyWithCompletions(prev => !prev)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                border: onlyWithCompletions ? '1px solid var(--primary)' : '1px solid #ced4da',
                background: onlyWithCompletions ? 'var(--primary)' : '#f8f9fa',
                color: onlyWithCompletions ? '#fff' : '#495057',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Only with completions
            </button>
            <button
              onClick={() => setOnlyStalled(prev => !prev)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                border: onlyStalled ? '1px solid #dc3545' : '1px solid #ced4da',
                background: onlyStalled ? '#dc3545' : '#f8f9fa',
                color: onlyStalled ? '#fff' : '#495057',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Only stalled
            </button>

            {canToggleDocControl && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#495057', marginLeft: 'auto' }}>
                <input
                  type="checkbox"
                  checked={includeDocControl}
                  onChange={(e) => setIncludeDocControl(e.target.checked)}
                />
                Include DOC CONTROL orders
              </label>
            )}
          </div>
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
                            <WorkOrderOperationsPanel workOrder={wo} onSelectLocation={setSelectedLocation} />
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

function WorkOrderOperationsPanel({ workOrder, onSelectLocation = () => {} }) {
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

  const orderQty = workOrder.cetec_original_qty ?? workOrder.quantity ?? 0
  const orderCompleted = workOrder.cetec_completed_qty ?? 0
  const orderRemaining = Math.max(0, workOrder.cetec_remaining_qty ?? (orderQty - orderCompleted))
  const orderPercent = orderQty > 0 ? Math.round((orderCompleted / orderQty) * 100) : 0

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

  const chipStyle = {
    padding: '0.4rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    background: '#fff',
    fontSize: '0.8rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    minWidth: '120px'
  }

  const chips = [
    { label: 'Original', value: formatNumber(orderQty) },
    { label: 'Completed', value: formatNumber(orderCompleted), tone: 'var(--success)' },
    { label: 'Remaining', value: formatNumber(orderRemaining), tone: 'var(--warning)' },
    { label: 'Progress', value: `${orderPercent}%`, tone: orderPercent === 100 ? 'var(--success)' : 'var(--primary)' }
  ]

  return (
    <div style={{ padding: '0.75rem 1rem 1.25rem 1.5rem', borderTop: '1px solid #dee2e6', background: '#f8f9fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {chips.map((chip) => (
            <div key={chip.label} style={{ ...chipStyle, borderColor: chip.tone ? chip.tone : '#dee2e6' }}>
              <span style={{ color: '#868e96', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{chip.label}</span>
              <strong style={{ fontSize: '1rem', color: chip.tone || '#212529' }}>{chip.value}</strong>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowDebug(v => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #ced4da',
            background: '#fff',
            color: '#495057',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
          title={showDebug ? 'Hide raw progress payload' : 'Show raw progress payload'}
        >
          <Info size={16} />
          {showDebug ? 'Hide raw data' : 'Raw data'}
        </button>
      </div>

      {showDebug && (
        <div className="card" style={{ background: '#fff8e1', marginBottom: '1rem' }}>
          <div className="card-header"><strong>Debug: Raw progress data</strong></div>
          <div className="card-body" style={{ maxHeight: '240px', overflow: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
            {progressQuery.isLoading ? 'Loading…' : JSON.stringify(workProgress, null, 2)}
          </div>
        </div>
      )}

      {locationMaps.length === 0 ? (
        <div style={{ background: '#fff3cd', border: '1px solid #ffeaa7', padding: '0.75rem', borderRadius: '6px' }}>
          No locations/operations returned from Cetec for this work order.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
          {locationMaps.map((loc, idx) => {
            const ops = loc.operations || []
            const locName = loc.name || loc.location_name || loc.location || loc.title || `Location ${idx + 1}`
            const ln = norm(locName)

            let locationCompleted = 0
            for (const row of progressRows) {
              const rName = norm(row.operation_name || row.status_name || statusIdToName[row.status_id])
              if (!rName) continue
              if (rName === ln || rName.includes(ln) || ln.includes(rName)) {
                locationCompleted += row.completed_qty || 0
              }
              if (!locationCompleted && ln.includes('smt') && rName.includes('production')) {
                locationCompleted += row.completed_qty || 0
              }
            }

            return (
              <div
                key={idx}
                className="card"
                style={{
                  background: '#fff',
                  borderRadius: '10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem 0.4rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem' }}>{locName}</strong>
                    <div style={{ fontSize: '0.7rem', color: '#868e96' }}>{ops.length} operation{ops.length === 1 ? '' : 's'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {locationCompleted > 0 && (
                      <span style={{
                        fontSize: '0.7rem',
                        background: 'var(--success)',
                        color: '#fff',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px'
                      }}>
                        {locationCompleted.toLocaleString()} pcs
                      </span>
                    )}
                    <button
                      onClick={() => onSelectLocation(locName)}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '999px',
                        border: '1px solid var(--primary)',
                        background: 'transparent',
                        color: 'var(--primary)',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      Focus
                    </button>
                  </div>
                </div>

                <div style={{ padding: '0.4rem 0.8rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {ops.length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#868e96' }}>
                      <em>No operations defined for this location.</em>
                    </div>
                  )}

                  {ops.map((op, j) => {
                    const name = op.name || op.operation || `Operation ${j + 1}`
                    const key = String(op.id ?? op.operation_id ?? name)
                    let completed = completedByKey[key] || 0

                    if (!completed) {
                      const opName = norm(name)
                      for (const row of progressRows) {
                        const rName = norm(row.operation_name || row.status_name || statusIdToName[row.status_id])
                        if (rName && (rName === opName || rName.includes(opName) || opName.includes(rName))) {
                          completed += row.completed_qty || 0
                        }
                      }

                      if (completed === 0 && opName.includes('assembly') && ln.includes('smt') && locationCompleted > 0) {
                        completed = locationCompleted
                      }
                    }

                    const pct = orderQty > 0 ? Math.round((completed / orderQty) * 100) : 0

                    return (
                      <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.82rem', color: '#495057' }}>
                          <span>{name}</span>
                          <span style={{ color: '#343a40', fontWeight: 600 }}>{completed.toLocaleString()} pcs&nbsp;<span style={{ color: '#868e96', fontSize: '0.75rem' }}>({pct}%)</span></span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '6px',
                          borderRadius: '999px',
                          background: '#e9ecef',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: pct === 100 ? 'var(--success)' : 'var(--primary)',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
