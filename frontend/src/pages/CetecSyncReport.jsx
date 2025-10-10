import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, Calendar } from 'lucide-react'
import { getCetecSyncLogs } from '../api'

export default function CetecSyncReport() {
  const [days, setDays] = useState(30)
  const [filters, setFilters] = useState({
    woNumber: '',
    changeType: '',
    fieldName: ''
  })

  const { data: syncLogs, isLoading, refetch } = useQuery({
    queryKey: ['cetec-sync-logs', days],
    queryFn: async () => {
      const response = await getCetecSyncLogs(days)
      return response.data
    }
  })

  // Filter logs
  const filteredLogs = syncLogs ? syncLogs.filter(log => {
    const woNumber = (log.wo_number || '').toLowerCase()
    const changeType = (log.change_type || '').toLowerCase()
    const fieldName = (log.field_name || '').toLowerCase()
    
    return (
      woNumber.includes(filters.woNumber.toLowerCase()) &&
      changeType.includes(filters.changeType.toLowerCase()) &&
      fieldName.includes(filters.fieldName.toLowerCase())
    )
  }) : []

  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0) return

    const headers = [
      'Sync Date',
      'WO Number',
      'Change Type',
      'Field',
      'Old Value',
      'New Value',
      'Cetec Ordline ID'
    ]
    
    const rows = filteredLogs.map(log => {
      const syncDate = new Date(log.sync_date).toLocaleString()
      return [
        `"${syncDate}"`,
        `"${log.wo_number || ''}"`,
        `"${log.change_type || ''}"`,
        `"${log.field_name || ''}"`,
        `"${log.old_value || ''}"`,
        `"${log.new_value || ''}"`,
        log.cetec_ordline_id || ''
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cetec_sync_report_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Group logs by sync date
  const groupedLogs = filteredLogs.reduce((acc, log) => {
    const dateKey = new Date(log.sync_date).toLocaleDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(log)
    return acc
  }, {})

  const getChangeTypeColor = (changeType) => {
    switch (changeType) {
      case 'created': return '#28a745'
      case 'date_changed': return '#007bff'
      case 'qty_changed': return '#ffc107'
      case 'location_changed': return '#17a2b8'
      case 'material_changed': return '#6610f2'
      default: return '#6c757d'
    }
  }

  const getChangeTypeIcon = (changeType) => {
    switch (changeType) {
      case 'created': return '✨'
      case 'date_changed': return '📅'
      case 'qty_changed': return '📦'
      case 'location_changed': return '📍'
      case 'material_changed': return '🔧'
      default: return '•'
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cetec Sync Report</h1>
          <p className="page-description">View changes from Cetec ERP imports</p>
        </div>
        <button className="btn btn-primary" onClick={() => refetch()}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ marginBottom: '0.25rem' }}>
                <Calendar size={14} style={{ marginRight: '0.25rem' }} />
                Show Last
              </label>
              <select 
                className="form-select"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                style={{ width: 'auto', minWidth: '120px' }}
              >
                <option value={7}>7 Days</option>
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>

          <button className="btn btn-secondary" onClick={exportToCSV} disabled={!filteredLogs || filteredLogs.length === 0}>
            <Download size={18} />
            Export to CSV
          </button>
        </div>
      </div>

      {/* Statistics */}
      {syncLogs && syncLogs.length > 0 && (
        <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-label">Total Changes</div>
            <div className="stat-value">{filteredLogs.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Created</div>
            <div className="stat-value" style={{ color: '#28a745' }}>
              {filteredLogs.filter(l => l.change_type === 'created').length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Date Changes</div>
            <div className="stat-value" style={{ color: '#007bff' }}>
              {filteredLogs.filter(l => l.change_type === 'date_changed').length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Qty Changes</div>
            <div className="stat-value" style={{ color: '#ffc107' }}>
              {filteredLogs.filter(l => l.change_type === 'qty_changed').length}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Filters</h3>
        <div className="grid grid-cols-3">
          <div className="form-group">
            <label className="form-label">WO Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search..."
              value={filters.woNumber}
              onChange={(e) => setFilters({ ...filters, woNumber: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Change Type</label>
            <select
              className="form-select"
              value={filters.changeType}
              onChange={(e) => setFilters({ ...filters, changeType: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="created">Created</option>
              <option value="date_changed">Date Changed</option>
              <option value="qty_changed">Qty Changed</option>
              <option value="location_changed">Location Changed</option>
              <option value="material_changed">Material Changed</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Field Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search..."
              value={filters.fieldName}
              onChange={(e) => setFilters({ ...filters, fieldName: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '1rem' }}>Loading sync logs...</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!syncLogs || syncLogs.length === 0) && (
        <div className="empty-state">
          <Calendar size={48} />
          <h3>No Sync History</h3>
          <p>No Cetec import has been run yet.</p>
        </div>
      )}

      {/* Changes Table - Grouped by Date */}
      {!isLoading && syncLogs && syncLogs.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
            Change History ({filteredLogs.length} changes)
          </h3>

          {Object.entries(groupedLogs).map(([dateKey, logs]) => (
            <div key={dateKey} style={{ marginBottom: '2rem' }}>
              <h4 style={{ 
                fontSize: '1rem', 
                fontWeight: 600, 
                marginBottom: '0.75rem', 
                color: '#495057',
                borderBottom: '2px solid #dee2e6',
                paddingBottom: '0.5rem'
              }}>
                {dateKey} ({logs.length} changes)
              </h4>

              <div style={{ overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>WO Number</th>
                      <th>Change Type</th>
                      <th>Field</th>
                      <th>Old Value</th>
                      <th>New Value</th>
                      <th>Cetec Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '0.875rem' }}>
                          {new Date(log.sync_date).toLocaleTimeString()}
                        </td>
                        <td>
                          <code>{log.wo_number}</code>
                        </td>
                        <td>
                          <span 
                            className="badge" 
                            style={{ 
                              background: getChangeTypeColor(log.change_type),
                              color: 'white',
                              fontSize: '0.75rem'
                            }}
                          >
                            {getChangeTypeIcon(log.change_type)} {log.change_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>
                          {log.field_name || '—'}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#dc3545' }}>
                          {log.old_value || '—'}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#28a745', fontWeight: 500 }}>
                          {log.new_value || '—'}
                        </td>
                        <td>
                          {log.cetec_ordline_id && (
                            <a
                              href={`https://sandy.cetecerp.com/react/otd/order/${log.cetec_ordline_id}/work_view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              View in Cetec 🔗
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



