import { useState } from 'react'
import { Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import axios from 'axios'

export default function CetecImport() {
  const [loading, setLoading] = useState(false)
  const [cetecData, setCetecData] = useState(null)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    intercompany: true,
    from_date: '',
    to_date: '',
    ordernum: '',
    customer: '',
    transcode: 'SA,SN' // Build and Stock orders
  })

  const CETEC_CONFIG = {
    domain: 'sandy.cetecerp.com',
    token: '123matthatesbrant123'
  }

  const fetchCetecData = async () => {
    setLoading(true)
    setError('')
    setCetecData(null)

    try {
      // Build query parameters
      const params = new URLSearchParams({
        preshared_token: CETEC_CONFIG.token
      })

      // Add filters
      if (filters.intercompany) params.append('intercompany', 'true')
      if (filters.from_date) params.append('from_date', filters.from_date)
      if (filters.to_date) params.append('to_date', filters.to_date)
      if (filters.ordernum) params.append('ordernum', filters.ordernum)
      if (filters.customer) params.append('customer', filters.customer)
      if (filters.transcode) params.append('transcode', filters.transcode)

      const url = `https://${CETEC_CONFIG.domain}/goapis/api/v1/ordlines/list?${params.toString()}`

      console.log('Fetching from Cetec:', url)

      const response = await axios.get(url)
      
      setCetecData(response.data)
      console.log('Cetec data:', response.data)
    } catch (err) {
      console.error('Cetec API error:', err)
      setError(err.response?.data?.message || err.message || 'Failed to fetch from Cetec')
    } finally {
      setLoading(false)
    }
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
        
        <div className="grid grid-cols-3">
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
        </div>

        <div className="grid grid-cols-3">
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

        <button
          className="btn btn-primary"
          onClick={fetchCetecData}
          disabled={loading}
        >
          <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Fetching...' : 'Fetch from Cetec'}
        </button>
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
                <strong>Success!</strong> Found {cetecData.length} order line{cetecData.length !== 1 ? 's' : ''} from Cetec
              </div>
            </div>
          </div>

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
                    <th>Qty</th>
                    <th>Ship Date</th>
                    <th>WIP Date</th>
                    <th>Trans Code</th>
                    <th>Ship Type</th>
                    <th>Order Type</th>
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
                      <td>{line.release_qty}</td>
                      <td>{line.target_ship_date}</td>
                      <td>{line.target_wip_date}</td>
                      <td><span className="badge badge-info">{line.transcode}</span></td>
                      <td><span className="badge badge-secondary">{line.shiptype}</span></td>
                      <td><span className="badge badge-secondary">{line.ordertype}</span></td>
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

