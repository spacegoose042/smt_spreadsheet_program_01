import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMetabaseDashboard, executeDashboardWithParams, testMetabaseConnection, metabaseLogin } from '../api'
import { Search, Loader2, CheckCircle2, XCircle, Info, Database, Play, TestTube } from 'lucide-react'

export default function MetabaseDashboardExplorer() {
  const [dashboardId, setDashboardId] = useState('64')
  const [prodline, setProdline] = useState('300')
  const [buildOperation, setBuildOperation] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [ordlineStatus, setOrdlineStatus] = useState('')
  const [prcPartPartial, setPrcPartPartial] = useState('')
  const [prodStatus, setProdStatus] = useState('')
  const [mode, setMode] = useState('info') // 'info' or 'execute'
  const [hasRequested, setHasRequested] = useState(false) // Track if user has clicked a button
  const [testConnection, setTestConnection] = useState(false) // Track if testing connection
  const [showLogin, setShowLogin] = useState(false) // Show login form
  const [metabaseUsername, setMetabaseUsername] = useState('')
  const [metabasePassword, setMetabasePassword] = useState('')
  const [loginStatus, setLoginStatus] = useState(null) // Login result

  const { data: connectionTest, isLoading: isLoadingConnection, error: connectionError, refetch: refetchConnection } = useQuery({
    queryKey: ['metabaseConnectionTest'],
    queryFn: async () => {
      try {
        const response = await testMetabaseConnection()
        return response.data || response
      } catch (error) {
        console.error('Metabase connection test error:', error)
        const errorMessage = error.response?.data?.detail || 
                            error.response?.data?.message || 
                            error.message || 
                            'Failed to test connection'
        const customError = new Error(errorMessage)
        customError.statusCode = error.response?.status
        customError.response = error.response
        throw customError
      }
    },
    enabled: testConnection,
    retry: false,
  })

  const { data: dashboardInfo, isLoading: isLoadingInfo, error: errorInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['metabaseDashboard', dashboardId],
    queryFn: async () => {
      try {
        const response = await getMetabaseDashboard(dashboardId)
        console.log('Dashboard response:', response)
        // Handle both response.data and direct response
        const data = response.data || response
        console.log('Dashboard data:', data)
        return data
      } catch (error) {
        console.error('Metabase dashboard error:', error)
        console.error('Error response:', error.response)
        // Extract error message but don't let it redirect
        const errorMessage = error.response?.data?.detail || 
                            error.response?.data?.message || 
                            error.message || 
                            'Failed to fetch dashboard'
        const statusCode = error.response?.status
        
        // Create a custom error that won't trigger redirect
        const customError = new Error(errorMessage)
        customError.statusCode = statusCode
        customError.response = error.response
        throw customError
      }
    },
    enabled: mode === 'info' && !!dashboardId && hasRequested,
    retry: false, // Don't retry on error
  })

  const { data: dashboardResults, isLoading: isLoadingResults, error: errorResults, refetch: refetchResults } = useQuery({
    queryKey: ['metabaseDashboardQuery', dashboardId, prodline, buildOperation, orderNumber, ordlineStatus, prcPartPartial, prodStatus],
    queryFn: async () => {
      try {
        const response = await executeDashboardWithParams(dashboardId, {
          prodline: prodline || undefined,
          build_operation: buildOperation || undefined,
          order_number: orderNumber || undefined,
          ordline_status: ordlineStatus || undefined,
          prc_part_partial: prcPartPartial || undefined,
          prod_status: prodStatus || undefined,
        })
        return response.data || response
      } catch (error) {
        console.error('Metabase dashboard query error:', error)
        // Extract error message but don't let it redirect
        const errorMessage = error.response?.data?.detail || 
                            error.response?.data?.message || 
                            error.message || 
                            'Failed to execute dashboard'
        const statusCode = error.response?.status
        
        // Create a custom error that won't trigger redirect
        const customError = new Error(errorMessage)
        customError.statusCode = statusCode
        customError.response = error.response
        throw customError
      }
    },
    enabled: mode === 'execute' && !!dashboardId && hasRequested,
    retry: false, // Don't retry on error
  })

  const isLoading = isLoadingInfo || isLoadingResults || isLoadingConnection

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
                setTestConnection(true)
                setTimeout(() => refetchConnection(), 100)
              }}
              disabled={isLoading}
              className="btn btn-secondary"
              style={{ marginTop: '1.5rem' }}
            >
              {isLoadingConnection ? (
                <>
                  <Loader2 size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube size={18} style={{ marginRight: '0.5rem' }} />
                  Test Connection
                </>
              )}
            </button>
            <button
              onClick={() => setShowLogin(!showLogin)}
              className="btn btn-secondary"
              style={{ marginTop: '1.5rem', marginLeft: '0.5rem' }}
            >
              {showLogin ? 'Hide' : 'Show'} Login
            </button>
            <button
              onClick={() => {
                setHasRequested(true)
                // Small delay to ensure state is set before query runs
                setTimeout(() => {
                  if (mode === 'info') refetchInfo()
                  else refetchResults()
                }, 100)
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
            
            {(dashboardInfo?.success || dashboardInfo?.data?.success) ? (
              <div>
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <strong>Dashboard Name:</strong> {dashboardInfo?.dashboard?.name || dashboardInfo?.data?.dashboard?.name || 'Unknown'}<br />
                  <strong>Dashboard ID:</strong> {dashboardInfo?.dashboard_id || dashboardInfo?.data?.dashboard_id || dashboardId}<br />
                  <strong>Number of Cards:</strong> {(dashboardInfo?.card_ids || dashboardInfo?.data?.card_ids || []).length}
                  {dashboardInfo?.note && (
                    <>
                      <br />
                      <em style={{ fontSize: '0.9rem', color: '#6c757d' }}>{dashboardInfo.note}</em>
                    </>
                  )}
                </div>

                {(dashboardInfo?.card_ids || dashboardInfo?.data?.card_ids || []).length > 0 && (
                  <div>
                    <h3 style={{ marginBottom: '0.5rem' }}>Cards on Dashboard:</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {(dashboardInfo?.dashcards || dashboardInfo?.data?.dashcards || []).map((dashcard, idx) => (
                        <li key={dashcard.card_id || idx} style={{ 
                          padding: '0.5rem', 
                          marginBottom: '0.5rem', 
                          backgroundColor: '#e9ecef',
                          borderRadius: '4px'
                        }}>
                          <strong>Card {dashcard.card_id}</strong>: {dashcard.card_name || 'Unknown'}
                          {dashcard.dashcard_id && (
                            <span style={{ fontSize: '0.85rem', color: '#6c757d', marginLeft: '0.5rem' }}>
                              (Dashcard {dashcard.dashcard_id})
                            </span>
                          )}
                        </li>
                      ))}
                      {/* Fallback if dashcards not available */}
                      {(!dashboardInfo?.dashcards && !dashboardInfo?.data?.dashcards) && 
                       (dashboardInfo?.card_ids || dashboardInfo?.data?.card_ids || []).map((cardId, idx) => (
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
                    {JSON.stringify(dashboardInfo?.dashboard || dashboardInfo?.data?.dashboard || dashboardInfo, null, 2)}
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

      {/* Metabase Login Form */}
      {showLogin && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: '1rem' }}>Metabase Session Login</h3>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#6c757d' }}>
              The API key has limited permissions. Use session login to access dashboards, cards, and databases.
            </p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Metabase Username</span>
                <input
                  type="text"
                  value={metabaseUsername}
                  onChange={(e) => setMetabaseUsername(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Metabase Password</span>
                <input
                  type="password"
                  value={metabasePassword}
                  onChange={(e) => setMetabasePassword(e.target.value)}
                  placeholder="password"
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '1rem'
                  }}
                />
              </label>
              <button
                onClick={async () => {
                  try {
                    setLoginStatus({ loading: true })
                    const response = await metabaseLogin(metabaseUsername, metabasePassword)
                    setLoginStatus({ success: true, message: response.data?.message || 'Login successful!' })
                    setMetabasePassword('')
                  } catch (error) {
                    setLoginStatus({ 
                      success: false, 
                      message: error.response?.data?.detail || error.message || 'Login failed' 
                    })
                  }
                }}
                disabled={!metabaseUsername || !metabasePassword || loginStatus?.loading}
                className="btn btn-primary"
              >
                {loginStatus?.loading ? (
                  <>
                    <Loader2 size={18} style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                    Logging in...
                  </>
                ) : (
                  'Login to Metabase'
                )}
              </button>
            </div>
            {loginStatus && !loginStatus.loading && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                borderRadius: '6px',
                backgroundColor: loginStatus.success ? '#d4edda' : '#f8d7da',
                color: loginStatus.success ? '#155724' : '#721c24'
              }}>
                {loginStatus.success ? '✅ ' : '❌ '}
                {loginStatus.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Test Results */}
      {testConnection && connectionTest && (
        <div className="card">
          <div className="card-body">
            <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TestTube size={20} />
              Connection Test Results
            </h2>
            
            {connectionTest.success ? (
              <div style={{ padding: '1rem', backgroundColor: '#d4edda', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <CheckCircle2 size={20} color="#28a745" style={{ marginRight: '0.5rem' }} />
                  <strong>Connection Successful!</strong>
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <strong>Working Format:</strong> {connectionTest.working_format || 'Unknown'}<br />
                  <strong>Status Code:</strong> {connectionTest.status_code}
                </div>
                {connectionTest.endpoint_tests && connectionTest.endpoint_tests.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <strong>Endpoint Access Test:</strong>
                    <table style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e9ecef' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #dee2e6' }}>Endpoint</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #dee2e6' }}>Status</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #dee2e6' }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectionTest.endpoint_tests.map((test, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '0.5rem', border: '1px solid #dee2e6' }}>{test.endpoint}</td>
                            <td style={{ padding: '0.5rem', border: '1px solid #dee2e6' }}>
                              {test.success ? (
                                <span style={{ color: '#28a745', fontWeight: 'bold' }}>✅ {test.status_code}</span>
                              ) : (
                                <span style={{ color: '#dc3545', fontWeight: 'bold' }}>❌ {test.status_code || 'Error'}</span>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem', border: '1px solid #dee2e6', fontSize: '0.85rem' }}>
                              {test.success ? (
                                <span>{test.message || 'Success'}{test.count !== undefined ? ` (${test.count} items)` : ''}</span>
                              ) : (
                                <span>{test.message || test.error || 'Failed'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {connectionTest.tested_formats && (
                  <details style={{ marginTop: '1rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 500 }}>All Tested Formats</summary>
                    <pre style={{ 
                      marginTop: '0.5rem', 
                      padding: '1rem', 
                      backgroundColor: '#f8f9fa', 
                      borderRadius: '6px',
                      overflow: 'auto',
                      fontSize: '0.85rem'
                    }}>
                      {JSON.stringify(connectionTest.tested_formats, null, 2)}
                    </pre>
                  </details>
                )}
                <details style={{ marginTop: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Full Test Results (JSON)</summary>
                  <pre style={{ 
                    marginTop: '0.5rem', 
                    padding: '1rem', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '6px',
                    overflow: 'auto',
                    fontSize: '0.8rem'
                  }}>
                    {JSON.stringify(connectionTest, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div style={{ padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffc107' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <XCircle size={20} color="#dc3545" style={{ marginRight: '0.5rem' }} />
                  <strong>Connection Failed</strong>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  {connectionTest.message || 'Failed to connect to Metabase'}
                </div>
                {connectionTest.tested_formats && (
                  <div style={{ marginTop: '1rem' }}>
                    <strong>Tested Formats:</strong>
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                      {connectionTest.tested_formats.map((format, idx) => (
                        <li key={idx} style={{ marginBottom: '0.5rem' }}>
                          <strong>{format.format}:</strong> {format.success ? '✅ Success' : `❌ ${format.message || format.error || 'Failed'}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details style={{ marginTop: '1rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Full Test Results</summary>
                  <pre style={{ 
                    marginTop: '0.5rem', 
                    padding: '1rem', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '6px',
                    overflow: 'auto',
                    fontSize: '0.8rem'
                  }}>
                    {JSON.stringify(connectionTest, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      )}

      {testConnection && connectionError && (
        <div className="card">
          <div className="card-body" style={{ 
            color: '#dc3545',
            padding: '1.5rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <XCircle size={20} style={{ marginRight: '0.5rem' }} />
              <strong>Connection Test Error</strong>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {connectionError?.message || 
               connectionError?.response?.data?.detail || 
               'Failed to test connection'}
            </div>
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
      {!isLoading && hasRequested && mode === 'info' && (errorInfo || dashboardInfo?.error) && (
        <div className="card">
          <div className="card-body" style={{ 
            color: '#dc3545',
            padding: '1.5rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <XCircle size={20} style={{ marginRight: '0.5rem' }} />
              <strong>Error Loading Dashboard</strong>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {errorInfo?.message || 
               errorInfo?.response?.data?.detail || 
               dashboardInfo?.error?.message || 
               'Failed to fetch dashboard'}
            </div>
            {errorInfo?.response?.status && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                Status Code: {errorInfo.response.status}
              </div>
            )}
            {errorInfo?.response?.data && (
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Show Full Error Details</summary>
                <pre style={{ 
                  marginTop: '0.5rem', 
                  padding: '1rem', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.8rem'
                }}>
                  {JSON.stringify(errorInfo.response.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      {!isLoading && hasRequested && mode === 'execute' && (errorResults || dashboardResults?.error) && (
        <div className="card">
          <div className="card-body" style={{ 
            color: '#dc3545',
            padding: '1.5rem',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <XCircle size={20} style={{ marginRight: '0.5rem' }} />
              <strong>Error Executing Dashboard</strong>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {errorResults?.message || 
               errorResults?.response?.data?.detail || 
               dashboardResults?.error?.message || 
               'Failed to execute dashboard'}
            </div>
            {errorResults?.response?.status && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6c757d' }}>
                Status Code: {errorResults.response.status}
              </div>
            )}
            {errorResults?.response?.data && (
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Show Full Error Details</summary>
                <pre style={{ 
                  marginTop: '0.5rem', 
                  padding: '1rem', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.8rem'
                }}>
                  {JSON.stringify(errorResults.response.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

