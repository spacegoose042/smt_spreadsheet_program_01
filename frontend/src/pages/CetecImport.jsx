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
    '/api/v1/ordlines/list',
    '/api/v1/ordlines',
    '/goapis/ordlines/list',
    '/ordlines/list'
  ]

  const fetchCetecData = async (fetchAll = false) => {
    setLoading(true)
    setError('')
    setCetecData(null)
    setRawCetecData(null)
    setFetchStats(null)

    try {
      let allData = []
      let currentOffset = 0
      let hasMore = true
      let pagesLoaded = 0
      const maxPages = 20 // Safety limit

      while (hasMore && pagesLoaded < maxPages) {
        // Build query parameters
        const params = new URLSearchParams({
          preshared_token: CETEC_CONFIG.token
        })

        // Add filters (NO prodline - doesn't work in API)
        if (filters.intercompany) params.append('intercompany', 'true')
        if (filters.from_date) params.append('from_date', filters.from_date)
        if (filters.to_date) params.append('to_date', filters.to_date)
        if (filters.ordernum) params.append('ordernum', filters.ordernum)
        if (filters.customer) params.append('customer', filters.customer)
        if (filters.transcode) params.append('transcode', filters.transcode)
        
        // Try different limit/offset approaches - but start simple
        if (currentOffset === 0) {
          // For first page, try without pagination params to see default behavior
          params.append('format', 'json')
        } else {
          // For subsequent pages, try different pagination methods
          params.append('limit', filters.limit.toString())
          params.append('offset', currentOffset.toString())
          params.append('page', Math.floor(currentOffset / filters.limit) + 1)
          params.append('format', 'json')
        }

        const url = `https://${CETEC_CONFIG.domain}${API_ENDPOINTS[0]}?${params.toString()}`

        console.log(`Fetching page ${pagesLoaded + 1}, offset ${currentOffset}:`, url)

        const response = await axios.get(url)
        const pageData = response.data || []
        
        console.log(`Page ${pagesLoaded + 1}: ${pageData.length} records`)
        console.log(`Response headers:`, response.headers)
        console.log(`Response status:`, response.status)
        
        // Check if response has pagination info
        if (response.headers['x-total-count'] || response.headers['total-count']) {
          console.log('Total count from headers:', response.headers['x-total-count'] || response.headers['total-count'])
        }
        
        // Check if response has pagination metadata
        if (typeof pageData === 'object' && pageData.data) {
          console.log('Pagination metadata:', pageData)
          allData = [...allData, ...(pageData.data || [])]
        } else {
          allData = [...allData, ...pageData]
        }
        
        pagesLoaded++
        
        // Stop if we got less than the limit (last page) or if not fetching all
        if (pageData.length < filters.limit || !fetchAll) {
          hasMore = false
          console.log(`Stopping: got ${pageData.length} records (limit: ${filters.limit})`)
        } else {
          currentOffset += filters.limit
          console.log(`Continuing to next page, new offset: ${currentOffset}`)
        }
      }

      console.log(`Total fetched: ${allData.length} records from ${pagesLoaded} pages`)
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
        pagesLoaded: pagesLoaded,
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

    for (const endpoint of API_ENDPOINTS) {
      try {
        const params = new URLSearchParams({
          preshared_token: CETEC_CONFIG.token,
          limit: '100',
          format: 'json'
        })

        if (filters.intercompany) params.append('intercompany', 'true')

        const url = `https://${CETEC_CONFIG.domain}${endpoint}?${params.toString()}`
        console.log(`Testing endpoint: ${endpoint}`)

        const response = await axios.get(url)
        const data = response.data || []
        
        results.push({
          endpoint,
          status: response.status,
          count: Array.isArray(data) ? data.length : (data.data ? data.data.length : 0),
          hasData: Array.isArray(data) ? data.length > 0 : (data.data ? data.data.length > 0 : false),
          headers: response.headers,
          url
        })

        console.log(`Endpoint ${endpoint}: ${Array.isArray(data) ? data.length : 'unknown'} records`)
      } catch (err) {
        results.push({
          endpoint,
          status: err.response?.status || 'error',
          count: 0,
          hasData: false,
          error: err.message,
          url: `https://${CETEC_CONFIG.domain}${endpoint}`
        })
        console.log(`Endpoint ${endpoint}: ERROR - ${err.message}`)
      }
    }

    console.log('All endpoint results:', results)
    
    // Show results in a simple alert for now
    const workingEndpoints = results.filter(r => r.hasData)
    const message = workingEndpoints.length > 0 
      ? `Found ${workingEndpoints.length} working endpoints:\n${workingEndpoints.map(r => `${r.endpoint}: ${r.count} records`).join('\n')}`
      : 'No working endpoints found. Check console for details.'
    
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
            onClick={() => fetchCetecData(false)}
            disabled={loading}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Fetching...' : 'Fetch First Page'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => fetchCetecData(true)}
            disabled={loading}
            style={{ background: 'var(--success)', color: 'white' }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Fetching All...' : 'Fetch All Pages (Slow)'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={testAllEndpoints}
            disabled={loading}
            style={{ background: 'var(--warning)', color: 'white' }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Testing...' : 'Test All Endpoints'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={testRawAPI}
            disabled={loading}
            style={{ background: '#6c757d', color: 'white' }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Testing...' : 'Test Raw API (Simple)'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={testPaginationMethods}
            disabled={loading}
            style={{ background: '#17a2b8', color: 'white' }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Testing...' : 'Test Pagination Methods'}
          </button>
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
            • <strong>Prodline filter is client-side</strong> (API doesn't support it)<br />
            • "Fetch First Page" = Fast, {filters.limit} records max<br />
            • "Fetch All Pages" = Slow, fetches everything then filters<br />
            • Filters by <code>production_line_description</code> field
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
                  <strong>Pages Loaded:</strong> {fetchStats.pagesLoaded}
                </div>
                <div>
                  <strong>Total Fetched:</strong> {fetchStats.totalFetched} records
                </div>
                <div>
                  <strong>After Prodline Filter:</strong> {fetchStats.afterFilter} records
                </div>
                <div>
                  <strong>Filter Applied:</strong> {fetchStats.prodlineFilter || 'None'}
                </div>
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

