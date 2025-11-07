import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWireHarnessSchedule } from '../api'
import { Calendar, Clock, Package, AlertCircle, RefreshCw, Loader2, TrendingUp, MapPin, Wrench, FileText } from 'lucide-react'
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, differenceInDays } from 'date-fns'

export default function WireHarnessSchedule() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

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
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scheduleData])

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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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

      {workcenters.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <Package size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
            <p style={{ color: '#6c757d' }}>No schedule data available</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {workcenters.map((workcenter, wcIdx) => (
            <div key={wcIdx} className="card" style={{ 
              borderLeft: '4px solid #3b82f6',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div className="card-body">
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                  paddingBottom: '1rem',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <div>
                    <h2 style={{ 
                      margin: 0, 
                      fontSize: '1.5rem', 
                      fontWeight: 600,
                      color: '#1f2937',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <MapPin size={24} style={{ color: '#3b82f6' }} />
                      {workcenter.name}
                    </h2>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#6c757d', fontSize: '0.9rem' }}>
                      {workcenter.jobs.length} job{workcenter.jobs.length !== 1 ? 's' : ''} scheduled
                    </p>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    alignItems: 'center',
                    fontSize: '0.9rem',
                    color: '#6c757d'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={16} />
                      <span>
                        {workcenter.jobs.reduce((sum, job) => sum + (parseFloat(job.hours) || 0), 0).toFixed(1)} hrs
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {workcenter.jobs.map((job, jobIdx) => {
                    const daysDiff = job.startDate && job.endDate 
                      ? differenceInDays(job.endDate, job.startDate) + 1 
                      : 0
                    
                    return (
                      <div
                        key={jobIdx}
                        style={{
                          padding: '1rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          borderLeft: `4px solid ${getStatusColor(job.prodStatus)}`,
                          transition: 'all 0.2s',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f3f4f6'
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9fafb'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ 
                                fontWeight: 600, 
                                fontSize: '1.1rem',
                                color: '#1f2937'
                              }}>
                                {job.order}.{job.line}
                              </span>
                              {job.priority > 0 && (
                                <span style={{
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  backgroundColor: getPriorityColor(job.priority) + '20',
                                  color: getPriorityColor(job.priority),
                                  border: `1px solid ${getPriorityColor(job.priority)}`
                                }}>
                                  Priority {job.priority}
                                </span>
                              )}
                              {job.buildOrder !== null && (
                                <span style={{
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  backgroundColor: '#3b82f6' + '20',
                                  color: '#3b82f6',
                                  border: '1px solid #3b82f6'
                                }}>
                                  Build Order: {job.buildOrder}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', color: '#6c757d' }}>
                                <Package size={14} />
                                <span><strong>Part:</strong> {job.part}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', color: '#6c757d' }}>
                                <Wrench size={14} />
                                <span><strong>Operation:</strong> {job.operation}</span>
                              </div>
                            </div>
                            {job.notes && (
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'flex-start', 
                                gap: '0.25rem', 
                                fontSize: '0.85rem', 
                                color: '#6c757d',
                                marginTop: '0.5rem',
                                fontStyle: 'italic'
                              }}>
                                <FileText size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>{job.notes}</span>
                              </div>
                            )}
                          </div>
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'flex-end',
                            gap: '0.25rem',
                            minWidth: '200px'
                          }}>
                            {job.startDate && job.endDate && (
                              <div style={{ 
                                textAlign: 'right',
                                fontSize: '0.85rem',
                                color: '#6c757d'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                  <Calendar size={14} />
                                  <span>
                                    {format(job.startDate, 'MMM d')} - {format(job.endDate, 'MMM d')}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                                  {daysDiff} day{daysDiff !== 1 ? 's' : ''}
                                </div>
                              </div>
                            )}
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.25rem',
                              fontSize: '0.85rem',
                              color: '#6c757d'
                            }}>
                              <Clock size={14} />
                              <span><strong>{parseFloat(job.hours || 0).toFixed(2)}</strong> hrs</span>
                            </div>
                            {job.prodStatus && (
                              <span style={{
                                padding: '0.125rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: getStatusColor(job.prodStatus) + '20',
                                color: getStatusColor(job.prodStatus),
                                border: `1px solid ${getStatusColor(job.prodStatus)}`,
                                marginTop: '0.25rem'
                              }}>
                                {job.prodStatus}
                              </span>
                            )}
                            {job.currentLocation && job.currentLocation !== workcenter.name && (
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: '#9ca3af',
                                marginTop: '0.25rem'
                              }}>
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
          ))}
        </div>
      )}
    </div>
  )
}

