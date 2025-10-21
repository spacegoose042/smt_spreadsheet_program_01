import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWorkOrders, getLines } from '../api'
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

  // Process work orders data
  const processData = (workOrders?.data || []).reduce((acc, wo) => {
    const location = wo.current_location || 'Unknown'
    const lineName = wo.line?.name || 'Unscheduled'
    
    // Initialize location data
    if (!acc.locations[location]) {
      acc.locations[location] = {
        total: 0,
        completed: 0,
        remaining: 0,
        workOrders: []
      }
    }
    
    // Initialize line data
    if (!acc.lines[lineName]) {
      acc.lines[lineName] = {
        total: 0,
        completed: 0,
        remaining: 0,
        workOrders: []
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
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
              {(workOrders?.data || [])
                .filter(wo => selectedLocation === 'all' || wo.current_location === selectedLocation)
                .map((wo, index) => {
                  const originalQty = wo.cetec_original_qty || wo.quantity || 0
                  const completedQty = wo.cetec_completed_qty || 0
                  const remainingQty = wo.cetec_remaining_qty || Math.max(0, originalQty - completedQty)
                  const percentage = originalQty > 0 ? Math.round((completedQty / originalQty) * 100) : 0
                  
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
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
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
