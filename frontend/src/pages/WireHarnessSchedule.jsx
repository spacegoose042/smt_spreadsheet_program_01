import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWireHarnessSchedule } from '../api'
import { Calendar, Clock, Package, AlertCircle, RefreshCw, Loader2, TrendingUp, MapPin, Wrench, FileText, Filter, X } from 'lucide-react'
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, differenceInDays, isWithinInterval } from 'date-fns'

const PREFERRED_WIRE_HARNESS_WORKCENTERS = [
  'WH WIRE AND CABLE PROCESSING',
  'WH TERMINATING',
  'WH SMALL ASSEMBLY',
  'WH LARGE ASSEMBLY',
  'WH ULTRA SONIC SPLICING',
  'WH OVERMOLDING',
  'WH QUALITY CONTROL'
]

const WORKCENTER_COLOR_MAP = {
  'WH WIRE AND CABLE PROCESSING': '#fde68a',
  'WH TERMINATING': '#bbf7d0',
  'WH SMALL ASSEMBLY': '#bfdbfe',
  'WH LARGE ASSEMBLY': '#fdba74',
  'WH ULTRA SONIC SPLICING': '#fca5a5',
  'WH OVERMOLDING': '#c4b5fd',
  'WH QUALITY CONTROL': '#fbcfe8'
}

