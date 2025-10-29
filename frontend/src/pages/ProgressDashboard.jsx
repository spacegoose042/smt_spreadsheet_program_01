import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWorkOrders, getLines, getCetecCombinedData } from '../api'
import { Package, Clock, CheckCircle, AlertCircle, TrendingUp, BarChart3 } from 'lucide-react'

function ProgressCard({ title, icon: Icon, data, color = 'blue' }) {
  const total = data.total || 0
  const completed = data.completed || 0
  const remaining = data.remaining || 0
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Icon size={20} style={{ color: `var(--${color})` }} />
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span>Total: <strong>{total.toLocaleString()}</strong></span>
          <span>Completed: <strong style={{ color: 'var(--success)' }}>{completed.toLocaleString()}</strong></span>
          <span>Remaining: <strong style={{ color: 'var(--warning)' }}>{remaining.toLocaleString()}</strong></span>
        </div>
        
        <div style={{ 
          width: '100%', 
          height: '8px', 
          backgroundColor: '#e9ecef', 
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: `var(--${color})`,
            transition: 'width 0.3s ease'
          }} />
        </div>
        
        <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
          {percentage}% Complete
        </div>
      </div>
    </div>
  )
}

function ProcessTable({ title, data, columns }) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3>{title}</h3>
        </div>
        <div className="card-body">
          <p>No data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              {columns.map((col, index) => (
                <th key={index} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                {Object.values(item).map((value, cellIndex) => (
                  <td key={cellIndex} style={{ padding: '0.75rem' }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ProgressDashboard() {
  const [selectedLocation, setSelectedLocation] = useState('all')
  const [selectedWorkOrder, setSelectedWorkOrder] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedWOs, setExpandedWOs] = useState({})

  const { data: workOrders, isLoading: loadingWOs } = useQuery({
    queryKey: ['workOrders', 'progress'],
    queryFn: () => getWorkOrders({ include_completed_work: true }),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: lines } = useQuery({
    queryKey: ['lines'],
    queryFn: () => getLines(),
  })

  if (loadingWOs) {
    return (
      <div className="container">
        <div className="loading">Loading progress data...</div>
      </div>
    )
  }

  // Filter work orders based on search and selection
  const filteredWorkOrders = (workOrders?.data || []).filter(wo => {
    // Location filter
    if (selectedLocation !== 'all' && wo.current_location !== selectedLocation) {
      return false
    }
    
    // Work order filter
    if (selectedWorkOrder !== 'all' && wo.wo_number !== selectedWorkOrder) {
      return false
    }
    
    // Search filter
    if (searchTerm && !wo.wo_number.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !wo.customer.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    
    return true
  })

  // Process work orders data with status ID breakdown
  const processData = filteredWorkOrders.reduce((acc, wo) => {
    const location = wo.current_location || 'Unknown'
    const lineName = wo.line?.name || 'Unscheduled'
    
    // Initialize location data
    if (!acc.locations[location]) {
      acc.locations[location] = {
        total: 0,
        completed: 0,
        remaining: 0,
        workOrders: [],
        statusBreakdown: {}
      }
    }
    
    // Initialize line data
    if (!acc.lines[lineName]) {
      acc.lines[lineName] = {
        total: 0,
        completed: 0,
        remaining: 0,
        workOrders: [],
        statusBreakdown: {}
      }
    }

    // Calculate quantities
    const originalQty = wo.cetec_original_qty || wo.quantity || 0
    const completedQty = wo.cetec_completed_qty || 0
    const remainingQty = wo.cetec_remaining_qty || (originalQty - completedQty)

    // Update location totals
    acc.locations[location].total += originalQty
    acc.locations[location].completed += completedQty
    acc.locations[location].remaining += Math.max(0, remainingQty)
    acc.locations[location].workOrders.push({
      wo_number: wo.wo_number,
      customer: wo.customer,
      original: originalQty,
      completed: completedQty,
      remaining: Math.max(0, remainingQty),
      percentage: originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
    })

    // Update line totals
    acc.lines[lineName].total += originalQty
    acc.lines[lineName].completed += completedQty
    acc.lines[lineName].remaining += Math.max(0, remainingQty)
    acc.lines[lineName].workOrders.push({
      wo_number: wo.wo_number,
      customer: wo.customer,
      original: originalQty,
      completed: completedQty,
      remaining: Math.max(0, remainingQty),
      percentage: originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
    })

    return acc
  }, { locations: {}, lines: {} })

  // Calculate overall totals
  const overallTotals = Object.values(processData.locations).reduce((acc, location) => ({
    total: acc.total + location.total,
    completed: acc.completed + location.completed,
    remaining: acc.remaining + location.remaining
  }), { total: 0, completed: 0, remaining: 0 })

  // Filter data based on selected location
  const filteredData = selectedLocation === 'all' 
    ? processData 
    : { 
        locations: { [selectedLocation]: processData.locations[selectedLocation] || {} },
        lines: processData.lines 
      }

  const locationList = Object.keys(processData.locations).sort()
  const lineList = Object.keys(processData.lines).sort()

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <BarChart3 size={24} />
          Work Order Progress Dashboard
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Filter by Location:
            <select 
              value={selectedLocation} 
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{ padding: '0.5rem' }}
            >
              <option value="all">All Locations</option>
              {locationList.map(location => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Filter by Work Order:
            <select 
              value={selectedWorkOrder} 
              onChange={(e) => setSelectedWorkOrder(e.target.value)}
              style={{ padding: '0.5rem', minWidth: '150px' }}
            >
              <option value="all">All Work Orders</option>
              {Array.from(new Set((workOrders?.data || []).map(wo => wo.wo_number))).sort().map(woNumber => (
                <option key={woNumber} value={woNumber}>{woNumber}</option>
              ))}
            </select>
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Search:
            <input
              type="text"
              placeholder="Search WO# or Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.5rem', minWidth: '200px' }}
            />
          </label>
        </div>
      </div>

      {/* Work Order Distribution (when specific WO selected) */}
      {selectedWorkOrder !== 'all' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>Work Order Distribution: {selectedWorkOrder}</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {Object.entries(processData.locations).map(([location, data]) => {
                const woInLocation = data.workOrders.filter(wo => wo.wo_number === selectedWorkOrder)
                if (woInLocation.length === 0) return null
                
                const wo = woInLocation[0]
                return (
                  <div key={location} className="card" style={{ padding: '1rem', backgroundColor: '#f8f9fa' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>{location}</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Original: <strong>{wo.original.toLocaleString()}</strong></span>
                      <span>Completed: <strong style={{ color: 'var(--success)' }}>{wo.completed.toLocaleString()}</strong></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Remaining: <strong style={{ color: 'var(--warning)' }}>{wo.remaining.toLocaleString()}</strong></span>
                      <span>Progress: <strong>{wo.percentage}%</strong></span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '6px', 
                      backgroundColor: '#e9ecef', 
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${wo.percentage}%`,
                        height: '100%',
                        backgroundColor: wo.percentage === 100 ? 'var(--success)' : 'var(--primary)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Operation Breakdown (when specific WO selected) */}
      {selectedWorkOrder !== 'all' && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header">
            <h3>📊 Detailed Operation Breakdown: {selectedWorkOrder}</h3>
          </div>
          <div className="card-body">
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '1.5rem', 
              borderRadius: '8px',
              border: '1px solid #dee2e6'
            }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>📋 Work Order Summary</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Work Order:</strong> {selectedWorkOrder}
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Original Quantity:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? (wo.cetec_original_qty || wo.quantity || 0).toLocaleString() : 'N/A'
                    })()} pieces
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Balance Due:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? (wo.cetec_balance_due || 0).toLocaleString() : 'N/A'
                    })()} pieces
                  </div>
                  <div style={{ padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <strong>Current Location:</strong> {(() => {
                      const wo = filteredWorkOrders.find(w => w.wo_number === selectedWorkOrder)
                      return wo ? wo.current_location : 'Unknown'
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>🔍 Detailed Progress by Operation</h4>
                <div style={{ 
                  backgroundColor: 'white', 
                  padding: '1rem', 
                  borderRadius: '4px', 
                  border: '1px solid #dee2e6',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr 1fr 1fr', 
                    gap: '1rem',
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    fontWeight: 'bold'
                  }}>
                    <div>Operation/Status</div>
                    <div style={{ textAlign: 'right' }}>Pieces Completed</div>
                    <div style={{ textAlign: 'right' }}>% of Order</div>
                    <div style={{ textAlign: 'center' }}>Status</div>
                  </div>
                  
                  {/* This would be populated with actual operation data from Cetec */}
                  <div style={{ 
                    padding: '0.75rem', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '4px',
                    border: '1px solid #ffeaa7',
                    textAlign: 'center',
                    color: '#856404'
                  }}>
                    <strong>📊 Operation Details</strong><br/>
                    <small>Status-specific progress data will be displayed here once the backend feature is re-enabled.</small><br/>
                    <small>This will show each operation (SMT Assembly, Inspection, etc.) with completed quantities.</small>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)' }}>💡 Key Insights</h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '1rem' 
                }}>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--success)'
                  }}>
                    <strong style={{ color: 'var(--success)' }}>✅ Progress Status</strong><br/>
                    <small>Work order is actively progressing through operations</small>
                  </div>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--info)'
                  }}>
                    <strong style={{ color: 'var(--info)' }}>📈 Completion Rate</strong><br/>
                    <small>Track progress through each manufacturing step</small>
                  </div>
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '4px', 
                    border: '1px solid #dee2e6',
                    borderLeft: '4px solid var(--warning)'
                  }}>
                    <strong style={{ color: 'var(--warning)' }}>⚠️ Quality Check</strong><br/>
                    <small>Monitor inspection and quality control progress</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Summary */}
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: '#f8f9fa' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Showing {filteredWorkOrders.length} work orders</strong>
              {selectedWorkOrder !== 'all' && <span> for work order <code>{selectedWorkOrder}</code></span>}
              {selectedLocation !== 'all' && <span> in location <code>{selectedLocation}</code></span>}
              {searchTerm && <span> matching "<code>{searchTerm}</code>"</span>}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>
              Total: {workOrders?.data?.length || 0} work orders
            </div>
          </div>
        </div>
      </div>

      {/* Overall Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <ProgressCard 
          title="Overall Progress" 
          icon={TrendingUp} 
          data={overallTotals} 
          color="primary"
        />
        
        {selectedLocation === 'all' && Object.entries(processData.locations).map(([location, data]) => (
          <ProgressCard 
            key={location}
            title={location} 
            icon={Package} 
            data={data} 
            color={location.includes('SMT') ? 'success' : location.includes('HOLD') ? 'danger' : 'info'}
          />
        ))}
        
        {selectedLocation !== 'all' && processData.locations[selectedLocation] && (
          <ProgressCard 
            title={selectedLocation} 
            icon={Package} 
            data={processData.locations[selectedLocation]} 
            color="info"
          />
        )}
      </div>

      {/* Process Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <ProcessTable
          title="Work Orders by Location"
          data={Object.entries(filteredData.locations).map(([location, data]) => ({
            Location: location,
            'Total Qty': data.total,
            'Completed': data.completed,
            'Remaining': data.remaining,
            'Work Orders': data.workOrders.length
          }))}
          columns={['Location', 'Total Qty', 'Completed', 'Remaining', 'Work Orders']}
        />
        
        <ProcessTable
          title="Work Orders by Line"
          data={Object.entries(filteredData.lines).map(([line, data]) => ({
            Line: line,
            'Total Qty': data.total,
            'Completed': data.completed,
            'Remaining': data.remaining,
            'Work Orders': data.workOrders.length
          }))}
          columns={['Line', 'Total Qty', 'Completed', 'Remaining', 'Work Orders']}
        />
      </div>

      {/* Detailed Work Order List */}
      <div className="card">
        <div className="card-header">
          <h3>Detailed Work Order Progress</h3>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', width: '36px' }}></th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>WO#</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Location</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Line</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Original</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Completed</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Remaining</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders.map((wo, index) => {
                  const originalQty = wo.cetec_original_qty || wo.quantity || 0
                  const completedQty = wo.cetec_completed_qty || 0
                  const remainingQty = wo.cetec_remaining_qty || Math.max(0, originalQty - completedQty)
                  const percentage = originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
                  
                  const isExpanded = !!expandedWOs[wo.wo_number]

                  return (
                    <>
                      <tr key={`${wo.wo_number}-row`} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <button
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            onClick={() => setExpandedWOs(prev => ({ ...prev, [wo.wo_number]: !isExpanded }))}
                            style={{
                              border: '1px solid #dee2e6',
                              background: 'white',
                              borderRadius: '4px',
                              width: '28px',
                              height: '28px',
                              cursor: 'pointer'
                            }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{wo.wo_number}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.customer}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.current_location || 'Unknown'}</td>
                        <td style={{ padding: '0.75rem' }}>{wo.line?.name || 'Unscheduled'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{originalQty.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--success)' }}>
                          {completedQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--warning)' }}>
                          {remainingQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ 
                              width: '60px', 
                              height: '6px', 
                              backgroundColor: '#e9ecef', 
                              borderRadius: '3px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${percentage}%`,
                                height: '100%',
                                backgroundColor: percentage === 100 ? 'var(--success)' : 'var(--primary)',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#666' }}>{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${wo.wo_number}-details`}>
                          <td colSpan={9} style={{ padding: 0, background: '#f8f9fa' }}>
                            <WorkOrderOperationsPanel workOrder={wo} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function WorkOrderOperationsPanel({ workOrder }) {
  const ordlineId = workOrder.cetec_ordline_id
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cetecCombined', ordlineId],
    queryFn: () => getCetecCombinedData(ordlineId),
    enabled: !!ordlineId
  })

  if (!ordlineId) {
    return (
      <div style={{ padding: '1rem' }}>
        <em>No Cetec ordline id available for this work order.</em>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ padding: '1rem' }}>
        Loading Cetec operations…
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '1rem', color: 'var(--danger)' }}>
        Failed to load operations from Cetec.
      </div>
    )
  }

  const payload = data?.data || {}
  const locationMaps = payload.location_maps || []

  return (
    <div style={{ padding: '1rem 1.25rem 1.25rem 3.25rem', borderTop: '1px solid #dee2e6' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
        {locationMaps.length === 0 && (
          <div style={{ background: '#fff3cd', border: '1px solid #ffeaa7', padding: '0.75rem', borderRadius: '6px' }}>
            No locations/operations returned from Cetec for this work order.
          </div>
        )}

        {locationMaps.map((loc, idx) => {
          const ops = loc.operations || []
          const locName = loc.name || loc.location_name || `Location ${idx + 1}`
          return (
            <div key={idx} className="card" style={{ background: 'white' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{locName}</strong>
                <span style={{ fontSize: '0.85rem', color: '#666' }}>{ops.length} operations</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table style={{ width: '100%', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Operation</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Pieces Completed</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>% of Order</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '0.75rem' }}>
                          <em>No operations defined for this location.</em>
                        </td>
                      </tr>
                    )}
                    {ops.map((op, j) => {
                      const name = op.name || op.operation || `Operation ${j + 1}`
                      const completed = 0 // Placeholder until per-op progress is wired
                      const orderQty = (workOrder.cetec_original_qty || workOrder.quantity || 0)
                      const pct = orderQty > 0 ? Math.round((completed / orderQty) * 100) : 0
                      return (
                        <tr key={j} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '0.5rem' }}>{name}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{completed.toLocaleString()}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{pct}%</td>
                          <td style={{ padding: '0.5rem', color: '#666' }}>
                            <small>Per-operation completed pcs coming soon</small>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
