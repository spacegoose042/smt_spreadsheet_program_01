import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { testCetecScheduleEndpoints, getScheduledWorkForProdline, diagnoseProdlineData } from '../api'
import { Search, Loader2, CheckCircle2, XCircle, Info, Stethoscope } from 'lucide-react'

export default function ProdlineScheduleExplorer() {
  const [prodline, setProdline] = useState('300')
  const [testMode, setTestMode] = useState('diagnose') // 'diagnose', 'test', or 'scheduled'

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

  const { data: diagnoseData, isLoading: isLoadingDiagnose, refetch: refetchDiagnose } = useQuery({
    queryKey: ['diagnoseProdline', prodline],
    queryFn: () => diagnoseProdlineData(prodline),
    enabled: testMode === 'diagnose' && !!prodline,
  })

  const isLoading = isLoadingTest || isLoadingScheduled || isLoadingDiagnose

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
                <option value="diagnose">Diagnose Data (Recommended First)</option>
                <option value="test">Test Endpoints</option>
                <option value="scheduled">Get Scheduled Work</option>
              </select>
            </label>
            <button
              onClick={() => {
                if (testMode === 'diagnose') refetchDiagnose()
                else if (testMode === 'test') refetchTest()
                else refetchScheduled()
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
                  {testMode === 'diagnose' ? (
                    <>
                      <Stethoscope size={18} style={{ marginRight: '0.5rem' }} />
                      Diagnose
                    </>
                  ) : testMode === 'test' ? (
                    <>
                      <Search size={18} style={{ marginRight: '0.5rem' }} />
                      Test Endpoints
                    </>
                  ) : (
                    <>
                      <Search size={18} style={{ marginRight: '0.5rem' }} />
                      Get Scheduled Work
                    </>
                  )}
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

      {/* Diagnose Results */}
      {testMode === 'diagnose' && diagnoseData && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>Diagnostic Results - What Production Line Data Exists?</h3>
          </div>
          <div className="card-body">
            {diagnoseData.error ? (
              <div style={{ padding: '1rem', backgroundColor: '#f8d7da', borderRadius: '6px', color: '#721c24', marginBottom: '1rem' }}>
                <strong>Error:</strong> {diagnoseData.error}
                {diagnoseData.message && <div style={{ marginTop: '0.5rem' }}>{diagnoseData.message}</div>}
              </div>
            ) : null}

            {/* API Diagnostics Section */}
            {diagnoseData.diagnostics && (
              <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
                <h4 style={{ marginTop: 0, marginBottom: '1rem', color: '#856404' }}>
                  🔍 API Call Diagnostics
                  {diagnoseData.successful_endpoint && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', fontWeight: 'normal' }}>
                      (Successful: {diagnoseData.successful_endpoint})
                    </span>
                  )}
                </h4>
                
                {/* API Calls Summary */}
                {diagnoseData.diagnostics.api_calls && diagnoseData.diagnostics.api_calls.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h5 style={{ marginBottom: '0.5rem' }}>API Endpoints Tested:</h5>
                    {diagnoseData.diagnostics.api_calls.map((call, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: call.success ? '#d4edda' : '#f8d7da',
                          borderRadius: '4px',
                          marginBottom: '0.5rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <strong>{call.endpoint_name}</strong>
                            <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '0.25rem' }}>
                              Status: {call.status_code} | Size: {call.response_size} bytes | Content-Type: {call.content_type}
                            </div>
                            {call.url && (
                              <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                                {call.url}
                              </div>
                            )}
                          </div>
                          {call.success ? (
                            <CheckCircle2 size={20} style={{ color: '#155724' }} />
                          ) : (
                            <XCircle size={20} style={{ color: '#721c24' }} />
                          )}
                        </div>
                        {call.error && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'white', borderRadius: '4px', fontSize: '0.8rem' }}>
                            <strong>Error:</strong> {call.error}
                          </div>
                        )}
                        {call.json_error && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'white', borderRadius: '4px', fontSize: '0.8rem' }}>
                            <strong>JSON Parse Error:</strong> {call.json_error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Raw Response Details */}
                {diagnoseData.diagnostics.raw_responses && Object.keys(diagnoseData.diagnostics.raw_responses).length > 0 && (
                  <details style={{ marginTop: '1rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Raw Response Details (Click to expand)
                    </summary>
                    {Object.entries(diagnoseData.diagnostics.raw_responses).map(([endpoint, response]) => (
                      <div key={endpoint} style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px' }}>
                        <strong>{endpoint}:</strong>
                        <pre style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px' }}>
                          {JSON.stringify(response, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </details>
                )}

                {/* Response Analysis */}
                {diagnoseData.diagnostics.response_analysis && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px' }}>
                    <h5 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Response Analysis:</h5>
                    <pre style={{ fontSize: '0.8rem', overflow: 'auto' }}>
                      {JSON.stringify(diagnoseData.diagnostics.response_analysis, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!diagnoseData.error && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <strong>Total Order Lines in Cetec:</strong> {diagnoseData.total_ordlines || 0}
                    </div>
                    <div>
                      <strong>Requested Prod Line:</strong> {diagnoseData.requested_prodline}
                    </div>
                    <div>
                      <strong>Unique Prod Line Values Found:</strong> {diagnoseData.unique_prodline_values_found?.length || 0}
                    </div>
                  </div>
                </div>

                {diagnoseData.all_field_names && diagnoseData.all_field_names.length > 0 && (
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '6px' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>All Field Names in Order Lines:</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {diagnoseData.all_field_names.map((field, idx) => (
                        <code key={idx} style={{ padding: '0.25rem 0.5rem', backgroundColor: 'white', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {field}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {diagnoseData.prodline_value_counts && Object.keys(diagnoseData.prodline_value_counts).length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4>Production Line Value Counts:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                      {Object.entries(diagnoseData.prodline_value_counts).map(([value, count]) => (
                        <div key={value} style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                          <strong>{value}:</strong> {count} order lines
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {diagnoseData.unique_prodline_values_found && diagnoseData.unique_prodline_values_found.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4>Unique Production Line Values Found:</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {diagnoseData.unique_prodline_values_found.map((value, idx) => (
                        <span key={idx} style={{ padding: '0.5rem', backgroundColor: '#d4edda', borderRadius: '4px', fontSize: '0.9rem' }}>
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {diagnoseData.sample_lines_with_prodline_info && diagnoseData.sample_lines_with_prodline_info.length > 0 && (
                  <div>
                    <h4>Sample Order Lines with Production Line Fields:</h4>
                    {diagnoseData.sample_lines_with_prodline_info.map((line, idx) => (
                      <div key={idx} style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #dee2e6' }}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>WO: {line.wo_number}</strong> | Ordline ID: {line.ordline_id}
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Production Line Fields:</strong>
                          <pre style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', fontSize: '0.85rem', overflow: 'auto' }}>
                            {JSON.stringify(line.prodline_fields, null, 2)}
                          </pre>
                        </div>
                        {line.all_keys && (
                          <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                            <strong>Sample Keys:</strong> {line.all_keys.join(', ')}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

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

