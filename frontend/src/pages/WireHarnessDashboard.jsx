import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWireHarnessSchedule, getWireHarnessScheduleDetail } from '../api'
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  BarChart3,
  Timer,
  Calendar,
  Clock,
  Activity,
  Pause,
  Play,
  Info,
  ChevronRight
} from 'lucide-react'
import {
  format,
  parseISO,
  startOfDay,
  addDays
} from 'date-fns'

const PREFERRED_WIRE_HARNESS_WORKCENTERS = [
  'WH WIRE AND CABLE PROCESSING',
  'WH TERMINATING',
  'WH SMALL ASSEMBLY',
  'WH LARGE ASSEMBLY',
  'WH ULTRA SONIC SPLICING',
  'WH OVERMOLDING',
  'WH QUALITY CONTROL'
]

const WORKCENTER_ORDER_MAP = PREFERRED_WIRE_HARNESS_WORKCENTERS.reduce((acc, name, index) => {
  acc[name] = index
  return acc
}, {})

const workcenterColorMap = {
  'WH WIRE AND CABLE PROCESSING': '#ffffff',
  'WH TERMINATING': '#bbf7d0',
  'WH SMALL ASSEMBLY': '#fef08a',
  'WH LARGE ASSEMBLY': '#fdba74',
  'WH ULTRA SONIC SPLICING': '#bfdbfe',
  'WH OVERMOLDING': '#fca5a5',
  'WH QUALITY CONTROL': '#e9d5ff'
}

const getStatusBadgeColor = (status) => {
  if (!status) return '#CBD5F5'
  const normalized = status.toLowerCase()
  if (normalized.includes('missing') || normalized.includes('short')) return '#fbbf24'
  if (normalized.includes('hold') || normalized.includes('waiting')) return '#f97316'
  if (normalized.includes('complete') || normalized.includes('done')) return '#34d399'
  if (normalized.includes('test') || normalized.includes('inspection')) return '#60a5fa'
  return '#cbd5f5'
}

const buildColumnMap = (cols = []) => {
  const colMap = {}
  cols.forEach((col, idx) => {
    const displayName = (col.display_name || '').toLowerCase()
    const name = (col.name || '').toLowerCase()
    const combined = `${displayName} ${name}`

    if ((displayName.includes('scheduled location') || displayName.includes('ordline status') ||
         name.includes('description')) && colMap.workcenter === undefined) {
      colMap.workcenter = idx
    }
    else if (combined.includes('build operation') || combined.includes('operation') || name === 'name') {
      if (colMap.operation === undefined) colMap.operation = idx
    }
    else if (combined.includes('order') && (combined.includes('ordernum') || combined.includes('order num'))) {
      colMap.order = idx
    }
    else if (combined.includes('line') && (combined.includes('lineitem') || combined.includes('line item'))) {
      colMap.line = idx
    }
    else if (combined.includes('prcpart') || combined.includes('prc part') || combined.includes('part')) {
      if (colMap.part === undefined) colMap.part = idx
    }
    else if (combined.includes('work date') && !combined.includes('max') && !combined.includes('min')) {
      if (colMap.startDate === undefined) colMap.startDate = idx
    }
    else if ((displayName.includes('min') || displayName.includes('start')) &&
             (combined.includes('work date') || combined.includes('date'))) {
      if (colMap.startDate === undefined) colMap.startDate = idx
    }
    else if (combined.includes('work end') && !combined.includes('max') && !combined.includes('min')) {
      if (colMap.endDate === undefined) colMap.endDate = idx
    }
    else if ((displayName.includes('max') || displayName.includes('end')) &&
             (combined.includes('work end') || combined.includes('end'))) {
      if (colMap.endDate === undefined) colMap.endDate = idx
    }
    else if (combined.includes('hours') || combined.includes('sum')) {
      if (colMap.hours === undefined) colMap.hours = idx
    }
    else if (displayName.includes('current location') ||
             (name.includes('description') && colMap.workcenter !== undefined && colMap.currentLocation === undefined)) {
      colMap.currentLocation = idx
    }
    else if (combined.includes('production status') || combined.includes('prod status') ||
             name === 'name_2' || name === 'name') {
      if (colMap.prodStatus === undefined) colMap.prodStatus = idx
    }
    else if (combined.includes('prod notes') || combined.includes('notes')) {
      colMap.notes = idx
    }
    else if (combined.includes('build order')) {
      colMap.buildOrder = idx
    }
    else if (combined.includes('priority rank') || combined.includes('priority')) {
      colMap.priority = idx
    }
  })
  return colMap
}

