import { useState } from 'react'
import { Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import axios from 'axios'

export default function CetecImport() {
  const [loading, setLoading] = useState(false)
  const [cetecData, setCetecData] = useState(null)
  const [rawCetecData, setRawCetecData] = useState(null) // Before filtering
  const [error, setError] = useState('')
  const [fetchStats, setFetchStats] = useState(null)
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

      let allOrderLines = []
      let batchesFetched = 0
      
      // Use date range strategy
      const startDate = filters.from_date ? new Date(filters.from_date) : new Date()
      const endDate = filters.to_date ? new Date(filters.to_date) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      
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
      
      console.log(`\n📅 Step 1: Fetching order lines (${weeks.length} weekly batches)`)
      
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
      
      console.log(`✅ Fetched ${allOrderLines.length} total order lines`)

      // Apply prodline filter
      if (filters.prodline) {
        allOrderLines = allOrderLines.filter(item => 
          item.production_line_description === filters.prodline
        )
        console.log(`   Filtered to prodline ${filters.prodline}: ${allOrderLines.length} records`)
      }

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
          // Get location maps
          const locationMapUrl = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_maps?preshared_token=${CETEC_CONFIG.token}&include_children=true`
          const locationMapResponse = await axios.get(locationMapUrl)
          const locationMaps = locationMapResponse.data || []

          // Find SMT PRODUCTION location
          const smtLocation = Array.isArray(locationMaps) 
            ? locationMaps.find(loc => {
                const locStr = JSON.stringify(loc).toUpperCase()
                return locStr.includes('SMT') && (locStr.includes('PRODUCTION') || locStr.includes('PROD'))
              })
            : null

          let operations = []
          let smtOperation = null

          if (smtLocation) {
            const ordlineMapId = smtLocation.ordline_map_id || smtLocation.id
            
            if (ordlineMapId) {
              // Get operations
              const operationsUrl = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_map/${ordlineMapId}/operations?preshared_token=${CETEC_CONFIG.token}`
              const operationsResponse = await axios.get(operationsUrl)
              operations = operationsResponse.data || []

              // Find SMT ASSEMBLY operation
              smtOperation = Array.isArray(operations)
                ? operations.find(op => {
                    const opStr = JSON.stringify(op).toUpperCase()
                    return opStr.includes('SMT') || opStr.includes('ASSEMBLY')
                  })
                : null
            }
          }

          // Combine all data
          combinedData.push({
            ...orderLine,
            _cetec_location_maps: locationMaps,
            _cetec_smt_location: smtLocation,
            _cetec_operations: operations,
            _cetec_smt_operation: smtOperation
          })

          successCount++

          // Delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (err) {
          console.error(`   Error for ordline ${ordlineId}:`, err.message)
          
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
      const withLocationMaps = combinedData.filter(item => item._cetec_location_maps && item._cetec_location_maps.length > 0).length

      console.log('\n═══════════════════════════════════════')
      console.log('📊 Combined Data Statistics:')
      console.log('═══════════════════════════════════════')
      console.log(`Total order lines: ${combinedData.length}`)
      console.log(`With location maps: ${withLocationMaps}`)
      console.log(`With SMT location: ${withSmtLocation}`)
      console.log(`With SMT operation: ${withSmtOperation}`)
      console.log('\nSample combined record:', combinedData[0])

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
          // STEP 1: Get location maps (without include_children)
          const locationMapUrl = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_maps?preshared_token=${CETEC_CONFIG.token}`
          console.log(`  [1] Fetching location maps (no children):`)
          console.log(`      ${locationMapUrl}`)
          
          const locationMapResponse = await axios.get(locationMapUrl)
          const locationMaps = locationMapResponse.data || []
          
          console.log(`  ✅ Found ${Array.isArray(locationMaps) ? locationMaps.length : 'unknown'} location maps`)
          console.log('     Full data:', locationMaps)

          // STEP 2: Also try with include_children=true
          const locationMapUrlWithChildren = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_maps?preshared_token=${CETEC_CONFIG.token}&include_children=true`
          console.log(`  [2] Fetching location maps (with children):`)
          console.log(`      ${locationMapUrlWithChildren}`)
          
          const locationMapWithChildrenResponse = await axios.get(locationMapUrlWithChildren)
          const locationMapsWithChildren = locationMapWithChildrenResponse.data || []
          
          console.log(`  ✅ Found ${Array.isArray(locationMapsWithChildren) ? locationMapsWithChildren.length : 'unknown'} location maps (with children)`)
          console.log('     Full data:', locationMapsWithChildren)

          // Use the one that has more data
          const locationMapsToUse = (Array.isArray(locationMapsWithChildren) && locationMapsWithChildren.length > 0) 
            ? locationMapsWithChildren 
            : locationMaps

          // STEP 3: Look for SMT PRODUCTION location
          const smtLocation = Array.isArray(locationMapsToUse) 
            ? locationMapsToUse.find(loc => {
                const locStr = JSON.stringify(loc).toUpperCase()
                return locStr.includes('SMT') && (locStr.includes('PRODUCTION') || locStr.includes('PROD'))
              })
            : null

          if (smtLocation) {
            console.log('  🎯 Found SMT location:', smtLocation)
            
            // STEP 4: Get operations for this location
            const ordlineMapId = smtLocation.ordline_map_id || smtLocation.id
            
            if (ordlineMapId) {
              const operationsUrl = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_map/${ordlineMapId}/operations?preshared_token=${CETEC_CONFIG.token}`
              console.log(`  [3] Fetching operations:`)
              console.log(`      ${operationsUrl}`)
              
              const operationsResponse = await axios.get(operationsUrl)
              const operations = operationsResponse.data || []
              
              console.log(`  ✅ Found ${Array.isArray(operations) ? operations.length : 'unknown'} operations`)
              console.log('     Full data:', operations)

              // STEP 5: Look for SMT ASSEMBLY operation
              const smtOperation = Array.isArray(operations)
                ? operations.find(op => {
                    const opStr = JSON.stringify(op).toUpperCase()
                    return opStr.includes('SMT') || opStr.includes('ASSEMBLY')
                  })
                : null

              if (smtOperation) {
                console.log('  🎯 Found SMT ASSEMBLY operation:', smtOperation)
                
                // STEP 6: If we have op_id, try to get more details
                const opId = smtOperation.operation_id || smtOperation.op_id || smtOperation.id
                
                if (opId) {
                  try {
                    const opDetailUrl = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordline/${ordlineId}/location_map/${ordlineMapId}/operation/${opId}?preshared_token=${CETEC_CONFIG.token}`
                    console.log(`  [4] Fetching operation details:`)
                    console.log(`      ${opDetailUrl}`)
                    
                    const opDetailResponse = await axios.get(opDetailUrl)
                    const opDetail = opDetailResponse.data || {}
                    
                    console.log('  ✅ Operation details:', opDetail)
                  } catch (err) {
                    console.log('  ⚠️ Could not fetch operation details:', err.message)
                  }
                }
              }

              results.push({
                ordlineId,
                orderNum: orderLine.ordernum,
                part: orderLine.prcpart,
                locationMaps: locationMapsToUse,
                smtLocation: smtLocation,
                operations: operations,
                smtOperation: smtOperation
              })
            }
          } else {
            console.log('  ⚠️ No SMT location found')
            console.log('  Available locations:', locationMapsToUse.map(loc => ({
              id: loc.id || loc.ordline_map_id,
              name: loc.location_name || loc.location || loc.name || 'unknown',
              data: loc
            })))
            
            results.push({
              ordlineId,
              orderNum: orderLine.ordernum,
              part: orderLine.prcpart,
              locationMaps: locationMapsToUse,
              smtLocation: null,
              operations: null,
              smtOperation: null
            })
          }

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

  const exportToCSV = () => {
    if (!cetecData || cetecData.length === 0) return

    // Create CSV header
    const headers = Object.keys(cetecData[0])
    
    // Create CSV rows
    const rows = cetecData.map(item => 
      headers.map(header => {
        const value = item[header]
        if (value === null || value === undefined) return ''
        if (typeof value === 'object') return JSON.stringify(value)
        return `"${String(value).replace(/"/g, '""')}"`
      })
    )

    // Combine
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cetec_ordlines_${new Date().toISOString().split('T')[0]}.csv`)
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

        <div style={{ marginTop: '1rem', padding: '1rem', background: '#e7f3ff', borderRadius: '8px', border: '1px solid #b3d9ff' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#004085' }}>
            🔬 Labor Plan / Operations Testing
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#004085', marginBottom: '0.75rem' }}>
            Test operation endpoints to find SMT PRODUCTION location and SMT ASSEMBLY operation with labor time.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={testOperationEndpoints}
              disabled={loading || !cetecData || cetecData.length === 0}
              style={{ background: '#28a745', color: 'white' }}
            >
              <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Testing...' : 'Test Operations (Recommended)'}
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
          {(!cetecData || cetecData.length === 0) && (
            <p style={{ fontSize: '0.75rem', color: '#856404', marginTop: '0.5rem', padding: '0.5rem', background: '#fff3cd', borderRadius: '4px' }}>
              ⚠️ Please fetch order lines first before testing operations
            </p>
          )}
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
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Cetec Order Lines ({cetecData.length})</h3>
              <button className="btn btn-secondary" onClick={exportToCSV}>
                <Download size={18} />
                Export to CSV
              </button>
            </div>

            <div style={{ overflow: 'auto', maxHeight: '600px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Line</th>
                    <th>Part #</th>
                    <th>Revision</th>
                    <th>Customer</th>
                    <th>Prod Line</th>
                    <th>Qty</th>
                    <th>Ship Date</th>
                    <th>WIP Date</th>
                    <th>Trans Code</th>
                  </tr>
                </thead>
                <tbody>
                  {cetecData.map((line, idx) => (
                    <tr key={idx}>
                      <td><code>{line.ordernum}</code></td>
                      <td>{line.lineitem}</td>
                      <td><strong>{line.prcpart}</strong></td>
                      <td>{line.revision}</td>
                      <td>{line.customer}</td>
                      <td>
                        <span 
                          className="badge" 
                          style={{ 
                            background: line.production_line_description === '200' ? 'var(--success)' : '#6c757d',
                            color: 'white'
                          }}
                        >
                          {line.production_line_description}
                        </span>
                      </td>
                      <td>{line.release_qty || line.orig_order_qty}</td>
                      <td>{line.target_ship_date}</td>
                      <td>{line.target_wip_date}</td>
                      <td><span className="badge badge-info">{line.transcode}</span></td>
                    </tr>
                  ))}
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

