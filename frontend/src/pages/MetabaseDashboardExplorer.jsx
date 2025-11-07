import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMetabaseDashboard, executeDashboardWithParams } from '../api'
import { Search, Loader2, CheckCircle2, XCircle, Info, Database, Play } from 'lucide-react'

export default function MetabaseDashboardExplorer() {
  const [dashboardId, setDashboardId] = useState('64')
  const [prodline, setProdline] = useState('300')
  const [buildOperation, setBuildOperation] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [ordlineStatus, setOrdlineStatus] = useState('')
  const [prcPartPartial, setPrcPartPartial] = useState('')
  const [prodStatus, setProdStatus] = useState('')
  const [mode, setMode] = useState('info') // 'info' or 'execute'

  const { data: dashboardInfo, isLoading: isLoadingInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['metabaseDashboard', dashboardId],
    queryFn: () => getMetabaseDashboard(dashboardId),
    enabled: mode === 'info' && !!dashboardId,
  })

  const { data: dashboardResults, isLoading: isLoadingResults, refetch: refetchResults } = useQuery({
    queryKey: ['metabaseDashboardQuery', dashboardId, prodline, buildOperation, orderNumber, ordlineStatus, prcPartPartial, prodStatus],
    queryFn: () => executeDashboardWithParams(dashboardId, {
      prodline: prodline || undefined,
      build_operation: buildOperation || undefined,
      order_number: orderNumber || undefined,
      ordline_status: ordlineStatus || undefined,
      prc_part_partial: prcPartPartial || undefined,
      prod_status: prodStatus || undefined,
    }),
    enabled: mode === 'execute' && !!dashboardId,
  })

  const isLoading = isLoadingInfo || isLoadingResults

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Metabase Dashboard Explorer</h1>
          <p className="page-description">
            Explore and execute Metabase dashboards to test queries and data
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Dashboard ID</span>
              <input
                type="text"
                value={dashboardId}
                onChange={(e) => setDashboardId(e.target.value)}
                placeholder="64"
                style={{
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '1rem',
                  width: '100px'
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '1rem'
                }}
              >
                <option value="info">View Dashboard Info</option>
                <option value="execute">Execute Dashboard</option>
              </select>
            </label>
            <button
              onClick={() => {
                if (mode === 'info') refetchInfo()
                else refetchResults()
              }}
              disabled={isLoading}
              className="btn btn-primary"
              style={{ marginTop: '1.5rem' }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                  Loading...
                </>
              ) : (
                <>
                  {mode === 'info' ? (
                    <>
                      <Database size={18} style={{ marginRight: '0.5rem' }} />
                      Get Info
                    </>
                  ) : (
                    <>
                      <Play size={18} style={{ marginRight: '0.5rem' }} />
                      Execute
                    </>
                  )}
                </>
              )}
            </button>
          </div>

          {/* Filter Parameters (only show when executing) */}
          {mode === 'execute' && (
            <div style={{ 
              borderTop: '1px solid #e9ecef', 
              paddingTop: '1rem', 
              marginTop: '1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Prod Line</span>
                <input
                  type="text"
                  value={prodline}
                  onChange={(e) => setProdline(e.target.value)}
                  placeholder="300"
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Build Operation</span>
                <input
                  type="text"
                  value={buildOperation}
                  onChange={(e) => setBuildOperation(e.target.value)}
                  placeholder=""
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Order Number</span>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder=""
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Ordline Status</span>
                <input
                  type="text"
                  value={ordlineStatus}
                  onChange={(e) => setOrdlineStatus(e.target.value)}
                  placeholder=""
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Part (Partial)</span>
                <input
                  type="text"
                  value={prcPartPartial}
                  onChange={(e) => setPrcPartPartial(e.target.value)}
                  placeholder=""
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Prod Status</span>
                <input
                  type="text"
                  value={prodStatus}
                  onChange={(e) => setProdStatus(e.target.value)}
                  placeholder=""
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Info Results */}
      {mode === 'info' && dashboardInfo && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={20} />
              Dashboard Information
            </h2>
            
            {dashboardInfo.data?.success ? (
              <div>
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <strong>Dashboard Name:</strong> {dashboardInfo.data.dashboard?.name || 'Unknown'}<br />
                  <strong>Dashboard ID:</strong> {dashboardInfo.data.dashboard_id}<br />
                  <strong>Number of Cards:</strong> {dashboardInfo.data.card_ids?.length || 0}
                </div>

                {dashboardInfo.data.card_ids && dashboardInfo.data.card_ids.length > 0 && (
                  <div>
                    <h3 style={{ marginBottom: '0.5rem' }}>Cards on Dashboard:</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {dashboardInfo.data.card_ids.map((cardId, idx) => (
                        <li key={cardId} style={{ 
                          padding: '0.5rem', 
                          marginBottom: '0.5rem', 
                          backgroundColor: '#e9ecef',
                          borderRadius: '4px'
                        }}>
                          Card ID: {cardId}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <details style={{ marginTop: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Full Dashboard JSON</summary>
                  <pre style={{ 
                    marginTop: '0.5rem', 
                    padding: '1rem', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '6px',
                    overflow: 'auto',
                    maxHeight: '400px'
                  }}>
                    {JSON.stringify(dashboardInfo.data.dashboard, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div style={{ color: '#dc3545' }}>
                <XCircle size={20} style={{ marginRight: '0.5rem' }} />
                Failed to fetch dashboard information
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Execution Results */}
      {mode === 'execute' && dashboardResults && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Play size={20} />
              Execution Results
            </h2>
            
            {dashboardResults.data?.success ? (
              <div>
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#d4edda', borderRadius: '6px' }}>
                  <strong>Dashboard:</strong> {dashboardResults.data.dashboard_name || 'Unknown'}<br />
                  <strong>Cards Executed:</strong> {dashboardResults.data.cards_executed || 0}<br />
                  <strong>Parameters Applied:</strong> {JSON.stringify(dashboardResults.data.parameters, null, 2)}
                </div>

                {dashboardResults.data.results && dashboardResults.data.results.length > 0 && (
                  <div>
                    <h3 style={{ marginBottom: '1rem' }}>Card Results:</h3>
                    {dashboardResults.data.results.map((result, idx) => (
                      <div key={idx} style={{ 
                        marginBottom: '1.5rem',
                        padding: '1rem',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        backgroundColor: result.success ? '#f8f9fa' : '#fff3cd'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          {result.success ? (
                            <CheckCircle2 size={18} color="#28a745" />
                          ) : (
                            <XCircle size={18} color="#dc3545" />
                          )}
                          <strong>Card {result.card_id}: {result.card_name}</strong>
                        </div>
                        
                        {result.success ? (
                          <div>
                            <div style={{ marginBottom: '0.5rem' }}>
                              <strong>Rows Returned:</strong> {result.row_count || 0}
                            </div>
                            
                            {result.data?.data?.rows && result.data.data.rows.length > 0 && (
                              <details>
                                <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.5rem' }}>
                                  View Data ({result.data.data.rows.length} rows)
                                </summary>
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                                    <thead>
                                      <tr style={{ backgroundColor: '#e9ecef' }}>
                                        {result.data.data.cols?.map((col, colIdx) => (
                                          <th key={colIdx} style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #dee2e6' }}>
                                            {col.display_name || col.name || `Column ${colIdx + 1}`}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {result.data.data.rows.slice(0, 100).map((row, rowIdx) => (
                                        <tr key={rowIdx}>
                                          {row.map((cell, cellIdx) => (
                                            <td key={cellIdx} style={{ padding: '0.5rem', border: '1px solid #dee2e6' }}>
                                              {cell !== null && cell !== undefined ? String(cell) : ''}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {result.data.data.rows.length > 100 && (
                                    <p style={{ marginTop: '0.5rem', fontStyle: 'italic', color: '#6c757d' }}>
                                      Showing first 100 of {result.data.data.rows.length} rows
                                    </p>
                                  )}
                                </div>
                              </details>
                            )}
                            
                            <details style={{ marginTop: '0.5rem' }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Full Response JSON</summary>
                              <pre style={{ 
                                marginTop: '0.5rem', 
                                padding: '1rem', 
                                backgroundColor: '#f8f9fa', 
                                borderRadius: '6px',
                                overflow: 'auto',
                                maxHeight: '400px',
                                fontSize: '0.85rem'
                              }}>
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ) : (
                          <div style={{ color: '#dc3545' }}>
                            <strong>Error:</strong> {result.error || 'Unknown error'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: '#dc3545' }}>
                <XCircle size={20} style={{ marginRight: '0.5rem' }} />
                Failed to execute dashboard
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
            <p>Loading...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && mode === 'info' && dashboardInfo?.error && (
        <div className="card">
          <div className="card-body" style={{ color: '#dc3545' }}>
            <XCircle size={20} style={{ marginRight: '0.5rem' }} />
            Error: {dashboardInfo.error.message || 'Failed to fetch dashboard'}
          </div>
        </div>
      )}

      {!isLoading && mode === 'execute' && dashboardResults?.error && (
        <div className="card">
          <div className="card-body" style={{ color: '#dc3545' }}>
            <XCircle size={20} style={{ marginRight: '0.5rem' }} />
            Error: {dashboardResults.error.message || 'Failed to execute dashboard'}
          </div>
        </div>
      )}
    </div>
  )
}