const hexToRgba = (hex, alpha = 0.32) => {
  if (!hex) return null
  const sanitized = hex.replace('#', '')
  const expand = sanitized.length === 3
    ? sanitized.split('').map((char) => char + char).join('')
    : sanitized
  if (expand.length !== 6) return null
  const bigint = parseInt(expand, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getWorkcenterAccent = (name) => WORKCENTER_COLOR_MAP[name] || '#d1d5db'
const getWorkcenterBackground = (name) => hexToRgba(getWorkcenterAccent(name), 0.18) || '#f5f5f5'

const parseDateValue = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const parsed = parseISO(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

const WORKCENTER_ORDER_MAP = PREFERRED_WIRE_HARNESS_WORKCENTERS.reduce((acc, name, index) => {
  acc[name] = index
  return acc
}, {})

export default function WireHarnessSchedule() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [selectedWorkcenters, setSelectedWorkcenters] = useState([...PREFERRED_WIRE_HARNESS_WORKCENTERS]) // default visible
  const [selectedProdStatuses, setSelectedProdStatuses] = useState([]) // Empty = all
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [includePastDue, setIncludePastDue] = useState(false)

  // Fetch schedule data with auto-refresh every 5 minutes
  const { data: scheduleData, isLoading, error, refetch } = useQuery({
    queryKey: ['wireHarnessSchedule'],
    queryFn: async () => {
      const response = await getWireHarnessSchedule('300')
      setLastRefresh(new Date())
      return response.data || response
    },
    refetchInterval: autoRefresh ? 5 * 60 * 1000 : false, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
  })

  // Process and group data by workcenter
  const workcenters = useMemo(() => {
    if (!scheduleData?.results?.[0]?.data?.data?.rows) return []

    const rows = scheduleData.results[0].data.data.rows
    const cols = scheduleData.results[0].data.data.cols || []

    // Map column indices to names - using both display_name and name fields
    const colMap = {}
    cols.forEach((col, idx) => {
      const displayName = (col.display_name || '').toLowerCase()
      const name = (col.name || '').toLowerCase()
      const combined = `${displayName} ${name}`
      
      // Workcenter (Scheduled Location) - first description field
      if ((displayName.includes('scheduled location') || displayName.includes('ordline status') || 
           name.includes('description')) && colMap.workcenter === undefined) {
        colMap.workcenter = idx
      }
      // Build Operation
      else if (combined.includes('build operation') || combined.includes('operation') || name === 'name') {
        if (colMap.operation === undefined) colMap.operation = idx
      }
      // Order Number
      else if (combined.includes('order') && (combined.includes('ordernum') || combined.includes('order num'))) {
        colMap.order = idx
      }
      // Line Item
      else if (combined.includes('line') && (combined.includes('lineitem') || combined.includes('line item'))) {
        colMap.line = idx
      }
      // Part Number
      else if (combined.includes('prcpart') || combined.includes('prc part') || combined.includes('part')) {
        if (colMap.part === undefined) colMap.part = idx
      }
      // Start Date (Min of Work Date)
      else if ((displayName.includes('min') || displayName.includes('start')) && 
               (combined.includes('work date') || combined.includes('date'))) {
        colMap.startDate = idx
      }
      // End Date (Max of Work End)
      else if ((displayName.includes('max') || displayName.includes('end')) && 
               (combined.includes('work end') || combined.includes('end'))) {
        colMap.endDate = idx
      }
      // Hours
      else if (combined.includes('hours') || combined.includes('sum')) {
        if (colMap.hours === undefined) colMap.hours = idx
      }
      // Current Location (second description field)
      else if (displayName.includes('current location') || 
               (name.includes('description') && colMap.workcenter !== undefined && colMap.currentLocation === undefined)) {
        colMap.currentLocation = idx
      }
      // Production Status
      else if (combined.includes('production status') || combined.includes('prod status') || 
               (name === 'name_2' || name === 'name')) {
        if (colMap.prodStatus === undefined) colMap.prodStatus = idx
      }
      // Production Notes
      else if (combined.includes('prod notes') || combined.includes('notes')) {
        colMap.notes = idx
      }
      // Build Order
      else if (combined.includes('build order')) {
        colMap.buildOrder = idx
      }
      // Priority Rank
      else if (combined.includes('priority rank') || combined.includes('priority')) {
        colMap.priority = idx
      }
    })

    // Group by workcenter
    const grouped = {}
    rows.forEach(row => {
      const workcenter = row[colMap.workcenter] || 'Unknown'
      const startDate = row[colMap.startDate] ? parseISO(row[colMap.startDate]) : null
      const endDate = row[colMap.endDate] ? parseISO(row[colMap.endDate]) : null

      if (!grouped[workcenter]) {
        grouped[workcenter] = {
          name: workcenter,
          jobs: []
        }
      }

      grouped[workcenter].jobs.push({
        order: row[colMap.order] || '',
        line: row[colMap.line] || '',
        part: row[colMap.part] || '',
        operation: row[colMap.operation] || '',
        startDate,
        endDate,
        hours: row[colMap.hours] || 0,
        currentLocation: row[colMap.currentLocation] || '',
        prodStatus: row[colMap.prodStatus] || '',
        notes: row[colMap.notes] || '',
        buildOrder: row[colMap.buildOrder] || null,
        priority: row[colMap.priority] || 0,
        rawRow: row,
        colMap
      })
    })

    // Sort workcenters and jobs within each workcenter
    return Object.values(grouped)
      .map(wc => ({
        ...wc,
        jobs: wc.jobs.sort((a, b) => {
          // Sort by start date, then build order, then priority
          if (a.startDate && b.startDate) {
            const dateDiff = a.startDate.getTime() - b.startDate.getTime()
            if (dateDiff !== 0) return dateDiff
          }
          if (a.buildOrder !== null && b.buildOrder !== null) {
            return a.buildOrder - b.buildOrder
          }
          return (b.priority || 0) - (a.priority || 0)
        })
      }))
      .sort((a, b) => {
        const orderA = WORKCENTER_ORDER_MAP[a.name] ?? Number.MAX_SAFE_INTEGER
        const orderB = WORKCENTER_ORDER_MAP[b.name] ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return a.name.localeCompare(b.name)
      })
  }, [scheduleData])

  // Extract unique values for filters
  const { uniqueWorkcenters, uniqueProdStatuses } = useMemo(() => {
    const workcentersSet = new Set()
    const statusesSet = new Set()
    
    workcenters.forEach(wc => {
      workcentersSet.add(wc.name)
      wc.jobs.forEach(job => {
        if (job.prodStatus) {
          statusesSet.add(job.prodStatus)
        }
      })
    })
    
    const workcenterList = Array.from(workcentersSet)
    workcenterList.sort((a, b) => {
      const orderA = WORKCENTER_ORDER_MAP[a] ?? Number.MAX_SAFE_INTEGER
      const orderB = WORKCENTER_ORDER_MAP[b] ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
    
    return {
      uniqueWorkcenters: workcenterList,
      uniqueProdStatuses: Array.from(statusesSet).sort()
    }
  }, [workcenters])

  // Apply filters to workcenters
  const filteredWorkcenters = useMemo(() => {
    const rawFilterStart = dateFilterStart ? startOfDay(parseISO(dateFilterStart)) : null
    const rawFilterEnd = dateFilterEnd ? endOfDay(parseISO(dateFilterEnd)) : null
    const noDateFilters = !rawFilterStart && !rawFilterEnd
    const effectiveFilterStart = noDateFilters && !includePastDue
      ? startOfDay(new Date())
      : rawFilterStart
    const effectiveFilterEnd = noDateFilters && !includePastDue
      ? endOfDay(new Date())
      : rawFilterEnd

    let filtered = workcenters

    // Filter by workcenter
    if (selectedWorkcenters.length > 0) {
      filtered = filtered.filter(wc => selectedWorkcenters.includes(wc.name))
    }

    // Filter by production status and dates
    filtered = filtered.map(wc => ({
      ...wc,
      jobs: wc.jobs.filter(job => {
        // Production status filter
        if (selectedProdStatuses.length > 0) {
          if (!job.prodStatus || !selectedProdStatuses.includes(job.prodStatus)) {
            return false
          }
        }

        if (effectiveFilterStart !== null || effectiveFilterEnd !== null) {
          const baseStartDate = parseDateValue(job.calculated_start_datetime) || job.startDate || parseDateValue(job.min_start_date) || parseDateValue(job.scheduled_start_date) || parseDateValue(job.cetec_ship_date)
          const baseEndDate = parseDateValue(job.calculated_end_datetime) || job.endDate || parseDateValue(job.scheduled_end_date) || baseStartDate
          const jobStart = baseStartDate ? startOfDay(baseStartDate) : null
          const jobEnd = baseEndDate ? endOfDay(baseEndDate) : null

          if (jobStart || jobEnd) {
            const effectiveJobStart = jobStart || jobEnd
            const effectiveJobEnd = jobEnd || jobStart

            if (effectiveFilterStart && effectiveJobEnd && effectiveJobEnd < effectiveFilterStart) {
              if (!(includePastDue && effectiveJobEnd < effectiveFilterStart)) {
                return false
              }
            }

            if (effectiveFilterEnd && effectiveJobStart && effectiveJobStart > effectiveFilterEnd) {
              return false
            }
          } else if (!includePastDue) {
            const todayStart = startOfDay(new Date())
            if (effectiveFilterStart && effectiveFilterStart > todayStart) {
              return false
            }
          }
        }

        return true
      })
    })).filter(wc => wc.jobs.length > 0) // Remove workcenters with no jobs after filtering

    return filtered
  }, [workcenters, selectedWorkcenters, selectedProdStatuses, dateFilterStart, dateFilterEnd, includePastDue])

  // Calculate date range for timeline
  const dateRange = useMemo(() => {
    if (workcenters.length === 0) return { start: new Date(), end: new Date() }
    
    let minDate = null
    let maxDate = null

    workcenters.forEach(wc => {
      wc.jobs.forEach(job => {
        if (job.startDate && (!minDate || job.startDate < minDate)) {
          minDate = job.startDate
        }
        if (job.endDate && (!maxDate || job.endDate > maxDate)) {
          maxDate = job.endDate
        }
      })
    })

    return {
      start: minDate || new Date(),
      end: maxDate || new Date()
    }
  }, [workcenters])

  const isDefaultWorkcenterSelection = selectedWorkcenters.length === PREFERRED_WIRE_HARNESS_WORKCENTERS.length &&
    PREFERRED_WIRE_HARNESS_WORKCENTERS.every(wc => selectedWorkcenters.includes(wc))

  const hasWorkcenterFilter = selectedWorkcenters.length > 0 && !isDefaultWorkcenterSelection

  const hasActiveFilters = hasWorkcenterFilter || 
                          selectedProdStatuses.length > 0 || 
                          dateFilterStart || 
                          dateFilterEnd

  const isShowingAllWorkcenters = selectedWorkcenters.length === 0

  const dateButtonStyle = (active) => ({
    padding: '0.35rem 0.8rem',
    borderRadius: '999px',
    border: `1px solid ${active ? '#0f766e' : '#d1d5db'}`,
    backgroundColor: active ? '#0f766e' : '#ffffff',
    color: active ? '#ffffff' : '#1f2937',
    fontSize: '0.8rem',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
    boxShadow: active ? '0 0 0 1px rgba(15,118,110,0.25)' : 'none'
  })

  const handleDatePreset = (preset) => {
    const today = new Date()
    const start = new Date(today)
    const end = new Date(today)

    switch (preset) {
      case 'today':
        break
      case 'tomorrow':
        start.setDate(start.getDate() + 1)
        end.setDate(end.getDate() + 1)
        break
      case 'thisWeek': {
        const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay()
        start.setDate(start.getDate() - (dayOfWeek - 1))
        end.setDate(start.getDate() + 6)
        break
      }
      case 'nextWeek': {
        const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay()
        start.setDate(start.getDate() - (dayOfWeek - 1) + 7)
        end.setTime(start.getTime())
        end.setDate(end.getDate() + 6)
        break
      }
      case 'thisMonth':
        start.setDate(1)
        end.setMonth(start.getMonth() + 1, 0)
        break
      case 'next30':
        end.setDate(end.getDate() + 30)
        break
      default:
        break
    }

    setDateFilterStart(format(start, 'yyyy-MM-dd'))
    setDateFilterEnd(format(end, 'yyyy-MM-dd'))
  }

  const quickButtonStyle = (active) => ({
    padding: '0.4rem 0.85rem',
    borderRadius: '999px',
    border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    backgroundColor: active ? '#2563eb' : '#ffffff',
    color: active ? '#ffffff' : '#1f2937',
    fontSize: '0.8rem',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
    boxShadow: active ? '0 0 0 1px rgba(37,99,235,0.25)' : 'none'
  })

  const handleSelectAllPreferred = () => setSelectedWorkcenters([...PREFERRED_WIRE_HARNESS_WORKCENTERS])

  const handleShowAllWorkcenters = () => setSelectedWorkcenters([])

  const handleQuickWorkcenter = (workcenter) => setSelectedWorkcenters([workcenter])

  const clearFilters = () => {
    setSelectedWorkcenters([])
    setSelectedProdStatuses([])
    setDateFilterStart('')
    setDateFilterEnd('')
    setIncludePastDue(false)
  }

  const toggleWorkcenter = (workcenter) => {
    setSelectedWorkcenters(prev => 
      prev.includes(workcenter)
        ? prev.filter(w => w !== workcenter)
        : [...prev, workcenter]
    )
  }

  const toggleProdStatus = (status) => {
    setSelectedProdStatuses(prev => 
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const handleManualRefresh = () => {
    refetch()
  }

  const getStatusColor = (status) => {
    if (!status) return '#6c757d'
    const statusLower = status.toLowerCase()
    if (statusLower.includes('missing')) return '#f59e0b'
    if (statusLower.includes('in-process')) return '#10b981'
    if (statusLower.includes('waiting')) return '#f59e0b'
    if (statusLower.includes('ready')) return '#3b82f6'
    return '#6c757d'
  }

  const getPriorityColor = (priority) => {
    if (priority === 3) return '#ef4444'
    if (priority === 2) return '#f59e0b'
    if (priority === 1) return '#3b82f6'
    return '#6c757d'
  }

  if (isLoading && !scheduleData) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Wire Harness Schedule</h1>
            <p className="page-description">Production schedule for Wire Harness Department (Prodline 300)</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem', color: '#3b82f6' }} />
          <p>Loading schedule data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Wire Harness Schedule</h1>
            <p className="page-description">Production schedule for Wire Harness Department (Prodline 300)</p>
          </div>
        </div>
        <div className="card" style={{ backgroundColor: '#fee2e2', borderColor: '#fca5a5' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
              <AlertCircle size={24} />
              <strong>Error loading schedule</strong>
            </div>
            <p style={{ marginTop: '0.5rem', color: '#991b1b' }}>
              {error.response?.data?.detail || error.message || 'Failed to load schedule data'}
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
          <h1 className="page-title">Wire Harness Schedule</h1>
          <p className="page-description">Production schedule for Wire Harness Department (Prodline 300)</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Filter size={18} />
            Filters
            {hasActiveFilters && (
              <span style={{
                marginLeft: '0.25rem',
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {[selectedWorkcenters.length, selectedProdStatuses.length, dateFilterStart ? 1 : 0, dateFilterEnd ? 1 : 0].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.9rem' }}>Auto-refresh (5 min)</span>
          </label>
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {isLoading ? (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <RefreshCw size={18} />
            )}
            Refresh
          </button>
          {lastRefresh && (
            <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
              Last updated: {format(lastRefresh, 'h:mm:ss a')}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Quick Workcenters:</span>
        <button
          type="button"
          style={quickButtonStyle(isDefaultWorkcenterSelection)}
          onClick={handleSelectAllPreferred}
        >
          All Preferred
        </button>
        <button
          type="button"
          style={quickButtonStyle(isShowingAllWorkcenters)}
          onClick={handleShowAllWorkcenters}
        >
          Show All
        </button>
        {PREFERRED_WIRE_HARNESS_WORKCENTERS.map((workcenter) => {
          const isActive = selectedWorkcenters.length === 1 && selectedWorkcenters[0] === workcenter
          return (
            <button
              key={workcenter}
              type="button"
              style={quickButtonStyle(isActive)}
              onClick={() => handleQuickWorkcenter(workcenter)}
            >
              {workcenter}
            </button>
          )
        })}
      </div>


      <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>Quick Dates:</span>
        {['today', 'tomorrow', 'thisWeek', 'nextWeek', 'thisMonth', 'next30'].map((preset) => {
          const labelMap = {
            today: 'Today',
            tomorrow: 'Tomorrow',
            thisWeek: 'This Week',
            nextWeek: 'Next Week',
            thisMonth: 'This Month',
            next30: 'Next 30 Days'
          }

          const isActive = (() => {
            if (!dateFilterStart || !dateFilterEnd) return false
            const currentStart = parseDateValue(dateFilterStart)
            const currentEnd = parseDateValue(dateFilterEnd)
            if (!currentStart || !currentEnd) return false
            const today = new Date()
            const start = new Date(today)
            const end = new Date(today)
            switch (preset) {
              case 'today':
                break
              case 'tomorrow':
                start.setDate(start.getDate() + 1)
                end.setDate(end.getDate() + 1)
                break
              case 'thisWeek': {
                const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay()
                start.setDate(start.getDate() - (dayOfWeek - 1))
                end.setDate(start.getDate() + 6)
                break
              }
              case 'nextWeek': {
                const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay()
                start.setDate(start.getDate() - (dayOfWeek - 1) + 7)
                end.setTime(start.getTime())
                end.setDate(end.getDate() + 6)
                break
              }
              case 'thisMonth':
                start.setDate(1)
                end.setMonth(start.getMonth() + 1, 0)
                break
              case 'next30':
                end.setDate(end.getDate() + 30)
                break
              default:
                break
            }
            return format(currentStart, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd') &&
              format(currentEnd, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
          })()

          return (
            <button
              key={preset}
              type='button'
              style={dateButtonStyle(isActive)}
              onClick={() => handleDatePreset(preset)}
            >
              {labelMap[preset]}
            </button>
          )
        })}
        <button
          type='button'
          style={quickButtonStyle(includePastDue)}
          onClick={() => setIncludePastDue((prev) => !prev)}
        >
          {includePastDue ? 'Past Due Included' : 'Include Past Due'}
        </button>
        {(dateFilterStart || dateFilterEnd) && (
          <button
            type='button'
            style={dateButtonStyle(false)}
            onClick={() => { setDateFilterStart(''); setDateFilterEnd(''); setIncludePastDue(false) }}
          >
            Clear Dates
          </button>
        )}
      </div>
      {/* Filter Panel */}
      {showFilters && (
        <div className="card" style={{ marginBottom: '2rem', backgroundColor: '#f9fafb' }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  <X size={16} />
                  Clear All
                </button>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {/* Workcenter Filter */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                  Workcenter (Ordline Status)
                </label>
                <div style={{ 
                  maxHeight: '200px', 
                  overflowY: 'auto', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '6px',
                  padding: '0.5rem',
                  backgroundColor: 'white'
                }}>
                  {uniqueWorkcenters.length === 0 ? (
                    <div style={{ padding: '0.5rem', color: '#6c757d', fontSize: '0.85rem' }}>No workcenters available</div>
                  ) : (
                    uniqueWorkcenters.map(wc => (
                      <label
                        key={wc}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWorkcenters.includes(wc)}
                          onChange={() => toggleWorkcenter(wc)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.9rem' }}>{wc}</span>
                      </label>
                    ))
                  )}
                </div>
                {selectedWorkcenters.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                    {selectedWorkcenters.length} of {uniqueWorkcenters.length} selected
                  </div>
                )}
              </div>

              {/* Production Status Filter */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                  Production Status
                </label>
                <div style={{ 
                  maxHeight: '200px', 
                  overflowY: 'auto', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '6px',
                  padding: '0.5rem',
                  backgroundColor: 'white'
                }}>
                  {uniqueProdStatuses.length === 0 ? (
                    <div style={{ padding: '0.5rem', color: '#6c757d', fontSize: '0.85rem' }}>No statuses available</div>
                  ) : (
                    uniqueProdStatuses.map(status => (
                      <label
                        key={status}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProdStatuses.includes(status)}
                          onChange={() => toggleProdStatus(status)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ 
                          fontSize: '0.9rem',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: getStatusColor(status) + '20',
                          color: getStatusColor(status),
                          border: `1px solid ${getStatusColor(status)}`,
                          fontWeight: 500
                        }}>
                          {status}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedProdStatuses.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                    {selectedProdStatuses.length} of {uniqueProdStatuses.length} selected
                  </div>
                )}
              </div>

              {/* Date Range Filter */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                  Date Range
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: '#6c757d' }}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={dateFilterStart}
                      onChange={(e) => setDateFilterStart(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', color: '#6c757d' }}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={dateFilterEnd}
                      onChange={(e) => setDateFilterEnd(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  {(dateFilterStart || dateFilterEnd) && (
                    <button
                      onClick={() => {
                        setDateFilterStart('')
                        setDateFilterEnd('')
                      }}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
                    >
                      <X size={14} />
                      Clear Dates
                    </button>
                  )}
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                backgroundColor: '#eff6ff', 
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#1e40af'
              }}>
                <strong>Active Filters:</strong> Showing {filteredWorkcenters.length} workcenter{filteredWorkcenters.length !== 1 ? 's' : ''} with{' '}
                {filteredWorkcenters.reduce((sum, wc) => sum + wc.jobs.length, 0)} job{filteredWorkcenters.reduce((sum, wc) => sum + wc.jobs.length, 0) !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {filteredWorkcenters.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <Package size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
            <p style={{ color: '#6c757d' }}>
              {hasActiveFilters 
                ? 'No jobs match the selected filters. Try adjusting your filters.' 
                : 'No schedule data available'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredWorkcenters.map((workcenter, wcIdx) => {
            const accentColor = getWorkcenterAccent(workcenter.name)
            const accentBorderColor = accentColor === '#ffffff' ? '#d1d5db' : accentColor
            const sectionBackground = getWorkcenterBackground(workcenter.name)

            return (
              <div
                key={wcIdx}
                className="card"
                style={{
                  borderLeft: `6px solid ${accentBorderColor}`,
                  boxShadow: '0 2px 6px rgba(15,23,42,0.08)',
                  background: sectionBackground
                }}
              >
                <div
                  className="card-body"
                  style={{
                    padding: '0.9rem 1rem 1.1rem',
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: '10px'
                  }}
                >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                    marginBottom: '0.85rem',
                    paddingBottom: '0.7rem',
                    borderBottom: `1px solid ${hexToRgba(accentBorderColor, 0.5)}`
                }}>
                  <div>
                    <h2 style={{ 
                      margin: 0, 
                        fontSize: '1.25rem',
                      fontWeight: 600,
                        color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                        gap: '0.4rem'
                    }}>
                        <MapPin size={22} style={{ color: accentBorderColor }} />
                      {workcenter.name}
                    </h2>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#475569', fontSize: '0.8rem' }}>
                      {workcenter.jobs.length} job{workcenter.jobs.length !== 1 ? 's' : ''} scheduled
                    </p>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                      gap: '0.75rem',
                    alignItems: 'center',
                      fontSize: '0.8rem',
                      color: '#64748b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={15} />
                      <span>
                        {workcenter.jobs.reduce((sum, job) => sum + (parseFloat(job.hours) || 0), 0).toFixed(1)} hrs
                      </span>
                    </div>
                  </div>
                </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {workcenter.jobs.map((job, jobIdx) => {
                    const daysDiff = job.startDate && job.endDate 
                      ? differenceInDays(job.endDate, job.startDate) + 1 
                      : 0
                    
                    return (
                      <div
                        key={jobIdx}
                        style={{
                            padding: '0.65rem 0.75rem',
                            backgroundColor: '#ffffff',
                          borderRadius: '8px',
                            border: `1px solid ${hexToRgba(accentBorderColor, 0.4)}`,
                            borderLeft: `5px solid ${getStatusColor(job.prodStatus)}`,
                          transition: 'all 0.2s',
                            display: 'grid',
                            gap: '0.5rem',
                            touchAction: 'manipulation'
                        }}
                      >
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, auto)', gap: '0.6rem', alignItems: 'flex-start' }}>
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
                                {job.order}.{job.line}
                              </span>
                              {job.priority > 0 && (
                                <span style={{
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '999px',
                                    fontSize: '0.65rem',
                                  fontWeight: 600,
                                    backgroundColor: `${getPriorityColor(job.priority)}26`,
                                  color: getPriorityColor(job.priority),
                                    border: `1px solid ${hexToRgba(getPriorityColor(job.priority), 0.45)}`
                                }}>
                                  Priority {job.priority}
                                </span>
                              )}
                              {job.buildOrder !== null && (
                                <span style={{
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '999px',
                                    fontSize: '0.65rem',
                                  fontWeight: 600,
                                    backgroundColor: '#2563eb1f',
                                    color: '#1d4ed8',
                                    border: '1px solid rgba(37,99,235,0.35)'
                                }}>
                                    Build {job.buildOrder}
                                </span>
                              )}
                            </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#4b5563' }}>
                                  <Package size={12} />
                                  <span>{job.part}</span>
                              </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#4b5563' }}>
                                  <Wrench size={12} />
                                  <span>{job.operation}</span>
                              </div>
                            </div>

                            {job.notes && (
                              <div style={{ 
                                display: 'flex', 
                                  gap: '0.3rem',
                                  fontSize: '0.72rem',
                                  color: '#6b7280',
                                  backgroundColor: '#f8fafc',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.5rem'
                              }}>
                                  <FileText size={12} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                                <span>{job.notes}</span>
                              </div>
                            )}
                          </div>

                            <div style={{ display: 'grid', justifyItems: 'end', gap: '0.25rem' }}>
                            {job.startDate && job.endDate && (
                                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#475569' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                    <Calendar size={12} />
                                    <span>{format(job.startDate, 'MMM d')} - {format(job.endDate, 'MMM d')}</span>
                                </div>
                                  <div style={{ fontSize: '0.68rem', marginTop: '0.08rem', color: '#64748b' }}>
                                  {daysDiff} day{daysDiff !== 1 ? 's' : ''}
                                </div>
                              </div>
                            )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', color: '#1f2937' }}>
                                <Clock size={12} />
                                <span><strong>{parseFloat(job.hours || 0).toFixed(1)}</strong> hrs</span>
                            </div>
                            {job.prodStatus && (
                              <span style={{
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '999px',
                                  fontSize: '0.65rem',
                                fontWeight: 600,
                                  backgroundColor: `${getStatusColor(job.prodStatus)}26`,
                                color: getStatusColor(job.prodStatus),
                                  border: `1px solid ${hexToRgba(getStatusColor(job.prodStatus), 0.45)}`
                              }}>
                                {job.prodStatus}
                              </span>
                            )}
                            {job.currentLocation && job.currentLocation !== workcenter.name && (
                                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                Current: {job.currentLocation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

