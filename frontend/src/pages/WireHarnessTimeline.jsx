import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWireHarnessSchedule, getWireHarnessScheduleDetail } from '../api'
import { 
  Calendar, Clock, Package, AlertCircle, RefreshCw, Loader2, 
  MapPin, Wrench, FileText, Filter, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut
} from 'lucide-react'
import { 
  format, parseISO, addDays, differenceInDays, differenceInMinutes, 
  startOfWeek, startOfDay, endOfDay, isWithinInterval 
} from 'date-fns'

export default function WireHarnessTimeline() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [selectedWorkcenters, setSelectedWorkcenters] = useState([])
  const [selectedProdStatuses, setSelectedProdStatuses] = useState([])
  const [dateFilterStart, setDateFilterStart] = useState('')
  const [dateFilterEnd, setDateFilterEnd] = useState('')
  const [workOrderFilter, setWorkOrderFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [zoomLevel, setZoomLevel] = useState('week') // 'day', 'week', 'month'
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)

  // Fetch schedule data - try question 984 first (detailed), fallback to dashboard 64
  const { data: scheduleDetailData, isLoading: isLoadingDetail, error: errorDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['wireHarnessScheduleDetail'],
    queryFn: async () => {
      const response = await getWireHarnessScheduleDetail('300')
      setLastRefresh(new Date())
      return response.data || response
    },
    refetchInterval: autoRefresh ? 5 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
    retry: 2,
  })

  // Fallback to dashboard 64 if question 984 fails
  const { data: scheduleData, isLoading: isLoadingFallback, error: errorFallback, refetch: refetchFallback } = useQuery({
    queryKey: ['wireHarnessSchedule'],
    queryFn: async () => {
      const response = await getWireHarnessSchedule('300')
      setLastRefresh(new Date())
      return response.data || response
    },
    enabled: !scheduleDetailData && !isLoadingDetail, // Only fetch if detail query hasn't loaded
    refetchInterval: false, // Don't auto-refresh fallback
    retry: 1,
  })

  const isLoading = isLoadingDetail || isLoadingFallback
  const error = errorDetail || errorFallback
  const activeData = scheduleDetailData || scheduleData

  const handleManualRefresh = async () => {
    if (scheduleDetailData) {
      await refetchDetail()
    } else {
      await refetchFallback()
    }
  }

  // Process and group data by workcenter - handle both question 984 and dashboard 64 formats
  const workcenters = useMemo(() => {
    // Try question 984 format first (result.data.data.rows)
    let rows = []
    let cols = []
    
    if (scheduleDetailData?.result?.data?.rows) {
      // Question 984 format
      rows = scheduleDetailData.result.data.rows
      cols = scheduleDetailData.result.data.cols || []
    } else if (scheduleData?.results?.[0]?.data?.data?.rows) {
      // Dashboard 64 format
      rows = scheduleData.results[0].data.data.rows
      cols = scheduleData.results[0].data.data.cols || []
    } else {
      return []
    }

    // Map column indices to names
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
      // Work Date (start datetime) - prioritize direct "work date" field, then min of work date
      else if (combined.includes('work date') && !combined.includes('min') && !combined.includes('max')) {
        if (colMap.startDate === undefined) colMap.startDate = idx
      }
      else if ((displayName.includes('min') || displayName.includes('start')) && 
               (combined.includes('work date') || combined.includes('date'))) {
        if (colMap.startDate === undefined) colMap.startDate = idx
      }
      // Work End (end datetime) - prioritize direct "work end" field, then max of work end
      else if (combined.includes('work end') && !combined.includes('min') && !combined.includes('max')) {
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
               (name === 'name_2' || name === 'name')) {
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

    // Group by workcenter
    const grouped = {}
    rows.forEach(row => {
      const workcenter = row[colMap.workcenter] || 'Unknown'
      // Parse work date and work end as datetimes (they should include time)
      const startDateTime = row[colMap.startDate] ? parseISO(row[colMap.startDate]) : null
      const endDateTime = row[colMap.endDate] ? parseISO(row[colMap.endDate]) : null
      
      // Extract date and time components
      const startDate = startDateTime ? startOfDay(startDateTime) : null
      const endDate = endDateTime ? startOfDay(endDateTime) : null
      const startTime = startDateTime ? startDateTime : null
      const endTime = endDateTime ? endDateTime : null

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
        if (startTime && (!existing.startDateTime || startTime < existing.startDateTime)) {
          existing.startDateTime = startTime
          existing.startDate = startDate || existing.startDate
        }
        if (endTime && (!existing.endDateTime || endTime > existing.endDateTime)) {
          existing.endDateTime = endTime
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
          order: workOrder,
          orderNumber: workOrder,
          lineItem,
          orderDisplay: workOrderDisplay,
          part: partNumber,
          operation: operationName,
          startDate, // Date only (for day filtering)
          endDate,   // Date only (for day filtering)
          startDateTime: startTime, // Full datetime with time
          endDateTime: endTime,     // Full datetime with time
          hours: hoursValue,
          currentLocation,
          prodStatus,
          notes: row[colMap.notes] || '',
          buildOrder: row[colMap.buildOrder] || null,
          priority: row[colMap.priority] || 0,
          rawRow: row,
          colMap
        }

        workcenterGroup.jobs.push(jobEntry)
        jobMap.set(jobKey, jobEntry)
      }
    })
    return Object.values(grouped)
      .map(wc => {
        const { jobMap, ...rest } = wc
        return {
          ...rest,
          jobs: rest.jobs.sort((a, b) => {
            if (a.startDate && b.startDate) {
              const dateDiff = a.startDate.getTime() - b.startDate.getTime()
              if (dateDiff !== 0) return dateDiff
            }
            if (a.buildOrder !== null && b.buildOrder !== null) {
              return a.buildOrder - b.buildOrder
            }
            return (b.priority || 0) - (a.priority || 0)
          })
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scheduleDetailData, scheduleData])

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
    
    return {
      uniqueWorkcenters: Array.from(workcentersSet).sort(),
      uniqueProdStatuses: Array.from(statusesSet).sort()
    }
  }, [workcenters, scheduleDetailData, scheduleData])

  // Apply filters
  const filteredWorkcenters = useMemo(() => {
    let filtered = workcenters

    if (selectedWorkcenters.length > 0) {
      filtered = filtered.filter(wc => selectedWorkcenters.includes(wc.name))
    }

    filtered = filtered.map(wc => ({
      ...wc,
      jobs: wc.jobs.filter(job => {
        // Work order filter
        if (workOrderFilter.trim()) {
          const searchTerm = workOrderFilter.trim().toLowerCase()
          const orderMatch = job.order?.toLowerCase().includes(searchTerm) ||
                           job.orderDisplay?.toLowerCase().includes(searchTerm) ||
                           job.part?.toLowerCase().includes(searchTerm)
          if (!orderMatch) return false
        }

        // Production status filter
        if (selectedProdStatuses.length > 0) {
          if (!job.prodStatus || !selectedProdStatuses.includes(job.prodStatus)) {
            return false
          }
        }

        // Date filter
        if (dateFilterStart || dateFilterEnd) {
          const jobStart = job.startDate ? startOfDay(job.startDate) : null
          const jobEnd = job.endDate ? endOfDay(job.endDate) : null
          const filterStart = dateFilterStart ? startOfDay(parseISO(dateFilterStart)) : null
          const filterEnd = dateFilterEnd ? endOfDay(parseISO(dateFilterEnd)) : null

          if (jobStart && jobEnd) {
            if (filterStart && filterEnd) {
              return !(jobEnd < filterStart || jobStart > filterEnd)
            } else if (filterStart) {
              return jobStart >= filterStart
            } else if (filterEnd) {
              return jobEnd <= filterEnd
            }
          } else if (filterStart || filterEnd) {
            return false
          }
        }

        return true
      })
    })).filter(wc => wc.jobs.length > 0)

    return filtered
  }, [workcenters, selectedWorkcenters, selectedProdStatuses, dateFilterStart, dateFilterEnd, workOrderFilter])

  // Calculate timeline dates based on zoom level
  const { timelineStart, timelineDays, days } = useMemo(() => {
    const today = new Date()
    let start, daysArray, totalDays

    switch (zoomLevel) {
      case 'day':
        start = addDays(today, dayOffset)
        start.setHours(0, 0, 0, 0)
        daysArray = [start]
        totalDays = 1
        break
      case 'week':
        start = addDays(startOfWeek(today), weekOffset * 7)
        start.setHours(0, 0, 0, 0)
        daysArray = Array.from({ length: 7 }, (_, i) => addDays(start, i))
        totalDays = 7
        break
      case 'month':
      default:
        start = addDays(startOfWeek(today), weekOffset * 7)
        start.setHours(0, 0, 0, 0)
        daysArray = Array.from({ length: 28 }, (_, i) => addDays(start, i))
        totalDays = 28
        break
    }

    return {
      timelineStart: start,
      timelineDays: totalDays,
      days: daysArray
    }
  }, [zoomLevel, weekOffset, dayOffset])

  // Check if a job is scheduled for a specific day
  const isJobScheduledForDay = (job, day) => {
    // Use datetime if available, otherwise fall back to date
    const jobStart = job.startDateTime ? startOfDay(job.startDateTime) : (job.startDate ? startOfDay(job.startDate) : null)
    const jobEnd = job.endDateTime ? startOfDay(job.endDateTime) : (job.endDate ? startOfDay(job.endDate) : null)
    
    if (!jobStart || !jobEnd) return false
    
    const checkDay = startOfDay(day)
    
    // Job is scheduled for this day if the day falls within the job's date range
    return checkDay >= jobStart && checkDay <= jobEnd
  }

  // Get the scheduled time range for a job on a specific day
  const getJobTimeRangeForDay = (job, day) => {
    if (!job.startDateTime || !job.endDateTime) {
      // Fallback to default work hours if no specific times
      return { start: '7:30 AM', end: '4:30 PM', startTime: null, endTime: null }
    }
    
    const jobStart = job.startDateTime
    const jobEnd = job.endDateTime
    const checkDay = startOfDay(day)
    const jobStartDay = startOfDay(jobStart)
    const jobEndDay = startOfDay(jobEnd)
    
    // If job spans multiple days, show appropriate time range for this day
    if (format(checkDay, 'yyyy-MM-dd') === format(jobStartDay, 'yyyy-MM-dd')) {
      // First day - show from job start time
      const endTime = format(checkDay, 'yyyy-MM-dd') === format(jobEndDay, 'yyyy-MM-dd') 
        ? jobEnd
        : new Date(checkDay.getTime() + (16 * 60 + 30) * 60 * 1000) // 4:30 PM
      return {
        start: format(jobStart, 'h:mm a'),
        end: format(endTime, 'h:mm a'),
        startTime: jobStart,
        endTime: endTime
      }
    } else if (format(checkDay, 'yyyy-MM-dd') === format(jobEndDay, 'yyyy-MM-dd')) {
      // Last day - show until job end time
      const startTime = new Date(checkDay.getTime() + (7 * 60 + 30) * 60 * 1000) // 7:30 AM
      return {
        start: '7:30 AM',
        end: format(jobEnd, 'h:mm a'),
        startTime: startTime,
        endTime: jobEnd
      }
    } else {
      // Middle day - show full work day
      const startTime = new Date(checkDay.getTime() + (7 * 60 + 30) * 60 * 1000) // 7:30 AM
      const endTime = new Date(checkDay.getTime() + (16 * 60 + 30) * 60 * 1000) // 4:30 PM
      return { 
        start: '7:30 AM', 
        end: '4:30 PM',
        startTime: startTime,
        endTime: endTime
      }
    }
  }

  // Calculate row assignments for all jobs in a day (for day view)
  const calculateJobRowsForDay = (allDayJobs, day) => {
    const workDayStartMinutes = 7 * 60 + 30 // 7:30 AM = 450 minutes
    const workDayEndMinutes = 16 * 60 + 30 // 4:30 PM = 990 minutes
    
    // Build list of ALL jobs with their time ranges
    const allJobsWithRanges = allDayJobs.map((j, idx) => {
      const range = getJobTimeRangeForDay(j, day)
      if (!range.startTime || !range.endTime) {
        // Jobs without times span full work day
        const fullDayStart = new Date(day.getTime() + workDayStartMinutes * 60 * 1000)
        const fullDayEnd = new Date(day.getTime() + workDayEndMinutes * 60 * 1000)
        return {
          job: j,
          index: idx,
          start: fullDayStart.getTime(),
          end: fullDayEnd.getTime(),
          hasNoTime: true
        }
      }
      return {
        job: j,
        index: idx,
        start: range.startTime.getTime(),
        end: range.endTime.getTime(),
        hasNoTime: false
      }
    })
    
    // Sort by start time, then by original index
    allJobsWithRanges.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return a.index - b.index
    })
    
    // Assign rows using greedy algorithm for ALL jobs
    const rows = []
    for (let i = 0; i < allJobsWithRanges.length; i++) {
      const jobToPlace = allJobsWithRanges[i]
      let placed = false
      
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx]
        const overlaps = row.some(existingJob => {
          return !(existingJob.end <= jobToPlace.start || existingJob.start >= jobToPlace.end)
        })
        
        if (!overlaps) {
          row.push(jobToPlace)
          placed = true
          break
        }
      }
      
      if (!placed) {
        rows.push([jobToPlace])
      }
    }
    
    // Create a map from job to row index
    const jobToRowMap = new Map()
    for (let i = 0; i < rows.length; i++) {
      for (const jobRange of rows[i]) {
        jobToRowMap.set(jobRange.job, i)
      }
    }
    
    return jobToRowMap
  }

  // Calculate row assignments for all jobs across the timeline (for week/month view)
  const calculateJobRowsForTimeline = (allJobs, timelineStart, timelineDays) => {
    const workDayStartMinutes = 7 * 60 + 30 // 7:30 AM = 450 minutes
    const workDayEndMinutes = 16 * 60 + 30 // 4:30 PM = 990 minutes
    
    // Build list of ALL jobs with their time ranges across the timeline
    const allJobsWithRanges = allJobs.map((j, idx) => {
      if (!j.startDateTime || !j.endDateTime) {
        // Jobs without times - use date range
        if (!j.startDate || !j.endDate) return null
        
        const jobStart = startOfDay(j.startDate)
        const jobEnd = endOfDay(j.endDate)
        
        // For jobs without times, span full work days
        const firstDayStart = new Date(jobStart.getTime() + workDayStartMinutes * 60 * 1000)
        const lastDayEnd = new Date(jobEnd.getTime() + workDayEndMinutes * 60 * 1000)
        
        return {
          job: j,
          index: idx,
          start: firstDayStart.getTime(),
          end: lastDayEnd.getTime(),
          hasNoTime: true
        }
      }
      
      // Jobs with specific times
      return {
        job: j,
        index: idx,
        start: j.startDateTime.getTime(),
        end: j.endDateTime.getTime(),
        hasNoTime: false
      }
    }).filter(j => j !== null)
    
    // Sort by start time, then by original index
    allJobsWithRanges.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return a.index - b.index
    })
    
    // Assign rows using greedy algorithm for ALL jobs
    const rows = []
    for (let i = 0; i < allJobsWithRanges.length; i++) {
      const jobToPlace = allJobsWithRanges[i]
      let placed = false
      
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx]
        const overlaps = row.some(existingJob => {
          return !(existingJob.end <= jobToPlace.start || existingJob.start >= jobToPlace.end)
        })
        
        if (!overlaps) {
          row.push(jobToPlace)
          placed = true
          break
        }
      }
      
      if (!placed) {
        rows.push([jobToPlace])
      }
    }
    
    // Create a map from job to row index
    const jobToRowMap = new Map()
    for (let i = 0; i < rows.length; i++) {
      for (const jobRange of rows[i]) {
        jobToRowMap.set(jobRange.job, i)
      }
    }
    
    return jobToRowMap
  }

  // Calculate position for a job across the timeline (for week/month view)
  const getJobPositionForTimeline = (job, timelineStart, timelineDays, jobToRowMap, jobIndex) => {
    const workDayStartMinutes = 7 * 60 + 30 // 7:30 AM = 450 minutes
    const workDayEndMinutes = 16 * 60 + 30 // 4:30 PM = 990 minutes
    
    // Get row index
    const rowIndex = jobToRowMap.get(job) ?? jobIndex
    
    if (!job.startDateTime || !job.endDateTime) {
      // Jobs without times - use date range
      if (!job.startDate || !job.endDate) {
        return {
          left: '0%',
          width: '100%',
          top: `${rowIndex * 28}px`,
          zIndex: 2
        }
      }
      
      const jobStart = startOfDay(job.startDate)
      const jobEnd = endOfDay(job.endDate)
      const timelineStartDay = startOfDay(timelineStart)
      
      const startDiff = differenceInDays(jobStart, timelineStartDay)
      const duration = differenceInDays(jobEnd, jobStart) + 1
      
      // Each day is 1/timelineDays of the width
      const leftPercent = (startDiff / timelineDays) * 100
      const widthPercent = (duration / timelineDays) * 100
      
      return {
        left: `${Math.max(0, leftPercent)}%`,
        width: `${Math.min(100, widthPercent)}%`,
        top: `${rowIndex * 28}px`,
        zIndex: 2
      }
    }
    
    // Jobs with specific times
    const jobStart = job.startDateTime
    const jobEnd = job.endDateTime
    const timelineStartDay = startOfDay(timelineStart)
    
    // Calculate position relative to timeline start
    const totalMinutes = timelineDays * 24 * 60 // Total minutes in timeline
    const startMinutes = differenceInMinutes(jobStart, timelineStartDay)
    const durationMinutes = differenceInMinutes(jobEnd, jobStart)
    
    const leftPercent = (startMinutes / totalMinutes) * 100
    const widthPercent = (durationMinutes / totalMinutes) * 100
    
    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `${Math.min(100, widthPercent)}%`,
      top: `${rowIndex * 28}px`,
      zIndex: 2
    }
  }

  // Calculate position and dimensions for a job block within a day
  const getJobPositionInDay = (job, day, allDayJobs, jobIndex, jobToRowMap) => {
    const timeRange = getJobTimeRangeForDay(job, day)
    
    // Work day: 7:30 AM (7.5 hours = 450 minutes from midnight) to 4:30 PM (16.5 hours = 990 minutes)
    const workDayStartMinutes = 7 * 60 + 30 // 7:30 AM = 450 minutes
    const workDayEndMinutes = 16 * 60 + 30 // 4:30 PM = 990 minutes
    const workDayDurationMinutes = workDayEndMinutes - workDayStartMinutes // 540 minutes (9 hours)
    
    // Get row index from the pre-calculated map
    const rowIndex = jobToRowMap.get(job) ?? jobIndex
    
    // Handle jobs without specific times - they take full day
    if (!timeRange.startTime || !timeRange.endTime) {
      return {
        left: '0%',
        width: '100%',
        top: `${rowIndex * 28}px`,
        zIndex: 2
      }
    }
    
    // Jobs with specific times
    const jobStartMinutes = timeRange.startTime.getHours() * 60 + timeRange.startTime.getMinutes()
    const jobEndMinutes = timeRange.endTime.getHours() * 60 + timeRange.endTime.getMinutes()
    
    // Position relative to work day start
    const jobStartOffset = Math.max(0, jobStartMinutes - workDayStartMinutes)
    const jobDuration = Math.min(workDayDurationMinutes, jobEndMinutes - workDayStartMinutes) - jobStartOffset
    
    const leftPercent = (jobStartOffset / workDayDurationMinutes) * 100
    const widthPercent = (jobDuration / workDayDurationMinutes) * 100
    
    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `${Math.min(100, widthPercent)}%`,
      top: `${rowIndex * 28}px`, // 28px per row (22px height + 6px gap)
      zIndex: 2
    }
  }

  // Get jobs scheduled for a specific day and workcenter
  const getJobsForDay = (workcenter, day) => {
    return workcenter.jobs.filter(job => isJobScheduledForDay(job, day))
  }

  const hasActiveFilters = selectedWorkcenters.length > 0 || 
                          selectedProdStatuses.length > 0 || 
                          dateFilterStart || 
                          dateFilterEnd ||
                          workOrderFilter.trim()

  const clearFilters = () => {
    setSelectedWorkcenters([])
    setSelectedProdStatuses([])
    setDateFilterStart('')
    setDateFilterEnd('')
    setWorkOrderFilter('')
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

  const navigateTimeline = (direction) => {
    if (zoomLevel === 'day') {
      setDayOffset(prev => prev + direction)
    } else {
      setWeekOffset(prev => prev + direction)
    }
  }

  if (isLoading && !scheduleData) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Wire Harness Timeline</h1>
            <p className="page-description">Visual timeline schedule for Wire Harness Department (Prodline 300)</p>
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
            <h1 className="page-title">Wire Harness Timeline</h1>
            <p className="page-description">Visual timeline schedule for Wire Harness Department (Prodline 300)</p>
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
          <h1 className="page-title">Wire Harness Timeline</h1>
          <p className="page-description">Visual timeline schedule for Wire Harness Department (Prodline 300)</p>
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
                {[selectedWorkcenters.length, selectedProdStatuses.length, dateFilterStart ? 1 : 0, dateFilterEnd ? 1 : 0, workOrderFilter.trim() ? 1 : 0].reduce((a, b) => a + b, 0)}
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
              {/* Work Order Number Filter */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                  Work Order Number
                </label>
                <input
                  type="text"
                  value={workOrderFilter}
                  onChange={(e) => setWorkOrderFilter(e.target.value)}
                  placeholder="e.g., 14546.1 or 14546"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
                <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#6c757d' }}>
                  Search by order number, line item, or part number
                </div>
              </div>

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

      {/* Timeline Controls */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => navigateTimeline(-1)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem' }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => navigateTimeline(1)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem' }}
              >
                <ChevronRight size={18} />
              </button>
              <div style={{ marginLeft: '1rem', fontSize: '0.9rem', fontWeight: 500 }}>
                {zoomLevel === 'day' 
                  ? format(timelineStart, 'EEEE, MMMM d, yyyy')
                  : zoomLevel === 'week'
                  ? `${format(days[0], 'MMM d')} - ${format(days[days.length - 1], 'MMM d, yyyy')}`
                  : `${format(days[0], 'MMM d')} - ${format(days[days.length - 1], 'MMM d, yyyy')}`
                }
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                onClick={() => setZoomLevel('day')}
                className={`btn ${zoomLevel === 'day' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                Day
              </button>
              <button
                onClick={() => setZoomLevel('week')}
                className={`btn ${zoomLevel === 'week' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                Week
              </button>
              <button
                onClick={() => setZoomLevel('month')}
                className={`btn ${zoomLevel === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline View */}
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
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {/* Timeline Header */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
              borderBottom: '2px solid #e5e7eb',
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              zIndex: 10
            }}>
              <div style={{ 
                padding: '1rem',
                borderRight: '2px solid #e5e7eb',
                fontWeight: 600,
                backgroundColor: '#f9fafb'
              }}>
                Workcenter
              </div>
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: `repeat(${timelineDays}, 1fr)`,
                borderBottom: '1px solid #e5e7eb'
              }}>
                {days.map((day, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.75rem 0.5rem',
                      textAlign: 'center',
                      borderRight: idx < days.length - 1 ? '1px solid #e5e7eb' : 'none',
                      backgroundColor: idx === 0 && zoomLevel === 'day' ? '#eff6ff' : 'white',
                      fontWeight: idx === 0 ? 600 : 400
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {format(day, 'EEE')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '0.25rem' }}>
                      {format(day, 'MMM d')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline Rows */}
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {filteredWorkcenters.map((workcenter, wcIdx) => (
                <div
                  key={wcIdx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '200px 1fr',
                    borderBottom: '1px solid #e5e7eb',
                    minHeight: '80px',
                    position: 'relative'
                  }}
                >
                  {/* Workcenter Name */}
                  <div style={{
                    padding: '1rem',
                    borderRight: '2px solid #e5e7eb',
                    backgroundColor: '#f9fafb',
                    display: 'flex',
                    alignItems: 'center',
                    position: 'sticky',
                    left: 0,
                    zIndex: 5
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                        {workcenter.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                        {workcenter.jobs.length} job{workcenter.jobs.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Timeline Track - Different rendering for day vs week/month view */}
                  {zoomLevel === 'day' ? (
                    // Day view: Show jobs per day with hourly positioning
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${timelineDays}, 1fr)`,
                      position: 'relative',
                      minHeight: '80px',
                      backgroundColor: '#fafafa'
                    }}>
                      {days.map((day, dayIdx) => {
                      const dayJobs = getJobsForDay(workcenter, day)
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6
                      const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                      
                      // Sort jobs by start time for proper stacking
                      const sortedDayJobs = [...dayJobs].sort((a, b) => {
                        const aRange = getJobTimeRangeForDay(a, day)
                        const bRange = getJobTimeRangeForDay(b, day)
                        if (!aRange.startTime || !bRange.startTime) return 0
                        return aRange.startTime.getTime() - bRange.startTime.getTime()
                      })
                      
                      return (
                        <div
                          key={dayIdx}
                          style={{
                            position: 'relative',
                            borderRight: dayIdx < days.length - 1 ? '1px solid #e5e7eb' : 'none',
                            borderLeft: dayIdx === 0 ? '2px solid #3b82f6' : 'none',
                            backgroundColor: isToday ? '#eff6ff' : isWeekend ? '#f9fafb' : 'white',
                            minHeight: '120px',
                            padding: '0.25rem'
                          }}
                        >
                          {/* Time scale (hour markers) */}
                          {zoomLevel === 'day' && (
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              height: '20px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '0 0.25rem',
                              fontSize: '0.6rem',
                              color: '#6c757d',
                              borderBottom: '1px solid #e5e7eb',
                              backgroundColor: 'rgba(249, 250, 251, 0.8)',
                              zIndex: 1
                            }}>
                              {[8, 10, 12, 14, 16].map(hour => (
                                <span key={hour} style={{ 
                                  position: 'absolute',
                                  left: `${((hour * 60 - 450) / 540) * 100}%` // 450 = 7:30 AM in minutes, 540 = 9 hours
                                }}>
                                  {hour}:00
                                </span>
                              ))}
                            </div>
                          )}
                          
                          {/* Job Blocks for this day - positioned by time */}
                          {sortedDayJobs.length === 0 ? (
                            <div style={{ 
                              fontSize: '0.7rem', 
                              color: '#9ca3af', 
                              textAlign: 'center',
                              paddingTop: '2rem'
                            }}>
                              {isWeekend ? 'Weekend' : ''}
                            </div>
                          ) : (() => {
                            // Calculate row assignments once for all jobs in this day
                            const jobToRowMap = calculateJobRowsForDay(sortedDayJobs, day)
                            const rowValues = Array.from(jobToRowMap.values())
                            const maxRow = rowValues.length > 0 ? Math.max(...rowValues) : -1
                            
                            return (
                              <div style={{ 
                                position: 'relative', 
                                marginTop: zoomLevel === 'day' ? '20px' : '0',
                                minHeight: `${Math.max(100, (maxRow + 1) * 28 + 20)}px` // Dynamic height based on actual rows needed
                              }}>
                                {sortedDayJobs.map((job, jobIdx) => {
                                  const jobKey = `${job.orderDisplay}-${job.operation}-${dayIdx}`
                                  const position = getJobPositionInDay(job, day, sortedDayJobs, jobIdx, jobToRowMap)
                                  const timeRange = getJobTimeRangeForDay(job, day)
                                  const blockWidth = Math.max(0, parseFloat(position.width.replace('%', '')) || 0)

                                  return (
                                    <div
                                      key={jobKey}
                                      style={{
                                        position: 'absolute',
                                        left: position.left,
                                        width: position.width,
                                        top: position.top,
                                        height: '22px',
                                        zIndex: position.zIndex || 2,
                                        minWidth: '40px'
                                      }}
                                    >
                                    <div
                                      style={{
                                        height: '100%',
                                        backgroundColor: getStatusColor(job.prodStatus),
                                        color: 'white',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.4rem',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        border: '1px solid rgba(0,0,0,0.1)',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        overflow: 'hidden'
                                      }}
                                      title={`${job.orderDisplay} - ${job.part}
Build Operation: ${job.operation || 'N/A'}
Ordline Status: ${job.currentLocation || 'N/A'}
Status: ${job.prodStatus || 'N/A'}
Hours: ${parseFloat(job.hours || 0).toFixed(2)}h
${job.startDateTime ? `Start: ${format(job.startDateTime, 'MMM d, yyyy h:mm a')}` : (job.startDate ? `Start: ${format(job.startDate, 'MMM d, yyyy')}` : '')}
${job.endDateTime ? `End: ${format(job.endDateTime, 'MMM d, yyyy h:mm a')}` : (job.endDate ? `End: ${format(job.endDate, 'MMM d, yyyy')}` : '')}
${job.notes ? `Notes: ${job.notes}` : ''}
${timeRange.start && timeRange.end ? `Scheduled: ${timeRange.start} - ${timeRange.end}` : 'Work Hours: 7:30 AM - 4:30 PM'}`}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.05)'
                                        e.currentTarget.style.zIndex = '10'
                                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)'
                                        e.currentTarget.style.zIndex = position.zIndex
                                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                                      }}
                                    >
                                      <div style={{ 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis', 
                                        whiteSpace: 'nowrap',
                                        flex: 1
                                      }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>
                                          {job.orderDisplay}
                                        </div>
                                        {job.operation && blockWidth > 15 && (
                                          <div style={{ fontSize: '0.6rem', opacity: 0.9, marginTop: '0.05rem' }}>
                                            {job.operation}
                                          </div>
                                        )}
                                      {job.currentLocation && blockWidth > 30 && (
                                          <div style={{ fontSize: '0.55rem', opacity: 0.75, marginTop: '0.05rem' }}>
                                            {job.currentLocation}
                                          </div>
                                        )}
                                      </div>
                                      {blockWidth > 20 && (
                                        <div style={{ 
                                          fontSize: '0.6rem', 
                                          opacity: 0.9,
                                          marginLeft: '0.25rem',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {timeRange.start}-{timeRange.end}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                    </div>
                  ) : (
                    // Week/Month view: Show jobs as continuous blocks across timeline
                    (() => {
                      // Get all jobs that appear in the timeline
                      const allTimelineJobs = workcenter.jobs.filter(job => {
                        const jobStart = job.startDateTime ? startOfDay(job.startDateTime) : (job.startDate ? startOfDay(job.startDate) : null)
                        const jobEnd = job.endDateTime ? startOfDay(job.endDateTime) : (job.endDate ? startOfDay(job.endDate) : null)
                        if (!jobStart || !jobEnd) return false
                        
                        const timelineEnd = addDays(timelineStart, timelineDays - 1)
                        return !(jobEnd < timelineStart || jobStart > timelineEnd)
                      })
                      
                      // Calculate row assignments across all jobs in the timeline
                      const jobToRowMap = calculateJobRowsForTimeline(allTimelineJobs, timelineStart, timelineDays)
                      const rowValues = Array.from(jobToRowMap.values())
                      const maxRow = rowValues.length > 0 ? Math.max(...rowValues) : -1
                      
                      return (
                        <div style={{
                          position: 'relative',
                          minHeight: `${Math.max(100, (maxRow + 1) * 28 + 20)}px`,
                          backgroundColor: '#fafafa'
                        }}>
                          {/* Day dividers */}
                          {days.map((day, dayIdx) => {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6
                            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                            return (
                              <div
                                key={dayIdx}
                                style={{
                                  position: 'absolute',
                                  left: `${(dayIdx / timelineDays) * 100}%`,
                                  top: 0,
                                  bottom: 0,
                                  width: '1px',
                                  backgroundColor: dayIdx === 0 ? '#3b82f6' : (isWeekend ? '#e5e7eb' : '#d1d5db'),
                                  zIndex: 1,
                                  borderLeft: isToday ? '2px solid #3b82f6' : 'none'
                                }}
                              />
                            )
                          })}
                          
                          {/* Job blocks - continuous across days */}
                          {allTimelineJobs.map((job, jobIdx) => {
                            const position = getJobPositionForTimeline(job, timelineStart, timelineDays, jobToRowMap, jobIdx)
                            if (!position) return null
                            
                            const jobKey = `${job.orderDisplay}-${job.operation}-${jobIdx}`
                            const blockWidth = Math.max(0, parseFloat(position.width.replace('%', '')) || 0)
                            
                            return (
                              <div
                                key={jobKey}
                                style={{
                                  position: 'absolute',
                                  left: position.left,
                                  width: position.width,
                                  top: position.top,
                                  height: '22px',
                                  zIndex: position.zIndex || 2,
                                  minWidth: '40px'
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    backgroundColor: getStatusColor(job.prodStatus),
                                    color: 'white',
                                    borderRadius: '4px',
                                    padding: '0.25rem 0.4rem',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    overflow: 'hidden'
                                  }}
                                  title={`${job.orderDisplay} - ${job.part}
Build Operation: ${job.operation || 'N/A'}
Ordline Status: ${job.currentLocation || 'N/A'}
Status: ${job.prodStatus || 'N/A'}
Hours: ${parseFloat(job.hours || 0).toFixed(2)}h
${job.startDateTime ? `Start: ${format(job.startDateTime, 'MMM d, yyyy h:mm a')}` : (job.startDate ? `Start: ${format(job.startDate, 'MMM d, yyyy')}` : '')}
${job.endDateTime ? `End: ${format(job.endDateTime, 'MMM d, yyyy h:mm a')}` : (job.endDate ? `End: ${format(job.endDate, 'MMM d, yyyy')}` : '')}
${job.notes ? `Notes: ${job.notes}` : ''}`}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05)'
                                    e.currentTarget.style.zIndex = '10'
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)'
                                    e.currentTarget.style.zIndex = position.zIndex || 2
                                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                                  }}
                                >
                                  <div style={{ 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap',
                                    flex: 1
                                  }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.7rem' }}>
                                      {job.orderDisplay}
                                    </div>
                                    {job.operation && blockWidth > 15 && (
                                      <div style={{ fontSize: '0.6rem', opacity: 0.9, marginTop: '0.05rem' }}>
                                        {job.operation}
                                      </div>
                                    )}
                                    {job.currentLocation && blockWidth > 30 && (
                                      <div style={{ fontSize: '0.55rem', opacity: 0.75, marginTop: '0.05rem' }}>
                                        {job.currentLocation}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>Status Colors</h3>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {uniqueProdStatuses.map(status => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    backgroundColor: getStatusColor(status),
                    border: '1px solid rgba(0,0,0,0.1)'
                  }}
                />
                <span style={{ fontSize: '0.85rem' }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

