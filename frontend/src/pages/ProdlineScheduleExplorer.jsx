import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { testCetecScheduleEndpoints, getScheduledWorkForProdline } from '../api'
import { Search, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react'

export default function ProdlineScheduleExplorer() {
  const [prodline, setProdline] = useState('300')
  const [testMode, setTestMode] = useState('test') // 'test' or 'scheduled'

  const { data: testResults, isLoading: isLoadingTest, refetch: refetchTest } = useQuery({
    queryKey: ['testCetecEndpoints', prodline],
    queryFn: () => testCetecScheduleEndpoints(prodline),
    enabled: testMode === 'test' && !!prodline,
  })

  const { data: scheduledWork, isLoading: isLoadingScheduled, refetch: refetchScheduled } = useQuery({
    queryKey: ['scheduledWork', prodline],
    queryFn: () => getScheduledWorkForProdline(prodline),
    enabled: testMode === 'scheduled' && !!prodline,
  })

  const isLoading = isLoadingTest || isLoadingScheduled

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Production Line Schedule Explorer</h1>
          <p className="page-description">
            Explore Cetec API endpoints to find schedule data for production lines
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Production Line</span>
              <input
                type="text"
                value={prodline}
                onChange={(e) => setProdline(e.target.value)}
                placeholder="300"
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
                value={testMode}
                onChange={(e) => setTestMode(e.target.value)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '1rem'
                }}
              >
                <option value="test">Test Endpoints</option>
                <option value="scheduled">Get Scheduled Work</option>
              </select>
            </label>
            <button
              onClick={() => testMode === 'test' ? refetchTest() : refetchScheduled()}
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
                  <Search size={18} style={{ marginRight: '0.5rem' }} />
                  {testMode === 'test' ? 'Test Endpoints' : 'Get Scheduled Work'}
                </>
              )}
            </button>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#e7f3ff', borderRadius: '6px', fontSize: '0.85rem' }}>
            <Info size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
            <strong>Production Lines:</strong> 200 = SMT, 100 = TH (Through Hole), 300 = WH (Wire Harness)
          </div>
        </div>
      </div>

      {/* Test Endpoints Results */}
      {testMode === 'test' && testResults && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>Endpoint Test Results</h3>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Total Order Lines Found:</strong> {testResults.total_ordlines_found || 0}
                </div>
                <div>
                  <strong>Test Order Line ID:</strong> {testResults.test_ordline_id || 'N/A'}
                </div>
                <div>
                  <strong>Endpoints Tested:</strong> {testResults.tested_endpoints?.length || 0}
                </div>
                <div>
                  <strong>Successful:</strong>{' '}
                  <span style={{ color: 'var(--success)' }}>
                    {testResults.successful_endpoints?.length || 0}
                  </span>
                </div>
                <div>
                  <strong>Failed:</strong>{' '}
                  <span style={{ color: 'var(--danger)' }}>
                    {testResults.failed_endpoints?.length || 0}
                  </span>
                </div>
              </div>
            </div>

            {testResults.error && (
              <div style={{ padding: '1rem', backgroundColor: '#f8d7da', borderRadius: '6px', marginBottom: '1rem', color: '#721c24' }}>
                <strong>Error:</strong> {testResults.error}
              </div>
            )}

            {/* Successful Endpoints */}
            {testResults.successful_endpoints && testResults.successful_endpoints.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                  Successful Endpoints ({testResults.successful_endpoints.length})
                </h4>
                {testResults.successful_endpoints.map((endpoint, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#d4edda',
                      borderRadius: '6px',
                      marginBottom: '1rem',
                      border: '1px solid #c3e6cb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#155724' }}>{endpoint.name}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Status: {endpoint.status_code}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                      <strong>URL:</strong> {endpoint.url}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                      <strong>Response Type:</strong> {endpoint.response_type} | <strong>Size:</strong> {endpoint.response_size} chars
                    </div>
                    {endpoint.sample_keys && endpoint.sample_keys !== 'list' && (
                      <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                        <strong>Keys:</strong> {Array.isArray(endpoint.sample_keys) ? endpoint.sample_keys.join(', ') : endpoint.sample_keys}
                      </div>
                    )}
                    {endpoint.sample_data && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#155724' }}>
                          View Sample Data
                        </summary>
                        <pre
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.75rem',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px',
                            overflow: 'auto',
                            fontSize: '0.75rem',
                            maxHeight: '300px'
                          }}
                        >
                          {typeof endpoint.sample_data === 'string'
                            ? endpoint.sample_data
                            : JSON.stringify(endpoint.sample_data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Failed Endpoints */}
            {testResults.failed_endpoints && testResults.failed_endpoints.length > 0 && (
              <div>
                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <XCircle size={20} style={{ color: 'var(--danger)' }} />
                  Failed Endpoints ({testResults.failed_endpoints.length})
                </h4>
                {testResults.failed_endpoints.map((endpoint, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#f8d7da',
                      borderRadius: '6px',
                      marginBottom: '1rem',
                      border: '1px solid #f5c6cb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: '#721c24' }}>{endpoint.name}</strong>
                      {endpoint.status_code && (
                        <span style={{ fontSize: '0.85rem', color: '#721c24' }}>Status: {endpoint.status_code}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                      <strong>URL:</strong> {endpoint.url}
                    </div>
                    {endpoint.error && (
                      <div style={{ fontSize: '0.85rem', color: '#721c24', marginTop: '0.5rem' }}>
                        <strong>Error:</strong> {endpoint.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scheduled Work Results */}
      {testMode === 'scheduled' && scheduledWork && (
        <div className="card">
          <div className="card-header">
            <h3>Scheduled Work Orders for Prod Line {prodline}</h3>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Total Found:</strong> {scheduledWork.total_found || 0} order lines
                </div>
                <div>
                  <strong>Processed:</strong> {scheduledWork.processed || 0} work orders
                </div>
              </div>
            </div>

            {scheduledWork.message && (
              <div style={{ padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '6px', marginBottom: '1rem', color: '#856404' }}>
                {scheduledWork.message}
              </div>
            )}

            {scheduledWork.work_orders && scheduledWork.work_orders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {scheduledWork.work_orders.map((wo, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1.5rem',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      border: '1px solid #dee2e6'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h4 style={{ margin: 0, color: 'var(--primary)' }}>WO: {wo.wo_number}</h4>
                        <div style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '0.25rem' }}>
                          {wo.customer} | {wo.assembly} {wo.revision && `Rev ${wo.revision}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                        <div><strong>Qty:</strong> {wo.quantity?.toLocaleString() || 'N/A'}</div>
                        <div><strong>Balance Due:</strong> {wo.balance_due?.toLocaleString() || 'N/A'}</div>
                        {wo.current_location && (
                          <div><strong>Current Location:</strong> {wo.current_location}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
                      <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                        <strong>{wo.total_locations} locations</strong> with <strong>{wo.total_operations} total operations</strong>
                      </div>
                      {wo.locations && wo.locations.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {wo.locations.map((loc, locIdx) => (
                            <div
                              key={locIdx}
                              style={{
                                padding: '1rem',
                                backgroundColor: 'white',
                                borderRadius: '6px',
                                border: '1px solid #dee2e6'
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--primary)' }}>
                                📍 {loc.location_name || `Location ${loc.location_id}`}
                              </div>
                              {loc.operations && loc.operations.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                  {loc.operations.map((op, opIdx) => (
                                    <div
                                      key={opIdx}
                                      style={{
                                        padding: '0.5rem',
                                        backgroundColor: '#f8f9fa',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem'
                                      }}
                                    >
                                      {op.sequence && <span style={{ color: '#6c757d' }}>#{op.sequence} </span>}
                                      <strong>{op.operation_name || `Operation ${op.operation_id}`}</strong>
                                      {op.estimated_time && (
                                        <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '0.25rem' }}>
                                          Est. time: {op.estimated_time}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.85rem', color: '#6c757d', fontStyle: 'italic' }}>
                                  No operations found
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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

