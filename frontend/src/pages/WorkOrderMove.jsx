import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWireHarnessSchedule, getCetecOrdlineStatuses, getCetecLocationMaps, moveOrdlineToLocation } from '../api'
import { Calendar, Package, RefreshCw, Loader2, MapPin, CheckCircle2, AlertCircle, Filter, X, ChevronDown } from 'lucide-react'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'

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

const hexToRgba = (hex, alpha = 0.18) => {
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

const getWorkcenterBackground = (name) => hexToRgba(WORKCENTER_COLOR_MAP[name], 0.18) || '#f5f5f5'

const parseDateValue = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const parsed = parseISO(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

export default function WorkOrderMove() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [selectedWorkcenters, setSelectedWorkcenters] = useState([...PREFERRED_WIRE_HARNESS_WORKCENTERS])
  const [openDropdowns, setOpenDropdowns] = useState({})
  const [movingWo, setMovingWo] = useState(null)
  const queryClient = useQueryClient()

  // Fetch work orders
  const { data: scheduleData, isLoading, error, refetch } = useQuery({
    queryKey: ['wireHarnessScheduleForMove'],
    queryFn: async () => {
      const response = await getWireHarnessSchedule('300')
      setLastRefresh(new Date())
      return response.data || response
    },
    refetchInterval: autoRefresh ? 5 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
    retry: 2,
  })

  // Fetch available WH locations (ordline statuses)
  const { data: ordlineStatuses, isLoading: loadingStatuses } = useQuery({
    queryKey: ['ordlineStatuses'],
    queryFn: async () => {
      const response = await getCetecOrdlineStatuses()
      // Filter to only WH locations
      const allStatuses = Array.isArray(response.data) ? response.data : (response.data?.data || [])
      return allStatuses.filter(status => {
        const name = (status.description || status.name || '').toUpperCase()
        return name.startsWith('WH ')
      }).sort((a, b) => {
        const nameA = (a.description || a.name || '').toUpperCase()
        const nameB = (b.description || b.name || '').toUpperCase()
        return nameA.localeCompare(nameB)
      })
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })

  // Process work orders
  const workorders = useMemo(() => {
    if (!scheduleData?.results?.[0]?.data?.data?.rows) return []

    const rows = scheduleData.results[0].data.data.rows
    const cols = scheduleData.results[0].data.data.cols || []

    const colMap = {}
    
    // Debug: log all columns to help identify the current location field
    if (cols.length > 0 && process.env.NODE_ENV === 'development') {
      console.log('Available columns:', cols.map((col, idx) => ({
        idx,
        display_name: col.display_name,
        name: col.name,
        base_type: col.base_type
      })))
    }
    
    cols.forEach((col, idx) => {
      const displayName = (col.display_name || '').toLowerCase()
      const name = (col.name || '').toLowerCase()
      const combined = `${displayName} ${name}`

      // Ordline ID
      if ((displayName.includes('ordline') || displayName.includes('line')) && name.includes('id') && colMap.ordlineId === undefined) {
        colMap.ordlineId = idx
      }
      // Workcenter (Scheduled Location) - first description field
      else if ((displayName.includes('scheduled location') || displayName.includes('ordline status') || 
               (name.includes('description') && !displayName.includes('current'))) && colMap.workcenter === undefined) {
        colMap.workcenter = idx
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
      // Current Location - look for explicit current location field or work_location
      else if (displayName.includes('current location') || 
               displayName.includes('work location') ||
               name === 'work_location' ||
               (name.includes('description') && colMap.workcenter !== undefined && colMap.currentLocation === undefined && displayName.includes('current'))) {
        colMap.currentLocation = idx
      }
      // Production Status
      else if (combined.includes('production status') || combined.includes('prod status') || 
               (name === 'name_2' || name === 'name')) {
        if (colMap.prodStatus === undefined) colMap.prodStatus = idx
      }
    })
    
    // Debug: log the column mapping
    if (process.env.NODE_ENV === 'development') {
      console.log('Column mapping:', colMap)
    }

    return rows.map(row => {
      const workcenter = row[colMap.workcenter] || 'Unknown'
      const currentLocation = row[colMap.currentLocation] || workcenter
      
      return {
        ordlineId: row[colMap.ordlineId],
        orderNumber: row[colMap.order] || '',
        lineNumber: row[colMap.line] || '',
        part: row[colMap.part] || '',
        workcenter: workcenter,
        currentLocation: currentLocation,
        prodStatus: row[colMap.prodStatus] || '',
        rawRow: row,
        colMap: colMap // Include for debugging
      }
    }).filter(wo => wo.ordlineId)
  }, [scheduleData])

  // Group by current location (not scheduled workcenter)
  const workcenters = useMemo(() => {
    const grouped = {}
    workorders.forEach(wo => {
      // Use current location for grouping, fallback to workcenter if not available
      const location = wo.currentLocation || wo.workcenter || 'Unknown'
      if (!grouped[location]) {
        grouped[location] = {
          name: location,
          workorders: []
        }
      }
      grouped[location].workorders.push(wo)
    })

    return Object.values(grouped)
      .map(wc => ({
        ...wc,
        workorders: wc.workorders.sort((a, b) => {
          if (a.orderNumber && b.orderNumber) {
            return a.orderNumber.localeCompare(b.orderNumber)
          }
          return 0
        })
      }))
      .filter(wc => selectedWorkcenters.includes(wc.name))
      .sort((a, b) => {
        const orderA = PREFERRED_WIRE_HARNESS_WORKCENTERS.indexOf(a.name)
        const orderB = PREFERRED_WIRE_HARNESS_WORKCENTERS.indexOf(b.name)
        if (orderA !== -1 && orderB !== -1) return orderA - orderB
        if (orderA !== -1) return -1
        if (orderB !== -1) return 1
        return a.name.localeCompare(b.name)
      })
  }, [workorders, selectedWorkcenters])

  // Move work order mutation
  const moveMutation = useMutation({
    mutationFn: async ({ ordlineId, locationId, ordlineMapId, completeSchedule, userId }) => {
      return await moveOrdlineToLocation(ordlineId, { locationId, ordlineMapId, completeSchedule, userId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['wireHarnessScheduleForMove'])
      setOpenDropdowns({})
      setMovingWo(null)
    },
    onError: (error) => {
      console.error('Move failed:', error)
      alert(`Failed to move work order: ${error.response?.data?.detail || error.message}`)
      setMovingWo(null)
    }
  })

  const toggleDropdown = (woKey) => {
    setOpenDropdowns(prev => ({
      ...prev,
      [woKey]: !prev[woKey]
    }))
  }

  const handleMove = async (wo, locationId, locationName, completeSchedule, userId) => {
    if (!wo.ordlineId) {
      alert('Missing work order ID')
      return
    }

    // Find ordline_map_id if available (we could fetch location_maps, but for now use locationId)
    setMovingWo(wo.ordlineId)
    
    // Close dropdown
    setOpenDropdowns(prev => ({ ...prev, [getWoKey(wo)]: false }))

    await moveMutation.mutateAsync({
      ordlineId: wo.ordlineId,
      locationId: parseInt(locationId),
      completeSchedule,
      userId: parseInt(userId)
    })
  }

  const getWoKey = (wo) => `${wo.ordlineId}-${wo.orderNumber}-${wo.lineNumber}`

  if (isLoading || loadingStatuses) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', width: 48, height: 48 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <AlertCircle style={{ color: '#ef4444', width: 24, height: 24, marginBottom: '12px' }} />
        <p style={{ color: '#ef4444' }}>Error loading work orders: {error.message}</p>
        <button onClick={() => refetch()} style={{ marginTop: '12px', padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>Work Order Movement</h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Move work orders between Wire Harness locations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            Auto-refresh
          </label>
          <button
            onClick={() => refetch()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            <RefreshCw width={16} height={16} />
            Refresh
          </button>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Last: {format(lastRefresh, 'HH:mm:ss')}
          </div>
        </div>
      </div>

      {/* Work Centers */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {workcenters.map(wc => (
          <div
            key={wc.name}
            style={{
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                background: `linear-gradient(135deg, ${WORKCENTER_COLOR_MAP[wc.name] || '#667eea'} 0%, ${WORKCENTER_COLOR_MAP[wc.name]?.replace('#', '#') || '#764ba2'} 100%)`,
                color: 'white',
                padding: '16px 20px',
                fontWeight: 600,
                fontSize: '18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{wc.name}</span>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '12px', fontSize: '14px' }}>
                {wc.workorders.length} Work Order{wc.workorders.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              {wc.workorders.map(wo => {
                const woKey = getWoKey(wo)
                const isOpen = openDropdowns[woKey]
                const isMoving = movingWo === wo.ordlineId

                return (
                  <div
                    key={woKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 200px 1fr auto',
                      gap: '16px',
                      alignItems: 'center',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderLeft: '4px solid #3b82f6',
                      borderRadius: '6px',
                      transition: 'all 0.2s',
                      opacity: isMoving ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '16px' }}>{wo.orderNumber}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{wo.part}</div>
                    </div>
                    <div>
                      <div><strong>Line:</strong> {wo.lineNumber}</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                        <strong>Current:</strong> {wo.currentLocation}
                      </div>
                    </div>
                    <div>
                      {wo.prodStatus && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: '#dbeafe',
                            color: '#1e40af',
                            marginBottom: '4px'
                          }}
                        >
                          {wo.prodStatus}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
                        <input
                          type="checkbox"
                          id={`complete-${woKey}`}
                          defaultChecked
                          style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                        />
                        <label htmlFor={`complete-${woKey}`} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Complete entry
                        </label>
                      </div>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={() => toggleDropdown(woKey)}
                          disabled={isMoving}
                          style={{
                            padding: '8px 20px',
                            background: isMoving ? '#d1d5db' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isMoving ? 'not-allowed' : 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {isMoving ? 'Moving...' : 'Move'}
                          <ChevronDown width={14} height={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        </button>
                        {isOpen && ordlineStatuses && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '100%',
                              right: 0,
                              background: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              marginBottom: '8px',
                              minWidth: '250px',
                              maxHeight: '300px',
                              overflowY: 'auto',
                              zIndex: 10
                            }}
                          >
                            {ordlineStatuses.map(location => {
                              const locationName = location.description || location.name || 'Unknown'
                              const isCurrent = locationName.toUpperCase() === wo.currentLocation.toUpperCase()
                              const locationId = location.id || location.status_id

                              return (
                                <div
                                  key={locationId}
                                  onClick={() => {
                                    if (!isCurrent) {
                                      const checkbox = document.getElementById(`complete-${woKey}`)
                                      const completeSchedule = checkbox?.checked ?? true
                                      const user = JSON.parse(localStorage.getItem('user') || '{}')
                                      handleMove(wo, locationId, locationName, completeSchedule, user.id)
                                    }
                                  }}
                                  style={{
                                    padding: '12px 16px',
                                    cursor: isCurrent ? 'default' : 'pointer',
                                    transition: 'background 0.15s',
                                    borderBottom: '1px solid #f3f4f6',
                                    fontSize: '13px',
                                    color: isCurrent ? '#9ca3af' : '#374151',
                                    background: isCurrent ? '#f9fafb' : 'transparent',
                                    fontWeight: isCurrent ? 500 : 'normal'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isCurrent) e.currentTarget.style.background = '#f3f4f6'
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isCurrent) e.currentTarget.style.background = 'transparent'
                                  }}
                                >
                                  {locationName} {isCurrent && '(Current)'}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {workcenters.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
          <Package width={48} height={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <p style={{ fontSize: '16px' }}>No work orders found</p>
        </div>
      )}
    </div>
  )
}

