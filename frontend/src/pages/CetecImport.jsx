import { useState } from 'react'
import { Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import axios from 'axios'
import { getCetecLocationMaps, getCetecOperations, getCetecOperationDetail, getCetecCombinedData, getCetecOrdlineStatuses, getCetecPart, getCetecCustomer, runCetecImport } from '../api'

export default function CetecImport() {
  const [loading, setLoading] = useState(false)
  const [cetecData, setCetecData] = useState(null)
  const [rawCetecData, setRawCetecData] = useState(null) // Before filtering
  const [error, setError] = useState('')
  const [fetchStats, setFetchStats] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [filters, setFilters] = useState({
    intercompany: true,
    from_date: '',
    to_date: '',
    ordernum: '',
    customer: '',
    transcode: 'SA,SN', // Build and Stock orders
    prodline: '200', // Product line 200 (client-side filter)
    limit: 500, // Per-page limit
    offset: 0
  })
  
  // Table column filters
  const [columnFilters, setColumnFilters] = useState({
    woNumber: '',
    assembly: '',
    revision: '',
    customer: '',
    quantity: '',
    time: '',
    shipDate: '',
    location: '',
    materialStatus: '',
    cetecOrder: '',
    status: ''
  })

  const CETEC_CONFIG = {
    domain: 'sandy.cetecerp.com',
    token: '123matthatesbrant123'
  }

  const API_ENDPOINTS = [
    '/goapis/api/v1/ordlines/list',
    '/goapis/api/v1/ordlines',
    '/goapis/api/v1/ordlines/export',
    '/goapis/api/v1/ordlines/all',
    '/goapis/api/v1/ordlines/batch',
    '/goapis/api/v1/ordlines/bulk',
    '/goapis/api/v2/ordlines/list',
    '/goapis/api/v2/ordlines',
    '/api/v1/ordlines/list',
    '/api/v1/ordlines',
    '/api/v1/ordlines/export',
    '/api/ordlines/list',
    '/api/ordlines',
    '/goapis/ordlines/list',
    '/goapis/ordlines',
    '/ordlines/list',
    '/ordlines',
    '/goapis/api/v1/orders/lines',
    '/goapis/api/v1/orders/ordlines'
  ]

  const LABOR_PLAN_ENDPOINTS = [
    '/goapis/api/v1/laborplan/list',
    '/goapis/api/v1/laborplan',
    '/goapis/api/v1/labor/plan',
    '/goapis/api/v1/labor/list',
    '/goapis/api/v1/labor',
    '/goapis/api/v1/ordlines/labor',
    '/goapis/api/v1/order/labor',
    '/goapis/api/v1/routing/list',
    '/goapis/api/v1/routing',
    '/goapis/api/v1/operations/list',
    '/goapis/api/v1/operations'
  ]

  const fetchCetecData = async (fetchAll = false) => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    try {
      let allData = []
      let batchesFetched = 0
      
      if (fetchAll) {
        // DATE RANGE STRATEGY: Split into weekly chunks to get past 50-record limit
        const startDate = filters.from_date ? new Date(filters.from_date) : new Date()
        const endDate = filters.to_date ? new Date(filters.to_date) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
        
        // Calculate weeks between dates
        const weeks = []
        let currentDate = new Date(startDate)
        
        while (currentDate <= endDate) {
          const weekStart = new Date(currentDate)
          const weekEnd = new Date(currentDate)
          weekEnd.setDate(weekEnd.getDate() + 6) // 7 days per batch
          
          if (weekEnd > endDate) {
            weeks.push({ start: weekStart, end: endDate })
            break
          } else {
            weeks.push({ start: weekStart, end: weekEnd })
          }
          
          currentDate.setDate(currentDate.getDate() + 7)
        }
        
        console.log(`📅 Splitting date range into ${weeks.length} weekly batches`)
        
        // Fetch each week separately
        for (const week of weeks) {
          try {
            const params = new URLSearchParams({
              preshared_token: CETEC_CONFIG.token,
              from_date: week.start.toISOString().split('T')[0],
              to_date: week.end.toISOString().split('T')[0],
              format: 'json'
            })

            if (filters.intercompany) params.append('intercompany', 'true')
            if (filters.ordernum) params.append('ordernum', filters.ordernum)
            if (filters.customer) params.append('customer', filters.customer)
            if (filters.transcode) params.append('transcode', filters.transcode)

            const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`
            
            console.log(`📦 Batch ${batchesFetched + 1}/${weeks.length}: ${week.start.toISOString().split('T')[0]} to ${week.end.toISOString().split('T')[0]}`)

            const response = await axios.get(url)
            const batchData = response.data || []
            
            console.log(`   ✅ Got ${batchData.length} records`)
            
            allData = [...allData, ...batchData]
            batchesFetched++
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200))
            
          } catch (err) {
            console.error(`   ❌ Batch ${batchesFetched + 1} failed:`, err.message)
          }
        }
        
        console.log(`✅ Total fetched: ${allData.length} records from ${batchesFetched} batches`)
        
      } else {
        // SINGLE REQUEST: Just fetch once with current filters
        const params = new URLSearchParams({
          preshared_token: CETEC_CONFIG.token,
          format: 'json'
        })

        if (filters.intercompany) params.append('intercompany', 'true')
        if (filters.from_date) params.append('from_date', filters.from_date)
        if (filters.to_date) params.append('to_date', filters.to_date)
        if (filters.ordernum) params.append('ordernum', filters.ordernum)
        if (filters.customer) params.append('customer', filters.customer)
        if (filters.transcode) params.append('transcode', filters.transcode)

        const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`
        console.log('Single request:', url)

        const response = await axios.get(url)
        allData = response.data || []
        batchesFetched = 1
        
        console.log(`Got ${allData.length} records`)
      }

      setRawCetecData(allData)

      // Apply client-side filtering for prodline
      let filteredData = allData
      
      if (filters.prodline) {
        filteredData = allData.filter(item => 
          item.production_line_description === filters.prodline
        )
        console.log(`Filtered to prodline ${filters.prodline}: ${filteredData.length} records`)
      }

      setCetecData(filteredData)
      setFetchStats({
        totalFetched: allData.length,
        afterFilter: filteredData.length,
        pagesLoaded: batchesFetched,
        prodlineFilter: filters.prodline
      })
      
    } catch (err) {
      console.error('Cetec API error:', err)
      setError(err.response?.data?.message || err.message || 'Failed to fetch from Cetec')
    } finally {
      setLoading(false)
    }
  }

  const testAllEndpoints = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    const results = []
    let totalEndpointsTested = 0
    let successfulEndpoints = 0

    for (const endpoint of API_ENDPOINTS) {
      totalEndpointsTested++
      
      try {
        const params = new URLSearchParams({
          preshared_token: CETEC_CONFIG.token,
          limit: '1000', // Try requesting 1000 to see what we get
          format: 'json'
        })

        if (filters.intercompany) params.append('intercompany', 'true')
        if (filters.transcode) params.append('transcode', filters.transcode)

        const url = `https://${CETEC_CONFIG.domain}${endpoint}?${params.toString()}`
        console.log(`[${totalEndpointsTested}/${API_ENDPOINTS.length}] Testing: ${endpoint}`)

        const response = await axios.get(url)
        const data = response.data || []
        
        // Try to determine record count from different response structures
        let recordCount = 0
        let dataType = 'unknown'
        
        if (Array.isArray(data)) {
          recordCount = data.length
          dataType = 'array'
        } else if (data.data && Array.isArray(data.data)) {
          recordCount = data.data.length
          dataType = 'object.data'
        } else if (data.ordlines && Array.isArray(data.ordlines)) {
          recordCount = data.ordlines.length
          dataType = 'object.ordlines'
        } else if (data.records && Array.isArray(data.records)) {
          recordCount = data.records.length
          dataType = 'object.records'
        }
        
        const hasData = recordCount > 0
        
        if (hasData) {
          successfulEndpoints++
          console.log(`✅ ${endpoint}: ${recordCount} records (${dataType})`)
        } else {
          console.log(`❌ ${endpoint}: No data`)
        }
        
        results.push({
          endpoint,
          status: response.status,
          count: recordCount,
          hasData: hasData,
          dataType: dataType,
          headers: response.headers,
          url
        })

      } catch (err) {
        results.push({
          endpoint,
          status: err.response?.status || 'error',
          count: 0,
          hasData: false,
          dataType: 'error',
          error: err.message,
          url: `https://${CETEC_CONFIG.domain}${endpoint}`
        })
        console.log(`❌ ${endpoint}: ERROR - ${err.message}`)
      }
    }

    console.log('═══════════════════════════════════════')
    console.log(`Endpoint Test Complete: ${successfulEndpoints}/${totalEndpointsTested} successful`)
    console.log('Full results:', results)
    
    // Show detailed results
    const workingEndpoints = results.filter(r => r.hasData)
    const bestEndpoint = workingEndpoints.length > 0 
      ? workingEndpoints.reduce((best, current) => current.count > best.count ? current : best)
      : null
    
    let message = ''
    if (workingEndpoints.length === 0) {
      message = `❌ No working endpoints found.\nTested ${totalEndpointsTested} endpoints.\n\nCheck console for details.`
    } else {
      message = `✅ Found ${workingEndpoints.length} working endpoints:\n\n`
      workingEndpoints
        .sort((a, b) => b.count - a.count) // Sort by record count descending
        .slice(0, 5) // Show top 5
        .forEach(r => {
          message += `${r.count} records - ${r.endpoint}\n`
        })
      
      if (bestEndpoint && bestEndpoint.count > 50) {
        message += `\n🎉 BEST: ${bestEndpoint.count} records from:\n${bestEndpoint.endpoint}`
      } else {
        message += `\n⚠️ All endpoints still limited to ~50 records`
      }
    }
    
    alert(message)
    setLoading(false)
  }

  const testRawAPI = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    try {
      // Test the EXACT same call that was working before
      const params = new URLSearchParams({
        preshared_token: CETEC_CONFIG.token
      })

      if (filters.intercompany) params.append('intercompany', 'true')
      if (filters.from_date) params.append('from_date', filters.from_date)
      if (filters.to_date) params.append('to_date', filters.to_date)
      if (filters.ordernum) params.append('ordernum', filters.ordernum)
      if (filters.customer) params.append('customer', filters.customer)
      if (filters.transcode) params.append('transcode', filters.transcode)

      const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`

      console.log('RAW API TEST - Exact same call as before:', url)
      console.log('Parameters:', Object.fromEntries(params))

      const response = await axios.get(url)
      const data = response.data || []

      console.log('RAW API RESPONSE:')
      console.log('- Status:', response.status)
      console.log('- Headers:', response.headers)
      console.log('- Data type:', typeof data)
      console.log('- Data length:', Array.isArray(data) ? data.length : 'not array')
      console.log('- Full response:', response)

      if (Array.isArray(data)) {
        setCetecData(data)
        setRawCetecData(data)
        setFetchStats({
          totalFetched: data.length,
          afterFilter: data.length,
          pagesLoaded: 1,
          prodlineFilter: null
        })
      } else {
        setError(`Unexpected response format: ${typeof data}`)
      }

    } catch (err) {
      console.error('RAW API ERROR:', err)
      setError(err.response?.data?.message || err.message || 'Raw API test failed')
    } finally {
      setLoading(false)
    }
  }

  const fetchAndCombineAll = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    try {
      // First, fetch all order lines using date range strategy
      console.log('═══════════════════════════════════════')
      console.log('🚀 Fetching and Combining All Cetec Data')
      console.log('═══════════════════════════════════════')
      console.log('📋 Active Filters:')
      console.log('   From Date:', filters.from_date)
      console.log('   To Date:', filters.to_date)
      console.log('   Intercompany:', filters.intercompany)
      console.log('   Transcode:', filters.transcode || '(none)')
      console.log('   Prodline:', filters.prodline || '(none)')
      console.log('═══════════════════════════════════════\n')

      // Fetch ordline statuses (work locations) first
      console.log('📍 Fetching work locations (ordlinestatus)...')
      let ordlineStatusMap = {}
      try {
        const statusResponse = await getCetecOrdlineStatuses()
        let statuses = statusResponse.data
        
        console.log(`   📊 Response type:`, typeof statuses, Array.isArray(statuses) ? '(array)' : '(not array)')
        
        // Handle if response is not an array
        if (!Array.isArray(statuses)) {
          console.log(`   📊 Response keys:`, Object.keys(statuses || {}))
          // Try to extract array from response object
          if (statuses?.data) statuses = statuses.data
          else if (statuses?.ordlinestatus) statuses = statuses.ordlinestatus
          else if (statuses?.rows) statuses = statuses.rows
          else statuses = []
        }
        
        console.log(`   ✅ Fetched ${statuses.length} work locations`)
        
        // Create lookup map by ID
        if (Array.isArray(statuses)) {
          statuses.forEach(status => {
            ordlineStatusMap[status.id] = status
          })
          
          // Show some examples
          if (statuses.length > 0) {
            console.log(`   📋 Sample locations:`, statuses.slice(0, 3).map(s => `${s.id}: ${s.description}`))
          }
        }
      } catch (err) {
        console.error('   ⚠️  Failed to fetch work locations:', err.message)
      }

      let allOrderLines = []
      let batchesFetched = 0
      
      // Check if date range is provided
      if (filters.from_date && filters.to_date) {
        // Use date range strategy (weekly batches)
        const startDate = new Date(filters.from_date)
        const endDate = new Date(filters.to_date)
        
        // Calculate weeks
        const weeks = []
        let currentDate = new Date(startDate)
        
        while (currentDate <= endDate) {
          const weekStart = new Date(currentDate)
          const weekEnd = new Date(currentDate)
          weekEnd.setDate(weekEnd.getDate() + 6)
          
          if (weekEnd > endDate) {
            weeks.push({ start: weekStart, end: endDate })
            break
          } else {
            weeks.push({ start: weekStart, end: weekEnd })
          }
          
          currentDate.setDate(currentDate.getDate() + 7)
        }
        
        console.log(`\n📅 Step 1: Fetching order lines (${weeks.length} weekly batches with date range)`)
        
        for (const week of weeks) {
          try {
            const params = new URLSearchParams({
              preshared_token: CETEC_CONFIG.token,
              from_date: week.start.toISOString().split('T')[0],
              to_date: week.end.toISOString().split('T')[0],
              format: 'json'
            })

            if (filters.intercompany) params.append('intercompany', 'true')
            if (filters.transcode) params.append('transcode', filters.transcode)

            const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`
            const response = await axios.get(url)
            const batchData = response.data || []
            
            allOrderLines = [...allOrderLines, ...batchData]
            batchesFetched++
            
            console.log(`   Batch ${batchesFetched}/${weeks.length}: ${batchData.length} records`)
            
            await new Promise(resolve => setTimeout(resolve, 200))
          } catch (err) {
            console.error(`   Batch ${batchesFetched + 1} failed:`, err.message)
          }
        }
      } else {
        // No date range - fetch ALL orders in one call
        console.log(`\n📅 Step 1: Fetching ALL order lines (no date filter)`)
        console.log(`   ⚠️  WARNING: This may return a large number of records!`)
        
        try {
          const params = new URLSearchParams({
            preshared_token: CETEC_CONFIG.token,
            format: 'json'
          })

          if (filters.intercompany) params.append('intercompany', 'true')
          if (filters.transcode) params.append('transcode', filters.transcode)

          const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`
          const response = await axios.get(url)
          allOrderLines = response.data || []
          batchesFetched = 1
          
          console.log(`   Fetched ${allOrderLines.length} records`)
        } catch (err) {
          console.error(`   Fetch failed:`, err.message)
        }
      }
      
      console.log(`✅ Fetched ${allOrderLines.length} total order lines`)
      
      // Show unique production lines in raw data
      if (allOrderLines.length > 0) {
        const uniqueProdlines = [...new Set(allOrderLines.map(item => item.production_line_description))]
        console.log(`   📊 Unique production lines found:`, uniqueProdlines)
        console.log(`   📊 Sample record (check for location fields):`, allOrderLines[0])
        
        // Check for location-related fields
        const sampleRecord = allOrderLines[0]
        const locationFields = Object.keys(sampleRecord).filter(key => 
          key.toLowerCase().includes('location') || 
          key.toLowerCase().includes('status') ||
          key.toLowerCase().includes('ordlinestatus')
        )
        if (locationFields.length > 0) {
          console.log(`   📍 Location-related fields found:`, locationFields)
        }
      }

      // Apply prodline filter
      const beforeProdlineFilter = allOrderLines.length
      if (filters.prodline) {
        allOrderLines = allOrderLines.filter(item => 
          item.production_line_description === filters.prodline
        )
        console.log(`   🔽 Prodline filter "${filters.prodline}": ${beforeProdlineFilter} → ${allOrderLines.length} records`)
        
        if (allOrderLines.length === 0 && beforeProdlineFilter > 0) {
          console.warn(`   ⚠️  WARNING: Prodline filter removed ALL records!`)
          console.warn(`   💡 Check if production_line_description field matches "${filters.prodline}"`)
        }
      }
      
      // Map current location to each order line
      console.log(`\n📍 Mapping current work locations...`)
      allOrderLines = allOrderLines.map(orderLine => {
        // The field is "work_location" in the order line data
        const statusId = orderLine.work_location || orderLine.ordlinestatus_id || orderLine.current_ordlinestatus_id
        const location = statusId ? ordlineStatusMap[statusId] : null
        
        return {
          ...orderLine,
          _current_location: location ? location.description : 'Unknown',
          _current_location_id: statusId || null,
          _current_location_full: location || null
        }
      })
      
      // Log success with sample
      const withLocation = allOrderLines.filter(line => line._current_location !== 'Unknown').length
      console.log(`   ✅ Mapped locations: ${withLocation}/${allOrderLines.length} have known locations`)
      
      if (withLocation > 0) {
        const sample = allOrderLines.find(line => line._current_location !== 'Unknown')
        console.log(`   📋 Sample: work_location=${sample.work_location} → "${sample._current_location}"`)
      }

      // STEP 1.5: Fetch last customer for each part
      console.log(`\n👥 Fetching last customer sold to...`)
      const partLastCustomerMap = {}
      const customerNameCache = {}
      
      // Get unique prcparts
      const uniquePrcparts = [...new Set(allOrderLines.map(line => line.prcpart).filter(Boolean))]
      console.log(`   Found ${uniquePrcparts.length} unique parts`)
      
      let partsFetched = 0
      let customersFetched = 0
      let partsErrored = 0
      
      for (let i = 0; i < uniquePrcparts.length; i++) {
        const prcpart = uniquePrcparts[i]
        
        try {
          // Get part data to find most_recent_custnum
          const partResponse = await getCetecPart(prcpart)
          const partData = partResponse.data
          
          if (partData?.most_recent_custnum) {
            const custnum = partData.most_recent_custnum
            
            // Check if we already have this customer name cached
            if (!customerNameCache[custnum]) {
              try {
                const customerResponse = await getCetecCustomer(custnum)
                const customerData = customerResponse.data
                customerNameCache[custnum] = customerData?.name || custnum
                customersFetched++
              } catch (err) {
                customerNameCache[custnum] = custnum // Fallback to custnum if can't get name
              }
            }
            
            partLastCustomerMap[prcpart] = customerNameCache[custnum]
            partsFetched++
          }
          
          // Log progress every 20 parts
          if (i % 20 === 0 && i > 0) {
            console.log(`   Progress: ${i}/${uniquePrcparts.length} (${partsFetched} with last customer)`)
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50))
          
        } catch (err) {
          partsErrored++
          // Silent fail - not critical if we can't get last customer
        }
      }
      
      console.log(`   ✅ Fetched last customers: ${partsFetched} parts, ${customersFetched} unique customers, ${partsErrored} errors`)
      
      // Map last customer to order lines
      allOrderLines = allOrderLines.map(orderLine => ({
        ...orderLine,
        _last_customer: partLastCustomerMap[orderLine.prcpart] || null
      }))

      // STEP 2: For each order line, fetch location maps and operations
      console.log(`\n📍 Step 2: Fetching location maps and operations for ${allOrderLines.length} order lines`)
      
      const combinedData = []
      let successCount = 0
      let errorCount = 0

      for (let i = 0; i < allOrderLines.length; i++) {
        const orderLine = allOrderLines[i]
        const ordlineId = orderLine.ordline_id
        
        if (i % 10 === 0) {
          console.log(`   Progress: ${i}/${allOrderLines.length} (${successCount} successful, ${errorCount} errors)`)
        }

        try {
          // Use new combined endpoint - much faster!
          const combinedResponse = await getCetecCombinedData(ordlineId)
          const cetecData = combinedResponse.data
          
          if (i === 0) {
            console.log('   ✨ First combined response:', cetecData)
          }
          
          // Calculate time in minutes using Cetec data
          let timeMinutes = 0
          if (cetecData.has_smt_production && cetecData.smt_location && cetecData.smt_operation) {
            // Use avg_secs from the SMT ASSEMBLY operation (time per cycle)
            const avgSeconds = cetecData.smt_operation.avg_secs || 0
            const repetitions = cetecData.smt_operation.repetitions || 1
            // Balance due from ordline (order line level)
            const balanceDue = orderLine.balancedue || orderLine.release_qty || orderLine.orig_order_qty || 0
            
            // Time calculation: (avg_secs × repetitions × balance_due) / 60
            // avg_secs × repetitions = cycle time per unit
            // cycle time per unit × balance_due = total time for all units
            timeMinutes = (avgSeconds * repetitions * balanceDue) / 60
            
            if (i === 0 && timeMinutes > 0) {
              console.log(`   ⏱️  Time calc: ${avgSeconds} avg_secs × ${repetitions} reps × ${balanceDue} qty / 60 = ${Math.round(timeMinutes)} min`)
            }
          }

          // Combine all data
          combinedData.push({
            ...orderLine,
            _cetec_smt_location: cetecData.smt_location,
            _cetec_smt_operation: cetecData.smt_operation,
            _cetec_all_operations: cetecData.all_operations,
            _calculated_time_minutes: timeMinutes
          })

          successCount++

          // Delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (err) {
          console.error(`   ❌ Error for ordline ${ordlineId}:`, err.message, err.response?.data)
          
          // Still add the order line even if we couldn't get operations
          combinedData.push({
            ...orderLine,
            _cetec_error: err.message
          })
          
          errorCount++
        }
      }

      console.log(`\n✅ Step 2 Complete: ${successCount} successful, ${errorCount} errors`)

      // STEP 3: Show statistics
      const withSmtOperation = combinedData.filter(item => item._cetec_smt_operation).length
      const withSmtLocation = combinedData.filter(item => item._cetec_smt_location).length
      const withCalculatedTime = combinedData.filter(item => item._calculated_time_minutes > 0).length

      console.log('\n═══════════════════════════════════════')
      console.log('📊 Combined Data Statistics:')
      console.log('═══════════════════════════════════════')
      console.log(`Total order lines: ${combinedData.length}`)
      console.log(`With SMT location: ${withSmtLocation}`)
      console.log(`With SMT operation: ${withSmtOperation}`)
      console.log(`With calculated time: ${withCalculatedTime}`)
      console.log('\n✨ Sample combined record with time calculation:')
      console.log(combinedData.find(item => item._calculated_time_minutes > 0) || combinedData[0])

      // Set the data
      setCetecData(combinedData)
      setRawCetecData(combinedData)
      setFetchStats({
        totalFetched: combinedData.length,
        afterFilter: combinedData.length,
        pagesLoaded: batchesFetched,
        prodlineFilter: filters.prodline,
        withSmtOperation: withSmtOperation,
        withSmtLocation: withSmtLocation,
        successCount: successCount,
        errorCount: errorCount
      })

      alert(`✅ Success!\n\nFetched and combined ${combinedData.length} order lines.\n\n${withSmtOperation} have SMT operation data.\n\nCheck console for details.`)

    } catch (err) {
      console.error('Fetch and combine failed:', err)
      setError(err.message)
      alert(`Error: ${err.message}\nCheck console for details.`)
    } finally {
      setLoading(false)
    }
  }

  const runImport = async () => {
    if (!confirm('This will import Work Orders into the application.\n\nAre you sure you want to proceed?')) {
      return
    }
    
    setLoading(true)
    setError('')
    setImportResult(null)

    try {
      console.log('🚀 Starting Cetec Import...')
      
      const importRequest = {
        from_date: filters.from_date || null,
        to_date: filters.to_date || null,
        prodline: filters.prodline || "200",
        transcode: filters.transcode || "SA,SN",
        intercompany: filters.intercompany
      }
      
      console.log('Import parameters:', importRequest)
      
      const response = await runCetecImport(importRequest)
      const result = response.data
      
      console.log('✅ Import complete:', result)
      
      setImportResult(result)
      
      alert(`✅ Import Successful!\n\n` +
        `Fetched: ${result.total_fetched} order lines\n` +
        `Created: ${result.created_count} new WOs\n` +
        `Updated: ${result.updated_count} existing WOs\n` +
        `Errors: ${result.error_count}\n\n` +
        `Changes tracked: ${result.changes.length}`
      )

    } catch (err) {
      console.error('Import failed:', err)
      setError(err.response?.data?.detail || err.message)
      alert(`❌ Import Failed:\n${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const diagnosticTest = async () => {
    setLoading(true)
    setError('')

    try {
      if (!cetecData || cetecData.length === 0) {
        alert('Please fetch order lines first using "Quick Fetch" button.')
        setLoading(false)
        return
      }

      const orderLine = cetecData[0]
      const ordlineId = orderLine.ordline_id

      console.log('═══════════════════════════════════════')
      console.log('🔍 DIAGNOSTIC TEST - Step by Step')
      console.log('═══════════════════════════════════════')
      console.log('\n📦 Testing with first order line:')
      console.log('   Order:', orderLine.ordernum)
      console.log('   Part:', orderLine.prcpart)
      console.log('   ordline_id:', ordlineId)
      console.log('   Full order line data:', orderLine)

      // TEST 1: Location maps without children (via our backend proxy)
      console.log('\n[TEST 1] Fetching location_maps (no children) via backend proxy...')
      console.log('API call: getCetecLocationMaps(', ordlineId, ', false)')
      
      let locationMaps = []
      try {
        const resp1 = await getCetecLocationMaps(ordlineId, false)
        console.log('✅ Response status:', resp1.status)
        console.log('✅ Response data type:', typeof resp1.data, Array.isArray(resp1.data) ? `(array of ${resp1.data.length})` : '')
        console.log('✅ Full response data:', resp1.data)
        
        locationMaps = resp1.data || []
        
        if (locationMaps.length > 0) {
          console.log('✅ First location map:', locationMaps[0])
          console.log('   Available fields:', Object.keys(locationMaps[0]))
        }
      } catch (err) {
        console.error('❌ Failed:', err.message)
        console.error('   Full error:', err)
      }

      // TEST 2: Location maps WITH children (via our backend proxy)
      console.log('\n[TEST 2] Fetching location_maps (with children) via backend proxy...')
      console.log('API call: getCetecLocationMaps(', ordlineId, ', true)')
      
      let locationMapsWithChildren = []
      try {
        const resp2 = await getCetecLocationMaps(ordlineId, true)
        console.log('✅ Response status:', resp2.status)
        console.log('✅ Response data type:', typeof resp2.data, Array.isArray(resp2.data) ? `(array of ${resp2.data.length})` : '')
        console.log('✅ Full response data:', resp2.data)
        
        locationMapsWithChildren = resp2.data || []
        
        if (locationMapsWithChildren.length > 0) {
          console.log('✅ First location map (with children):', locationMapsWithChildren[0])
          console.log('   Available fields:', Object.keys(locationMapsWithChildren[0]))
        }
      } catch (err) {
        console.error('❌ Failed:', err.message)
        console.error('   Full error:', err)
      }

      // TEST 3: Try to get operations if we found a location map
      console.log('\n[TEST 3] Trying to fetch operations...')
      
      const mapsToCheck = locationMapsWithChildren.length > 0 ? locationMapsWithChildren : locationMaps
      
      if (mapsToCheck.length > 0) {
        console.log(`   Found ${mapsToCheck.length} location maps, checking for SMT PRODUCTION...`)
        
        // Look for SMT PRODUCTION location
        const smtLocation = mapsToCheck.find(loc => {
          const locStr = JSON.stringify(loc).toUpperCase()
          return locStr.includes('SMT') && (locStr.includes('PRODUCTION') || locStr.includes('PROD'))
        })
        
        if (smtLocation) {
          console.log('   🎯 Found SMT location:', smtLocation)
          
          const ordlineMapId = smtLocation.ordline_map_id || smtLocation.id
          console.log('   Using ordline_map_id:', ordlineMapId)
          
          if (ordlineMapId) {
            try {
              console.log('   Fetching operations via backend proxy...')
              console.log('   API call: getCetecOperations(', ordlineId, ',', ordlineMapId, ')')
              
              const opResp = await getCetecOperations(ordlineId, ordlineMapId)
              console.log('   ✅ Response status:', opResp.status)
              console.log('   ✅ Operations data:', opResp.data)
              
              const operations = opResp.data || []
              
              if (operations.length > 0) {
                console.log('   ✅ First operation:', operations[0])
                console.log('   Available fields:', Object.keys(operations[0]))
                
                // COPY-FRIENDLY JSON OUTPUT
                console.log('\n📋 COPY THIS - First Operation JSON:')
                console.log(JSON.stringify(operations[0], null, 2))
                
                console.log('\n📋 COPY THIS - All Operations JSON:')
                console.log(JSON.stringify(operations, null, 2))
                
                // Look for SMT ASSEMBLY
                const smtOp = operations.find(op => {
                  const opStr = JSON.stringify(op).toUpperCase()
                  return opStr.includes('SMT') || opStr.includes('ASSEMBLY')
                })
                
                if (smtOp) {
                  console.log('   🎯 Found SMT ASSEMBLY operation:', smtOp)
                  console.log('\n📋 COPY THIS - SMT Operation JSON:')
                  console.log(JSON.stringify(smtOp, null, 2))
                }
              }
              
            } catch (err) {
              console.error('   ❌ Failed to fetch operations:', err.message)
              console.error('      Full error:', err)
            }
          }
        } else {
          console.log('   ⚠️ No SMT PRODUCTION location found')
          console.log('   Available locations:', mapsToCheck.map(loc => ({
            id: loc.id || loc.ordline_map_id,
            name: loc.location_name || loc.location || loc.name || 'unknown',
            fullData: loc
          })))
        }
      } else {
        console.log('   ❌ No location maps found - cannot test operations')
      }

      alert('Diagnostic test complete! Check the console for detailed results.\n\nLook for:\n1. Location map structure\n2. Available field names\n3. Whether SMT PRODUCTION exists')

    } catch (err) {
      console.error('Diagnostic test failed:', err)
      alert(`Error: ${err.message}\nCheck console for details.`)
    } finally {
      setLoading(false)
    }
  }

  const testOperationEndpoints = async () => {
    setLoading(true)
    setError('')

    try {
      // First, we need to get some order line IDs
      if (!cetecData || cetecData.length === 0) {
        alert('Please fetch order lines first using "Quick Fetch" or "Fetch All" button.')
        setLoading(false)
        return
      }

      console.log('═══════════════════════════════════════')
      console.log('🔬 Testing Operation Endpoints')
      console.log('═══════════════════════════════════════')

      // Test first 3 order lines (or fewer if less available)
      const testOrderLines = cetecData.slice(0, 3)
      const results = []

      for (const orderLine of testOrderLines) {
        const ordlineId = orderLine.ordline_id
        console.log(`\n📦 Testing ordline_id: ${ordlineId} (${orderLine.ordernum} - ${orderLine.prcpart})`)

        try {
          // STEP 1: Get location maps (with children) via backend proxy
          console.log(`  [1] Fetching location maps (with children) via backend proxy`)
          
          const locationMapResponse = await getCetecLocationMaps(ordlineId, true)
          const locationMaps = locationMapResponse.data || []
          
          console.log(`  ✅ Found ${Array.isArray(locationMaps) ? locationMaps.length : 'unknown'} location maps`)

          // STEP 2: Look for SMT PRODUCTION location
          const smtLocation = Array.isArray(locationMaps) 
            ? locationMaps.find(loc => {
                const locStr = JSON.stringify(loc).toUpperCase()
                return locStr.includes('SMT') && (locStr.includes('PRODUCTION') || locStr.includes('PROD'))
              })
            : null

          let operations = []
          let smtOperation = null

          if (smtLocation) {
            console.log('  🎯 Found SMT location')
            
            const ordlineMapId = smtLocation.ordline_map_id || smtLocation.id
            
            if (ordlineMapId) {
              // STEP 3: Get operations via backend proxy
              console.log(`  [2] Fetching operations for map_id: ${ordlineMapId}`)
              
              const operationsResponse = await getCetecOperations(ordlineId, ordlineMapId)
              operations = operationsResponse.data || []
              
              console.log(`  ✅ Found ${Array.isArray(operations) ? operations.length : 'unknown'} operations`)

              // STEP 4: Find SMT ASSEMBLY operation
              smtOperation = Array.isArray(operations)
                ? operations.find(op => {
                    const opStr = JSON.stringify(op).toUpperCase()
                    return opStr.includes('SMT') || opStr.includes('ASSEMBLY')
                  })
                : null
              
              if (smtOperation) {
                console.log('  🎯 Found SMT ASSEMBLY operation')
              }
            }
          }

          // Add to results
          results.push({
            ordlineId,
            orderNum: orderLine.ordernum,
            part: orderLine.prcpart,
            locationMaps: locationMaps,
            smtLocation: smtLocation,
            operations: operations,
            smtOperation: smtOperation
          })

        } catch (err) {
          console.error(`  ❌ Error for ordline ${ordlineId}:`, err.message)
          console.error('     Full error:', err)
          
          results.push({
            ordlineId,
            orderNum: orderLine.ordernum,
            part: orderLine.prcpart,
            error: err.message
          })
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      console.log('\n═══════════════════════════════════════')
      console.log('Operation Test Complete')
      console.log('Full results:', results)

      // Show summary
      const successCount = results.filter(r => r.operations && r.operations.length > 0).length
      const smtCount = results.filter(r => r.smtOperation).length
      
      let message = `✅ Tested ${results.length} order lines:\n\n`
      message += `Found location maps: ${results.filter(r => r.locationMaps).length}\n`
      message += `Found SMT locations: ${results.filter(r => r.smtLocation).length}\n`
      message += `Found operations: ${successCount}\n`
      message += `Found SMT operations: ${smtCount}\n\n`
      
      if (smtCount > 0) {
        message += `🎉 SUCCESS! Found SMT operation data.\nCheck console for full details including labor time.`
      } else if (results.filter(r => r.locationMaps).length > 0) {
        message += `⚠️ Found locations but no SMT location.\nCheck console to see what locations are available.`
      } else {
        message += `❌ No location data found.\nCheck console for error details.`
      }
      
      alert(message)

    } catch (err) {
      console.error('Test failed:', err)
      alert(`Error: ${err.message}\nCheck console for details.`)
    } finally {
      setLoading(false)
    }
  }

  const testLaborPlanEndpoints = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    const results = []
    let totalEndpointsTested = 0
    let successfulEndpoints = 0

    for (const endpoint of LABOR_PLAN_ENDPOINTS) {
      totalEndpointsTested++
      
      try {
        const params = new URLSearchParams({
          preshared_token: CETEC_CONFIG.token,
          format: 'json'
        })

        // Try with same filters as ordlines
        if (filters.intercompany) params.append('intercompany', 'true')
        if (filters.from_date) params.append('from_date', filters.from_date)
        if (filters.to_date) params.append('to_date', filters.to_date)

        const url = `https://${CETEC_CONFIG.domain}${endpoint}?${params.toString()}`
        console.log(`[${totalEndpointsTested}/${LABOR_PLAN_ENDPOINTS.length}] Testing Labor Plan: ${endpoint}`)

        const response = await axios.get(url)
        const data = response.data || []
        
        // Try to determine record count from different response structures
        let recordCount = 0
        let dataType = 'unknown'
        let hasSmtProduction = false
        
        if (Array.isArray(data)) {
          recordCount = data.length
          dataType = 'array'
          // Check if any record has SMT PRODUCTION
          hasSmtProduction = data.some(item => 
            JSON.stringify(item).toLowerCase().includes('smt') || 
            JSON.stringify(item).toLowerCase().includes('production')
          )
        } else if (data.data && Array.isArray(data.data)) {
          recordCount = data.data.length
          dataType = 'object.data'
          hasSmtProduction = data.data.some(item => 
            JSON.stringify(item).toLowerCase().includes('smt') || 
            JSON.stringify(item).toLowerCase().includes('production')
          )
        } else if (typeof data === 'object') {
          // Check if it's a single labor plan object
          recordCount = 1
          dataType = 'object'
          hasSmtProduction = JSON.stringify(data).toLowerCase().includes('smt') || 
                            JSON.stringify(data).toLowerCase().includes('production')
        }
        
        const hasData = recordCount > 0
        
        if (hasData) {
          successfulEndpoints++
          console.log(`✅ ${endpoint}: ${recordCount} records (${dataType})${hasSmtProduction ? ' [Has SMT/Production data]' : ''}`)
          console.log('Sample data:', Array.isArray(data) ? data[0] : data)
        } else {
          console.log(`❌ ${endpoint}: No data`)
        }
        
        results.push({
          endpoint,
          status: response.status,
          count: recordCount,
          hasData: hasData,
          hasSmtProduction: hasSmtProduction,
          dataType: dataType,
          sampleData: hasData ? (Array.isArray(data) ? data[0] : data) : null
        })

      } catch (err) {
        results.push({
          endpoint,
          status: err.response?.status || 'error',
          count: 0,
          hasData: false,
          hasSmtProduction: false,
          dataType: 'error',
          error: err.message
        })
        console.log(`❌ ${endpoint}: ERROR - ${err.message}`)
      }
    }

    console.log('═══════════════════════════════════════')
    console.log(`Labor Plan Test Complete: ${successfulEndpoints}/${totalEndpointsTested} successful`)
    console.log('Full results:', results)
    
    // Show detailed results
    const workingEndpoints = results.filter(r => r.hasData)
    const smtEndpoints = results.filter(r => r.hasSmtProduction)
    
    let message = ''
    if (workingEndpoints.length === 0) {
      message = `❌ No labor plan endpoints found.\nTested ${totalEndpointsTested} endpoints.\n\nCheck console for details.`
    } else {
      message = `✅ Found ${workingEndpoints.length} working labor plan endpoints:\n\n`
      workingEndpoints
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .forEach(r => {
          message += `${r.count} records - ${r.endpoint}${r.hasSmtProduction ? ' ⭐' : ''}\n`
        })
      
      if (smtEndpoints.length > 0) {
        message += `\n🎯 ${smtEndpoints.length} endpoint(s) contain SMT/Production data!`
      }
    }
    
    alert(message)
    setLoading(false)
  }

  const testPaginationMethods = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    const paginationTests = [
      // Test 1: Basic pagination with page parameter
      {
        name: 'Page-based pagination',
        params: {
          preshared_token: CETEC_CONFIG.token,
          page: '2',
          limit: '50'
        }
      },
      // Test 2: Offset-based pagination
      {
        name: 'Offset-based pagination',
        params: {
          preshared_token: CETEC_CONFIG.token,
          offset: '50',
          limit: '50'
        }
      },
      // Test 3: Different limit values
      {
        name: 'Higher limit (100)',
        params: {
          preshared_token: CETEC_CONFIG.token,
          limit: '100'
        }
      },
      // Test 4: Skip parameter
      {
        name: 'Skip parameter',
        params: {
          preshared_token: CETEC_CONFIG.token,
          skip: '50',
          limit: '50'
        }
      },
      // Test 5: Start parameter
      {
        name: 'Start parameter',
        params: {
          preshared_token: CETEC_CONFIG.token,
          start: '50',
          count: '50'
        }
      }
    ]

    const results = []

    for (const test of paginationTests) {
      try {
        const params = new URLSearchParams(test.params)
        if (filters.intercompany) params.append('intercompany', 'true')

        const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`
        
        console.log(`Testing ${test.name}:`, url)
        
        const response = await axios.get(url)
        const data = response.data || []
        
        results.push({
          name: test.name,
          count: Array.isArray(data) ? data.length : 0,
          success: true,
          url: url
        })
        
        console.log(`${test.name}: ${Array.isArray(data) ? data.length : 0} records`)
        
      } catch (err) {
        results.push({
          name: test.name,
          count: 0,
          success: false,
          error: err.message,
          url: `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${new URLSearchParams(test.params).toString()}`
        })
        console.log(`${test.name}: ERROR - ${err.message}`)
      }
    }

    console.log('Pagination test results:', results)
    
    // Show results
    const workingMethods = results.filter(r => r.success && r.count > 0)
    const message = workingMethods.length > 0 
      ? `Found ${workingMethods.length} working pagination methods:\n${workingMethods.map(r => `${r.name}: ${r.count} records`).join('\n')}`
      : 'No pagination methods worked. API likely has a hard 50-record limit.'
    
    alert(message)
    setLoading(false)
  }

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // Filter data based on column filters
  const filteredData = cetecData ? cetecData.filter(line => {
    const woNumber = `${line.ordernum}-${line.lineitem}`.toLowerCase()
    const assembly = (line.prcpart || '').toLowerCase()
    const revision = (line.revision || '').toLowerCase()
    const customer = (line.customer || '').toLowerCase()
    const quantity = String(line.balancedue || line.release_qty || line.orig_order_qty || '')
    const time = line._calculated_time_minutes ? String(Math.round(line._calculated_time_minutes)) : ''
    const shipDate = (line.promisedate || line.target_ship_date || '').toLowerCase()
    const location = (line._current_location || '').toLowerCase()
    
    // Material status
    const shortAllocation = line.short_per_allocation || false
    const shortShelf = line.short_per_shelf || false
    let materialStatus = 'ready'
    if (shortAllocation && shortShelf) materialStatus = 'shortage'
    else if (shortAllocation || shortShelf) materialStatus = 'partial'
    
    const cetecOrder = (line.ordernum || '').toLowerCase()
    const status = (line._calculated_time_minutes > 0 ? 'ready' : 'missing').toLowerCase()
    
    return (
      woNumber.includes(columnFilters.woNumber.toLowerCase()) &&
      assembly.includes(columnFilters.assembly.toLowerCase()) &&
      revision.includes(columnFilters.revision.toLowerCase()) &&
      customer.includes(columnFilters.customer.toLowerCase()) &&
      quantity.includes(columnFilters.quantity) &&
      time.includes(columnFilters.time) &&
      shipDate.includes(columnFilters.shipDate.toLowerCase()) &&
      location.includes(columnFilters.location.toLowerCase()) &&
      materialStatus.includes(columnFilters.materialStatus.toLowerCase()) &&
      cetecOrder.includes(columnFilters.cetecOrder.toLowerCase()) &&
      status.includes(columnFilters.status.toLowerCase())
    )
  }) : []
  
  const clearColumnFilters = () => {
    setColumnFilters({
      woNumber: '',
      assembly: '',
      revision: '',
      customer: '',
      quantity: '',
      time: '',
      shipDate: '',
      location: '',
      materialStatus: '',
      cetecOrder: '',
      status: ''
    })
  }
  
  const handleColumnFilterChange = (column, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }))
  }

  const exportToCSV = () => {
    if (!filteredData || filteredData.length === 0) return

    // Define columns to export (matching Work Order import format)
    const headers = [
      'WO Number',
      'Assembly',
      'Revision',
      'Customer',
      'Last Customer',
      'Quantity',
      'Time (min)',
      'Ship Date',
      'Current Location',
      'Material Status',
      'Material Due Date',
      'Cetec Order',
      'Cetec Line',
      'Status',
      'Ordline ID',
      'Cetec Work URL',
      'Cetec Allocation URL'
    ]
    
    // Create CSV rows with mapped data (using filtered data)
    const rows = filteredData.map(item => {
      const woNumber = `${item.ordernum}-${item.lineitem}`
      const quantity = item.balancedue || item.release_qty || item.orig_order_qty || 0
      const timeMinutes = item._calculated_time_minutes ? Math.round(item._calculated_time_minutes) : 0
      const shipDate = item.promisedate || item.target_ship_date || ''
      const currentLocation = item._current_location || 'Unknown'
      const lastCustomer = item._last_customer || ''
      const status = timeMinutes > 0 ? 'Ready' : 'Missing Data'
      
      // Material status
      const shortAllocation = item.short_per_allocation || false
      const shortShelf = item.short_per_shelf || false
      
      // Extract just the date from material_here_on (may contain extra text like "(+ Unset!)")
      let materialHereOn = item.material_here_on || ''
      if (materialHereOn) {
        // Extract date portion (YYYY-MM-DD format)
        const dateMatch = materialHereOn.match(/\d{4}-\d{2}-\d{2}/)
        materialHereOn = dateMatch ? dateMatch[0] : materialHereOn
      }
      
      let materialStatus = 'Ready'
      if (shortAllocation && shortShelf) {
        materialStatus = 'Shortage'
      } else if (shortAllocation || shortShelf) {
        materialStatus = 'Partial'
      }
      
      // Cetec work view URL
      const cetecWorkUrl = item.ordline_id 
        ? `https://${CETEC_CONFIG.domain}/react/otd/order/${item.ordline_id}/work_view`
        : ''
      
      // Cetec allocation URL (only if there's a shortage)
      const cetecAllocationUrl = (shortAllocation || shortShelf) && item.ordernum
        ? `https://${CETEC_CONFIG.domain}/otd/allocation/list?reloaded=1&late=1&controlnum=${item.ordernum}`
        : ''
      
      return [
        `"${woNumber}"`,
        `"${item.prcpart || ''}"`,
        `"${item.revision || ''}"`,
        `"${item.customer || ''}"`,
        `"${lastCustomer}"`,
        quantity,
        timeMinutes,
        `"${shipDate}"`,
        `"${currentLocation}"`,
        `"${materialStatus}"`,
        `"${materialHereOn}"`,
        `"${item.ordernum || ''}"`,
        `"${item.lineitem || ''}"`,
        `"${status}"`,
        item.ordline_id || '',
        `"${cetecWorkUrl}"`,
        `"${cetecAllocationUrl}"`
      ].join(',')
    })

    // Combine
    const csvContent = [
      headers.join(','),
      ...rows
    ].join('\n')

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cetec_work_orders_preview_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cetec Import Test</h1>
          <p className="page-description">Test Cetec ERP integration - View order lines before importing</p>
        </div>
      </div>

      {/* Cetec Config Info */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%)', border: '1px solid #bee5eb' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0c5460' }}>
          Cetec Configuration
        </h3>
        <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>
          <strong>Domain:</strong> {CETEC_CONFIG.domain}<br />
          <strong>Token:</strong> {CETEC_CONFIG.token.substring(0, 10)}...
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Filters</h3>
        
        <div className="grid grid-cols-4">
          <div className="form-group">
            <label className="form-label">From Date</label>
            <input
              type="date"
              name="from_date"
              className="form-input"
              value={filters.from_date}
              onChange={handleFilterChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label">To Date</label>
            <input
              type="date"
              name="to_date"
              className="form-input"
              value={filters.to_date}
              onChange={handleFilterChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Date Type</label>
            <select name="date_type" className="form-select" value={filters.date_type || 'target_wip_date'} onChange={handleFilterChange}>
              <option value="target_wip_date">Target WIP Date</option>
              <option value="target_ship_date">Target Ship Date</option>
              <option value="promisedate">Promise Date</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Product Line</label>
            <input
              type="text"
              name="prodline"
              className="form-input"
              value={filters.prodline}
              onChange={handleFilterChange}
              placeholder="200"
            />
            <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Filter by production line
            </small>
          </div>
        </div>

        <div className="grid grid-cols-4">
          <div className="form-group">
            <label className="form-label">Order Number</label>
            <input
              type="text"
              name="ordernum"
              className="form-input"
              value={filters.ordernum}
              onChange={handleFilterChange}
              placeholder="Search..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Customer</label>
            <input
              type="text"
              name="customer"
              className="form-input"
              value={filters.customer}
              onChange={handleFilterChange}
              placeholder="Search..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Trans Code</label>
            <input
              type="text"
              name="transcode"
              className="form-input"
              value={filters.transcode}
              onChange={handleFilterChange}
              placeholder="SA,SN"
            />
            <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              SA=Build, SN=Stock
            </small>
          </div>

          <div className="form-group">
            <label className="form-label">Limit</label>
            <input
              type="number"
              name="limit"
              className="form-input"
              value={filters.limit}
              onChange={handleFilterChange}
              min="1"
              max="5000"
            />
            <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Max records to fetch
            </small>
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              name="intercompany"
              checked={filters.intercompany}
              onChange={handleFilterChange}
            />
            <strong>Intercompany Only</strong>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={fetchAndCombineAll}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, var(--success) 0%, #218838 100%)', color: 'white', fontSize: '1rem', padding: '0.75rem 1.5rem', fontWeight: 700 }}
          >
            <RefreshCw size={20} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Fetching & Combining...' : 'Fetch & Combine All Data (Recommended)'}
          </button>
          
          <button
            className="btn btn-primary"
            onClick={runImport}
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #6610f2 0%, #520dc2 100%)', color: 'white', fontSize: '1rem', padding: '0.75rem 1.5rem', fontWeight: 700 }}
          >
            <Download size={20} />
            {loading ? 'Importing...' : 'Import to Work Orders'}
          </button>
        </div>
        
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#d4edda', borderRadius: '4px', border: '1px solid #c3e6cb' }}>
          <strong style={{ color: '#155724' }}>💡 Recommended:</strong> <span style={{ color: '#155724', fontSize: '0.875rem' }}>Use "Fetch & Combine All Data" to get order lines + labor plan data in one step. This may take a few minutes for hundreds of orders.</span>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: '#6c757d' }}>Alternative: Test Individual Steps</h4>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => fetchCetecData(false)}
              disabled={loading}
              style={{ fontSize: '0.875rem' }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Quick Fetch (50 max)
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => fetchCetecData(true)}
              disabled={loading}
              style={{ fontSize: '0.875rem' }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Fetch All Order Lines
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeaa7' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: '#856404' }}>🧪 Advanced Testing</h4>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={testAllEndpoints}
              disabled={loading}
              style={{ background: 'var(--warning)', color: 'white', fontSize: '0.875rem' }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Test All Endpoints
            </button>
            <button
              className="btn btn-secondary"
              onClick={testRawAPI}
              disabled={loading}
              style={{ background: '#6c757d', color: 'white', fontSize: '0.875rem' }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Test Raw API
            </button>
            <button
              className="btn btn-secondary"
              onClick={testPaginationMethods}
              disabled={loading}
              style={{ background: '#17a2b8', color: 'white', fontSize: '0.875rem' }}
            >
              <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Test Pagination
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '8px', border: '2px solid #ffc107' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#856404' }}>
            🔍 Diagnostic Test - Start Here!
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#856404', marginBottom: '0.75rem' }}>
            Run this first to see exactly what data structure Cetec returns for location maps and operations.
          </p>
          <button
            className="btn btn-primary"
            onClick={diagnosticTest}
            disabled={loading || !cetecData || cetecData.length === 0}
            style={{ background: '#ffc107', color: '#000', fontWeight: 700 }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Testing...' : 'Run Diagnostic Test'}
          </button>
          {(!cetecData || cetecData.length === 0) && (
            <p style={{ fontSize: '0.75rem', color: '#721c24', marginTop: '0.5rem', padding: '0.5rem', background: '#f8d7da', borderRadius: '4px' }}>
              ⚠️ Please fetch order lines first (use "Quick Fetch" button above)
            </p>
          )}
        </div>

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e7f3ff', borderRadius: '8px', border: '1px solid #b3d9ff' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#004085' }}>
            🔬 Labor Plan / Operations Testing
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#004085', marginBottom: '0.75rem' }}>
            After diagnostic test, use these to test multiple orders or different approaches.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={testOperationEndpoints}
              disabled={loading || !cetecData || cetecData.length === 0}
              style={{ background: '#28a745', color: 'white' }}
            >
              <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Testing...' : 'Test Operations (3 orders)'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={testLaborPlanEndpoints}
              disabled={loading}
              style={{ background: '#6f42c1', color: 'white' }}
            >
              <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Testing...' : 'Test Labor Plan Endpoints'}
            </button>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#f8f9fa', border: '1px solid #dee2e6' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#6c757d' }}>
          Debug Info
        </h3>
        <div style={{ fontSize: '0.875rem', color: '#6c757d' }}>
          <strong>Current Filters:</strong><br />
          <pre style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', fontSize: '0.75rem', marginTop: '0.5rem' }}>
{JSON.stringify(filters, null, 2)}
          </pre>
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '4px' }}>
            <strong>💡 How it works:</strong><br />
            • <strong>API has 50-record limit per request</strong><br />
            • "Quick Fetch" = Single request, 50 records max<br />
            • "Fetch All" = <strong>Weekly batches</strong> to get past 50-record limit<br />
            • Prodline filter applied client-side after fetching<br />
            • <strong>Set From/To dates</strong> for best results with "Fetch All"
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="card" style={{ background: '#f8d7da', border: '1px solid #f5c6cb', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#721c24' }}>
            <AlertCircle size={20} />
            <div>
              <strong>Error:</strong> {error}
            </div>
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResult && (
        <div className="card" style={{ background: '#d1ecf1', border: '1px solid #bee5eb', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#0c5460' }}>
            ✅ Import Complete
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>Fetched</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0c5460' }}>{importResult.total_fetched}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>Created</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#28a745' }}>{importResult.created_count}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>Updated</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#007bff' }}>{importResult.updated_count}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>Errors</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc3545' }}>{importResult.error_count}</div>
            </div>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#0c5460' }}>
            <strong>{importResult.changes.length} changes tracked</strong> - View in <a href="/cetec-sync-report" style={{ color: '#0c5460', textDecoration: 'underline' }}>Sync Report</a>
          </div>
        </div>
      )}

      {/* Success + Results */}
      {cetecData && (
        <>
          <div className="card" style={{ background: '#d4edda', border: '1px solid #b1dfbb', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#155724' }}>
              <CheckCircle size={20} />
              <div>
                <strong>Success!</strong> {cetecData.length} order line{cetecData.length !== 1 ? 's' : ''} {fetchStats?.prodlineFilter ? `(prodline ${fetchStats.prodlineFilter})` : ''}
              </div>
            </div>
          </div>

          {/* Fetch Stats */}
          {fetchStats && (
            <div className="card" style={{ marginBottom: '1.5rem', background: '#e7f3ff', border: '1px solid #b3d9ff' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#004085' }}>
                📊 Fetch Statistics
              </h3>
              <div style={{ fontSize: '0.875rem', color: '#004085', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div>
                  <strong>Batches Loaded:</strong> {fetchStats.pagesLoaded}
                </div>
                <div>
                  <strong>Total Order Lines:</strong> {fetchStats.totalFetched} records
                </div>
                {fetchStats.prodlineFilter && (
                  <div>
                    <strong>Prodline Filter:</strong> {fetchStats.prodlineFilter}
                  </div>
                )}
                {fetchStats.withSmtOperation !== undefined && (
                  <>
                    <div>
                      <strong>With SMT Operation:</strong> {fetchStats.withSmtOperation} ({Math.round(fetchStats.withSmtOperation / fetchStats.totalFetched * 100)}%)
                    </div>
                    <div>
                      <strong>With SMT Location:</strong> {fetchStats.withSmtLocation}
                    </div>
                    <div>
                      <strong>Successful:</strong> {fetchStats.successCount}
                    </div>
                    <div>
                      <strong>Errors:</strong> {fetchStats.errorCount}
                    </div>
                  </>
                )}
              </div>
              
              {/* Show unique production lines in raw data */}
              {rawCetecData && rawCetecData.length > 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff', borderRadius: '4px' }}>
                  <strong>Production Lines Found:</strong>{' '}
                  {[...new Set(rawCetecData.map(item => item.production_line_description))].sort().map((line, idx) => (
                    <span 
                      key={idx}
                      className="badge" 
                      style={{ 
                        background: line === '200' ? 'var(--success)' : '#6c757d',
                        color: 'white',
                        marginLeft: '0.25rem'
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              )}
              
              {fetchStats.prodlineFilter && fetchStats.afterFilter === 0 && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '4px', color: '#856404' }}>
                  <strong>⚠️ Warning:</strong> No records found for prodline "{fetchStats.prodlineFilter}". 
                  Try clearing the prodline filter or check available values above.
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Work Order Import Preview ({filteredData.length} of {cetecData.length})
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6c757d', margin: 0 }}>
                  {filteredData.filter(line => line._calculated_time_minutes > 0).length} ready to import
                  {Object.values(columnFilters).some(f => f) && (
                    <button 
                      onClick={clearColumnFilters}
                      style={{ 
                        marginLeft: '1rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </p>
              </div>
              <button className="btn btn-secondary" onClick={exportToCSV}>
                <Download size={18} />
                Export Preview
              </button>
            </div>

            <div style={{ overflow: 'auto', maxHeight: '600px' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: '120px' }}>WO Number</th>
                    <th style={{ minWidth: '180px' }}>Assembly</th>
                    <th>Rev</th>
                    <th style={{ minWidth: '150px' }}>Customer</th>
                    <th>Quantity</th>
                    <th>Time (min)</th>
                    <th>Min Start Date</th>
                    <th>Ship Date</th>
                    <th style={{ minWidth: '120px' }}>Current Location</th>
                    <th style={{ minWidth: '120px' }}>Material Status</th>
                    <th style={{ minWidth: '100px' }}>Cetec Order</th>
                    <th>Status</th>
                  </tr>
                  {/* Filter Row */}
                  <tr style={{ background: '#f8f9fa' }}>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.woNumber}
                        onChange={(e) => handleColumnFilterChange('woNumber', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.assembly}
                        onChange={(e) => handleColumnFilterChange('assembly', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.revision}
                        onChange={(e) => handleColumnFilterChange('revision', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.customer}
                        onChange={(e) => handleColumnFilterChange('customer', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.quantity}
                        onChange={(e) => handleColumnFilterChange('quantity', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.time}
                        onChange={(e) => handleColumnFilterChange('time', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      {/* No filter for Min Start (calculated on import) */}
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.shipDate}
                        onChange={(e) => handleColumnFilterChange('shipDate', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.location}
                        onChange={(e) => handleColumnFilterChange('location', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.materialStatus}
                        onChange={(e) => handleColumnFilterChange('materialStatus', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.cetecOrder}
                        onChange={(e) => handleColumnFilterChange('cetecOrder', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                    <th>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={columnFilters.status}
                        onChange={(e) => handleColumnFilterChange('status', e.target.value)}
                        style={{ width: '100%', padding: '0.25rem', fontSize: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((line, idx) => {
                    // Generate WO number preview (would be auto-generated on import)
                    const woNumber = `${line.ordernum}-${line.lineitem}`
                    
                    // Determine if this can be imported (has SMT operation data)
                    const canImport = line._calculated_time_minutes > 0
                    
                    // Determine material status
                    const shortAllocation = line.short_per_allocation || false
                    const shortShelf = line.short_per_shelf || false
                    
                    // Extract just the date from material_here_on (may contain extra text like "(+ Unset!)")
                    let materialHereOn = line.material_here_on || null
                    if (materialHereOn) {
                      // Extract date portion (YYYY-MM-DD format)
                      const dateMatch = materialHereOn.match(/\d{4}-\d{2}-\d{2}/)
                      materialHereOn = dateMatch ? dateMatch[0] : materialHereOn
                    }
                    
                    let materialStatus = 'Ready'
                    let materialColor = '#28a745' // Green
                    let materialIcon = '✓'
                    
                    if (shortAllocation && shortShelf) {
                      materialStatus = 'Shortage'
                      materialColor = '#dc3545' // Red
                      materialIcon = '✗'
                    } else if (shortAllocation || shortShelf) {
                      materialStatus = 'Partial'
                      materialColor = '#ffc107' // Yellow
                      materialIcon = '⚠'
                    }
                    
                    // Cetec work view URL
                    const cetecWorkViewUrl = line.ordline_id 
                      ? `https://${CETEC_CONFIG.domain}/react/otd/order/${line.ordline_id}/work_view`
                      : null
                    
                    return (
                      <tr key={idx} style={{ opacity: canImport ? 1 : 0.5 }}>
                        <td>
                          {cetecWorkViewUrl ? (
                            <a 
                              href={cetecWorkViewUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ 
                                fontSize: '0.875rem', 
                                textDecoration: 'none',
                                color: 'var(--primary)',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Open in Cetec ERP"
                            >
                              <code style={{ fontSize: '0.875rem' }}>{woNumber}</code>
                              <span style={{ fontSize: '0.7rem' }}>🔗</span>
                            </a>
                          ) : (
                            <code style={{ fontSize: '0.875rem' }}>{woNumber}</code>
                          )}
                        </td>
                        <td>
                          <strong>{line.prcpart || '—'}</strong>
                        </td>
                        <td>{line.revision || '—'}</td>
                        <td style={{ fontSize: '0.875rem' }}>{line.customer || '—'}</td>
                        <td>
                          <strong>{line.balancedue || line.release_qty || line.orig_order_qty || '—'}</strong>
                        </td>
                        <td>
                          {line._calculated_time_minutes !== undefined && line._calculated_time_minutes > 0 ? (
                            <strong style={{ color: 'var(--success)' }}>
                              {Math.round(line._calculated_time_minutes)}
                            </strong>
                          ) : (
                            <span style={{ color: '#dc3545' }}>⚠️ No data</span>
                          )}
                        </td>
                        <td>
                          <em style={{ color: '#6c757d', fontSize: '0.75rem' }}>(on import)</em>
                        </td>
                        <td>{line.promisedate || line.target_ship_date || '—'}</td>
                        <td>
                          {(() => {
                            // Color-code locations
                            const location = line._current_location || 'Unknown'
                            let locationColor = '#6c757d' // Default gray
                            
                            if (location.toUpperCase().includes('SMT PRODUCTION')) {
                              locationColor = '#28a745' // Green
                            } else if (location.toUpperCase().includes('KIT SHORT SHELF')) {
                              locationColor = '#fd7e14' // Orange
                            } else if (location.toUpperCase().includes('KITTING') || location.toUpperCase().includes('PICK')) {
                              locationColor = '#007bff' // Blue
                            } else if (location.toUpperCase().includes('WAREHOUSE')) {
                              locationColor = '#17a2b8' // Cyan
                            } else if (location.toUpperCase().includes('DOC CONTROL') || location.toUpperCase().includes('UNRELEASED')) {
                              locationColor = '#6c757d' // Gray
                            } else if (location.toUpperCase().includes('DEPANEL')) {
                              locationColor = '#6610f2' // Purple
                            } else if (location.toUpperCase().includes('ASSEMBLY')) {
                              locationColor = '#e83e8c' // Pink
                            } else if (location.toUpperCase().includes('COATING') || location.toUpperCase().includes('POTTING')) {
                              locationColor = '#6f42c1' // Indigo
                            } else if (location.toUpperCase().includes('INSPECTION') || location.toUpperCase().includes('QC')) {
                              locationColor = '#ffc107' // Yellow
                            } else if (location.toUpperCase().includes('SHIPPING') || location.toUpperCase().includes('SHIP')) {
                              locationColor = '#20c997' // Teal
                            } else if (location.toUpperCase().includes('RECEIVING') || location.toUpperCase().includes('RECEIVE')) {
                              locationColor = '#17a2b8' // Cyan
                            } else if (location.toUpperCase().includes('HOLD') || location.toUpperCase().includes('REWORK')) {
                              locationColor = '#dc3545' // Red
                            } else if (location !== 'Unknown') {
                              locationColor = '#6c757d' // Default for known locations
                            }
                            
                            return (
                              <span 
                                className="badge" 
                                style={{ 
                                  background: locationColor,
                                  color: 'white',
                                  fontSize: '0.75rem'
                                }}
                                title={line._current_location_full ? JSON.stringify(line._current_location_full, null, 2) : 'No location data'}
                              >
                                {location}
                              </span>
                            )
                          })()}
                        </td>
                        <td>
                          {(shortAllocation || shortShelf) && line.ordernum ? (
                            <a
                              href={`https://${CETEC_CONFIG.domain}/otd/allocation/list?reloaded=1&late=1&controlnum=${line.ordernum}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'none' }}
                              title={`View allocation in Cetec ERP (Allocation Short: ${shortAllocation}, Shelf Short: ${shortShelf}${materialHereOn ? `, Material Due: ${materialHereOn}` : ''})`}
                            >
                              <span 
                                className="badge" 
                                style={{ 
                                  background: materialColor,
                                  color: 'white',
                                  fontSize: '0.75rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  cursor: 'pointer',
                                  transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.target.style.opacity = '1'}
                              >
                                {materialIcon} {materialStatus} 🔗
                              </span>
                            </a>
                          ) : (
                            <span 
                              className="badge" 
                              style={{ 
                                background: materialColor,
                                color: 'white',
                                fontSize: '0.75rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title={`Allocation Short: ${shortAllocation}, Shelf Short: ${shortShelf}${materialHereOn ? `, Material Due: ${materialHereOn}` : ''}`}
                            >
                              {materialIcon} {materialStatus}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>
                          <code>{line.ordernum}</code>
                        </td>
                        <td>
                          {canImport ? (
                            <span className="badge" style={{ background: 'var(--success)', color: 'white', fontSize: '0.75rem' }}>
                              ✓ Ready
                            </span>
                          ) : (
                            <span className="badge" style={{ background: '#dc3545', color: 'white', fontSize: '0.75rem' }}>
                              Missing Data
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Preview - First Record */}
          {cetecData.length > 0 && (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
                First Record - All Fields Preview
              </h3>
              <div style={{ 
                background: 'var(--bg-secondary)', 
                padding: '1rem', 
                borderRadius: '8px',
                maxHeight: '400px',
                overflow: 'auto'
              }}>
                <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {JSON.stringify(cetecData[0], null, 2)}
                </pre>
              </div>
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '8px' }}>
                <strong>💡 Tip:</strong> Check if all the fields you need are present (production line, material status, etc.)
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

