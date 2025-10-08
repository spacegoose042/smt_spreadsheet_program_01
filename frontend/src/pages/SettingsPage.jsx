import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLines, updateLine, createLine } from '../api'
import { Save, Plus } from 'lucide-react'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [editingLine, setEditingLine] = useState(null)
  
  const { data: lines, isLoading } = useQuery({
    queryKey: ['lines', true],
    queryFn: () => getLines(true),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateLine(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['lines'])
      setEditingLine(null)
    },
  })

  const createMutation = useMutation({
    mutationFn: createLine,
    onSuccess: () => {
      queryClient.invalidateQueries(['lines'])
      setEditingLine(null)
    },
  })

  const handleSave = (line, updates) => {
    updateMutation.mutate({ id: line.id, data: updates })
  }

  const handleAddLine = () => {
    const newLine = {
      name: 'New Line',
      description: '',
      hours_per_day: 8.0,
      hours_per_week: 40.0,
      is_active: true,
      is_special_customer: false,
      special_customer_name: '',
      order_position: (lines?.data.length || 0) + 1
    }
    createMutation.mutate(newLine)
  }

  if (isLoading) {
    return <div className="container loading">Loading settings...</div>
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-description">Configure production lines and system settings</p>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">SMT Lines Configuration</h2>
          <button className="btn btn-primary btn-sm" onClick={handleAddLine}>
            <Plus size={16} />
            Add Line
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Line Name</th>
                <th>Hours/Day</th>
                <th>Hours/Week</th>
                <th>Special Customer</th>
                <th>Active</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines?.data
                .sort((a, b) => (a.order_position || 999) - (b.order_position || 999))
                .map(line => (
                <tr key={line.id}>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="text"
                        className="form-input"
                        defaultValue={line.name}
                        id={`name-${line.id}`}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      line.name
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="number"
                        className="form-input"
                        defaultValue={line.hours_per_day}
                        id={`hours-day-${line.id}`}
                        step="0.5"
                        style={{ width: '80px' }}
                      />
                    ) : (
                      line.hours_per_day
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="number"
                        className="form-input"
                        defaultValue={line.hours_per_week}
                        id={`hours-week-${line.id}`}
                        step="0.5"
                        style={{ width: '80px' }}
                      />
                    ) : (
                      line.hours_per_week
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="text"
                        className="form-input"
                        defaultValue={line.special_customer_name || ''}
                        id={`customer-${line.id}`}
                        placeholder="None"
                        style={{ width: '120px' }}
                      />
                    ) : (
                      line.special_customer_name || '-'
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="checkbox"
                        defaultChecked={line.is_active}
                        id={`active-${line.id}`}
                      />
                    ) : (
                      <span className={`badge ${line.is_active ? 'badge-success' : 'badge-secondary'}`}>
                        {line.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <input
                        type="number"
                        className="form-input"
                        defaultValue={line.order_position}
                        id={`order-${line.id}`}
                        style={{ width: '60px' }}
                      />
                    ) : (
                      line.order_position
                    )}
                  </td>
                  <td>
                    {editingLine === line.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => {
                            const updates = {
                              name: document.getElementById(`name-${line.id}`).value,
                              hours_per_day: parseFloat(document.getElementById(`hours-day-${line.id}`).value),
                              hours_per_week: parseFloat(document.getElementById(`hours-week-${line.id}`).value),
                              special_customer_name: document.getElementById(`customer-${line.id}`).value || null,
                              is_active: document.getElementById(`active-${line.id}`).checked,
                              order_position: parseInt(document.getElementById(`order-${line.id}`).value),
                              is_special_customer: !!document.getElementById(`customer-${line.id}`).value
                            }
                            handleSave(line, updates)
                          }}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => setEditingLine(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditingLine(line.id)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">System Information</h2>
        <div className="card">
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <strong>Trolley Limit:</strong> 24 trolleys
            </div>
            <div>
              <strong>Weekends:</strong> Skipped in calculations (Saturday & Sunday)
            </div>
            <div>
              <strong>Default Setup Time:</strong> Calculated based on trolley count (1-4 hours)
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}