const parseScheduleData = (detailData, fallbackData) => {
  let rows = []
  let cols = []

  if (detailData?.result?.data?.rows) {
    rows = detailData.result.data.rows
    cols = detailData.result.data.cols || []
  } else if (fallbackData?.results?.[0]?.data?.data?.rows) {
    rows = fallbackData.results[0].data.data.rows
    cols = fallbackData.results[0].data.data.cols || []
  } else {
    return { workcenters: [], jobs: [] }
  }

  const colMap = buildColumnMap(cols)
  const grouped = {}

  rows.forEach(row => {
    const workcenter = row[colMap.workcenter] || 'Unknown'
    const startDateTime = row[colMap.startDate] ? parseISO(row[colMap.startDate]) : null
    const endDateTime = row[colMap.endDate] ? parseISO(row[colMap.endDate]) : null
    const startDate = startDateTime ? startOfDay(startDateTime) : null
    const endDate = endDateTime ? startOfDay(endDateTime) : null

    if (!grouped[workcenter]) {
      grouped[workcenter] = {
        name: workcenter,
        jobs: [],
        jobMap: new Map()
      }
    }

    const workOrder = (row[colMap.order] || '').toString()
    const lineItem = row[colMap.line] !== undefined && row[colMap.line] !== null ? row[colMap.line].toString() : ''
    const workOrderDisplay = lineItem ? `${workOrder}-${lineItem}` : workOrder
    const partNumber = row[colMap.part] || ''
    const operationName = row[colMap.operation] || ''
    const currentLocation = row[colMap.currentLocation] || ''

    const jobKey = [workOrder, lineItem, partNumber, operationName, currentLocation].join('|')
    const workcenterGroup = grouped[workcenter]
    const jobMap = workcenterGroup.jobMap
    const existing = jobMap.get(jobKey)

    const hoursValue = parseFloat(row[colMap.hours]) || 0
    const prodStatus = row[colMap.prodStatus] || ''

    if (existing) {
      if (startDateTime && (!existing.startDateTime || startDateTime < existing.startDateTime)) {
        existing.startDateTime = startDateTime
        existing.startDate = startDate || existing.startDate
      }
      if (endDateTime && (!existing.endDateTime || endDateTime > existing.endDateTime)) {
        existing.endDateTime = endDateTime
        existing.endDate = endDate || existing.endDate
      }
      if (!existing.startDate && startDate) existing.startDate = startDate
      if (!existing.endDate && endDate) existing.endDate = endDate
      existing.hours = (existing.hours || 0) + hoursValue
      if (!existing.prodStatus && prodStatus) {
        existing.prodStatus = prodStatus
      }
      if (row[colMap.notes]) {
        existing.notes = existing.notes ? `${existing.notes}\n${row[colMap.notes]}` : row[colMap.notes]
      }
      if (existing.buildOrder === null && row[colMap.buildOrder] !== undefined) {
        existing.buildOrder = row[colMap.buildOrder]
      }
    } else {
      const jobEntry = {
        workcenter,
        order: workOrder,
        lineItem,
        orderDisplay: workOrderDisplay,
        part: partNumber,
        operation: operationName,
        startDate,
        endDate,
        startDateTime,
        endDateTime,
        hours: hoursValue,
        currentLocation,
        prodStatus,
        notes: row[colMap.notes] || '',
        buildOrder: row[colMap.buildOrder] || null,
        priority: row[colMap.priority] || 0,
        rawRow: row
      }

      workcenterGroup.jobs.push(jobEntry)
      jobMap.set(jobKey, jobEntry)
    }
  })

  const workcenters = Object.values(grouped)
    .map(wc => {
      const { jobMap, ...rest } = wc
      return {
        ...rest,
        jobs: rest.jobs.sort((a, b) => {
          if (a.startDate && b.startDate) {
            const diff = a.startDate.getTime() - b.startDate.getTime()
            if (diff !== 0) return diff
          }
          if (a.buildOrder !== null && b.buildOrder !== null) {
            return a.buildOrder - b.buildOrder
          }
          return (b.priority || 0) - (a.priority || 0)
        })
      }
    })
    .sort((a, b) => {
      const orderA = WORKCENTER_ORDER_MAP[a.name] ?? Number.MAX_SAFE_INTEGER
      const orderB = WORKCENTER_ORDER_MAP[b.name] ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })

  const jobs = workcenters.flatMap(wc => wc.jobs.map(job => ({ ...job, workcenter: wc.name })))

  return { workcenters, jobs }
}

