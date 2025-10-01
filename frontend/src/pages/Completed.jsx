import { useQuery } from '@tanstack/react-query'
import { getCompletedWorkOrders } from '../api'
import { format } from 'date-fns'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function Completed() {
  const { data: completed, isLoading } = useQuery({
    queryKey: ['completed'],
    queryFn: () => getCompletedWorkOrders(100),
  })

  if (isLoading) {
    return <div className="container loading">Loading completed jobs...</div>
  }

  const completedData = completed?.data || []

  // Calculate stats
  const totalJobs = completedData.length
  const avgVariance = completedData.length > 0
    ? completedData.reduce((sum, c) => sum + (c.time_variance_minutes || 0), 0) / completedData.length
    : 0
  const onTimeJobs = completedData.filter(c => (c.time_variance_minutes || 0) <= 0).length

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Completed Jobs</h1>
        <p className="page-description">Historical job completion and time tracking</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Completed</div>
          <div className="stat-value">{totalJobs}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Time Variance</div>
          <div className={`stat-value ${avgVariance > 0 ? 'warning' : 'success'}`}>
            {avgVariance > 0 ? '+' : ''}{Math.round(avgVariance)} min
          </div>
          <div className="stat-sublabel">actual vs estimated</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">On/Under Time</div>
          <div className="stat-value success">
            {totalJobs > 0 ? Math.round((onTimeJobs / totalJobs) * 100) : 0}%
          </div>
          <div className="stat-sublabel">{onTimeJobs} of {totalJobs} jobs</div>
        </div>
      </div>

      {/* Completed Jobs Table */}
      {completedData.length === 0 ? (
        <div className="card empty-state">
          <p>No completed jobs yet</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Assembly</th>
                <th>WO #</th>
                <th>Qty</th>
                <th>Start Date</th>
                <th>Finish Date</th>
                <th>Est. Time</th>
                <th>Actual Time</th>
                <th>Variance</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {completedData.map((c) => {
                const variance = c.time_variance_minutes || 0
                const isOverTime = variance > 0
                
                return (
                  <tr key={c.id}>
                    <td>{c.work_order?.customer}</td>
                    <td>{c.work_order?.assembly} {c.work_order?.revision}</td>
                    <td><code>{c.work_order?.wo_number}</code></td>
                    <td>{c.work_order?.quantity}</td>
                    <td>{format(new Date(c.actual_start_date), 'MMM d, yyyy')}</td>
                    <td>{format(new Date(c.actual_finish_date), 'MMM d, yyyy')}</td>
                    <td>{c.estimated_time_minutes} min</td>
                    <td>{c.actual_time_clocked_minutes} min</td>
                    <td>
                      <span style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color: isOverTime ? 'var(--danger)' : 'var(--success)'
                      }}>
                        {isOverTime ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {isOverTime ? '+' : ''}{Math.round(variance)} min
                      </span>
                    </td>
                    <td>{format(new Date(c.completed_at), 'MMM d, yyyy')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