const formatTimeRange = (start, end) => {
  if (!start && !end) return '—'
  if (start && !end) return `${format(start, 'MMM d, h:mm a')} —`
  if (!start && end) return `— ${format(end, 'MMM d, h:mm a')}`
  if (start.toDateString() === end.toDateString()) {
    return `${format(start, 'MMM d, h:mm a')} – ${format(end, 'h:mm a')}`
  }
  return `${format(start, 'MMM d, h:mm a')} – ${format(end, 'MMM d, h:mm a')}`
}

export default function WireHarnessDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const {
    data: scheduleDetailData,
    isLoading: isLoadingDetail,
    error: errorDetail,
    refetch: refetchDetail
  } = useQuery({
    queryKey: ['wireHarnessDashboardDetail'],
    queryFn: async () => {
      const response = await getWireHarnessScheduleDetail('300')
      const payload = response.data || response
      setLastRefresh(new Date())
      return payload
    },
    refetchInterval: autoRefresh ? 5 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
    retry: 1
  })

  const {
    data: scheduleData,
    isFetching: isFetchingFallback,
    refetch: refetchFallback
  } = useQuery({
    queryKey: ['wireHarnessDashboardFallback'],
    queryFn: async () => {
      const response = await getWireHarnessSchedule('300')
      const payload = response.data || response
      if (!scheduleDetailData) {
        setLastRefresh(new Date())
      }
      return payload
    },
    enabled: false,
    refetchOnWindowFocus: false,
    retry: 1
  })

  useEffect(() => {
    if (errorDetail && !scheduleData) {
      refetchFallback()
    }
  }, [errorDetail, scheduleData, refetchFallback])

  const { workcenters, jobs } = useMemo(() => parseScheduleData(scheduleDetailData, scheduleData), [scheduleDetailData, scheduleData])

  const now = new Date()
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  const totalJobs = jobs.length
  const totalHours = jobs.reduce((sum, job) => sum + (job.hours || 0), 0)
  const jobsStartingToday = jobs.filter(job => job.startDateTime && job.startDateTime >= todayStart && job.startDateTime < tomorrowStart)
  const pastDueJobs = jobs.filter(job => job.endDateTime && job.endDateTime < now)
  const flaggedJobs = jobs
    .filter(job => {
      const status = job.prodStatus ? job.prodStatus.toLowerCase() : ''
      if (!status) return false
      return status.includes('missing') || status.includes('hold') || status.includes('waiting') || status.includes('late')
    })
    .sort((a, b) => (a.endDateTime || a.startDateTime || now) - (b.endDateTime || b.startDateTime || now))
    .slice(0, 8)

  const upcomingJobs = jobs
    .filter(job => job.startDateTime && job.startDateTime >= now)
    .sort((a, b) => a.startDateTime - b.startDateTime)
    .slice(0, 10)

  const statusBreakdown = useMemo(() => {
    const counts = new Map()
    jobs.forEach(job => {
      const status = job.prodStatus || 'Unspecified'
      counts.set(status, (counts.get(status) || 0) + 1)
    })

    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0) || 1

    return Array.from(counts.entries())
      .map(([status, count]) => ({
        status,
        count,
        percent: Math.round((count / total) * 100)
      }))
      .sort((a, b) => b.count - a.count)
  }, [jobs])

  const workcenterSummary = useMemo(() => {
    return workcenters.map(wc => {
      const totalHours = wc.jobs.reduce((sum, job) => sum + (job.hours || 0), 0)
      const upcoming = wc.jobs.filter(job => job.startDateTime && job.startDateTime >= now).length
      const pastDue = wc.jobs.filter(job => job.endDateTime && job.endDateTime < now).length
      return {
        name: wc.name,
        totalJobs: wc.jobs.length,
        totalHours,
        upcoming,
        pastDue
      }
    })
  }, [workcenters, now])

  const handleManualRefresh = () => {
    refetchDetail()
    if (scheduleDetailData == null) {
      refetchFallback()
    }
  }

  if (isLoadingDetail && !scheduleDetailData && !scheduleData) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Wire Harness Dashboard</h1>
            <p className="page-description">Live production health for Wire Harness workcenters</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem', color: '#3b82f6' }} />
          <p>Loading dashboard data...</p>
        </div>
      </div>
    )
  }

  if (errorDetail && !scheduleData) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Wire Harness Dashboard</h1>
            <p className="page-description">Live production health for Wire Harness workcenters</p>
          </div>
        </div>
        <div className="card" style={{ backgroundColor: '#fee2e2', borderColor: '#fca5a5' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
              <AlertCircle size={24} />
              <strong>Error loading dashboard data</strong>
            </div>
            <p style={{ marginTop: '0.5rem', color: '#991b1b' }}>
              {errorDetail.response?.data?.detail || errorDetail.message || 'Failed to load schedule data'}
            </p>
            <button onClick={handleManualRefresh} className="btn btn-primary" style={{ marginTop: '1rem' }}>
              <RefreshCw size={18} style={{ marginRight: '0.5rem' }} />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wire Harness Dashboard</h1>
          <p className="page-description">Real-time outlook for core Wire Harness workcenters (Prodline 300)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
            Last refresh: <strong>{format(lastRefresh, 'MMM d, h:mm:ss a')}</strong>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {autoRefresh ? <Pause size={16} /> : <Play size={16} />}
            {autoRefresh ? 'Pause Live Refresh' : 'Resume Live Refresh'}
          </button>
          <button
            onClick={handleManualRefresh}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ borderTop: '4px solid #2563eb' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c757d' }}>Total Operations</p>
                <h2 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{totalJobs}</h2>
              </div>
              <BarChart3 size={32} color="#2563eb" />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>Across {workcenters.length} Wire Harness workcenters</p>
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid #22c55e' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c757d' }}>Scheduled Hours</p>
                <h2 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{totalHours.toFixed(1)} hrs</h2>
              </div>
              <Clock size={32} color="#22c55e" />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>Including overlapping tasks and rework</p>
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid #f97316' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c757d' }}>Starting Today</p>
                <h2 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{jobsStartingToday.length}</h2>
              </div>
              <Calendar size={32} color="#f97316" />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>Operations scheduled to kick off before midnight</p>
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6c757d' }}>Past Due</p>
                <h2 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>{pastDueJobs.length}</h2>
              </div>
              <AlertCircle size={32} color="#ef4444" />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>Operations with scheduled end prior to now</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        <div className="card">
          <div className="card-header" style={{ background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)', color: 'white', padding: '1rem', borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Timer size={18} />
              <strong>Workcenter Load</strong>
            </div>
            <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', opacity: 0.9 }}>Hours, upcoming, and past due counts by workcenter</p>
          </div>
          <div className="card-body" style={{ paddingTop: '0.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.5rem', fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
              <span>Workcenter</span>
              <span style={{ textAlign: 'right' }}>Ops</span>
              <span style={{ textAlign: 'right' }}>Hours</span>
              <span style={{ textAlign: 'right' }}>Past Due</span>
            </div>
            {workcenterSummary.map(summary => (
              <div
                key={summary.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  marginBottom: '0.5rem',
                  backgroundColor: workcenterColorMap[summary.name] || '#f9fafb',
                  border: '1px solid rgba(15, 23, 42, 0.08)'
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>{summary.name}</strong>
                  <div style={{ fontSize: '0.7rem', color: '#4b5563', marginTop: '0.15rem' }}>
                    Upcoming: {summary.upcoming}
                  </div>
                </div>
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{summary.totalJobs}</span>
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{summary.totalHours.toFixed(1)}</span>
                <span style={{ textAlign: 'right', fontWeight: 600, color: summary.pastDue > 0 ? '#ef4444' : '#1f2937' }}>{summary.pastDue}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ background: 'linear-gradient(90deg, #0f766e, #14b8a6)', color: 'white', padding: '1rem', borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} />
              <strong>Status Distribution</strong>
            </div>
            <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', opacity: 0.9 }}>Where jobs are concentrated today</p>
          </div>
          <div className="card-body" style={{ paddingTop: '0.75rem' }}>
            {statusBreakdown.map(item => (
              <div key={item.status} style={{ marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                  <span>{item.status}</span>
                  <span style={{ fontWeight: 600 }}>{item.count} ({item.percent}%)</span>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ width: `${item.percent}%`, backgroundColor: getStatusBadgeColor(item.status), height: '100%' }} />
                </div>
              </div>
            ))}
            {statusBreakdown.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#6c757d' }}>No status data available.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ background: 'linear-gradient(90deg, #991b1b, #ef4444)', color: 'white', padding: '1rem', borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={18} />
              <strong>Attention Needed</strong>
            </div>
            <p style={{ marginTop: '0.25rem', fontSize: '0.8rem', opacity: 0.9 }}>Operations flagged by status or past due</p>
          </div>
          <div className="card-body" style={{ paddingTop: '0.75rem' }}>
            {flaggedJobs.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>No blocked or high-risk jobs at the moment.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {flaggedJobs.map(job => (
                  <div key={`${job.orderDisplay}-${job.operation}`} style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(148, 163, 184, 0.4)', background: 'rgba(254, 242, 242, 0.75)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                      <span>{job.orderDisplay}</span>
                      <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{job.workcenter}</span>
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#4b5563' }}>
                      {job.operation || 'Unspecified Operation'}
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '999px', backgroundColor: getStatusBadgeColor(job.prodStatus), color: '#1f2937', fontWeight: 600 }}>
                        {job.prodStatus || 'Status N/A'}
                      </span>
                      <span>{job.endDateTime ? `Due ${format(job.endDateTime, 'MMM d, h:mm a')}` : 'End time TBD'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} />
            <strong>Next-Up Operations</strong>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>Earliest 10 operations with a scheduled start time</div>
        </div>
        <div className="card-body" style={{ paddingTop: '0.75rem' }}>
          {upcomingJobs.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>No upcoming operations scheduled.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {upcomingJobs.map(job => (
                <div key={`${job.orderDisplay}-${job.operation}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '0.75rem', backgroundColor: '#f9fafb' }}>
                  <div style={{ flex: '1 1 auto' }}>
                    <div style={{ fontWeight: 600 }}>{job.orderDisplay}</div>
                    <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.25rem' }}>{job.operation || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '0.25rem' }}>{job.workcenter}</div>
                  </div>
                  <div style={{ flex: '0 0 220px', fontSize: '0.8rem', color: '#1f2937' }}>
                    {formatTimeRange(job.startDateTime, job.endDateTime)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#6c757d', textAlign: 'right' }}>
                    {job.part || '—'}
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(isFetchingFallback || (isLoadingDetail && scheduleData)) && (
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#6c757d' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Refreshing data...
        </div>
      )}

      <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#6c757d', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Info size={14} />
        Dashboard derived from Metabase question 984 (primary) with dashboard 64 as fallback.
      </div>
    </div>
  )
}
