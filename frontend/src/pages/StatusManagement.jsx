import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStatuses, createStatus, updateStatus, deleteStatus } from '../api'
import { Plus, Edit2, Trash2, Lock } from 'lucide-react'

export default function StatusManagement() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingStatus, setEditingStatus] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#6c757d',
    is_active: true,
    display_order: 0
  })

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['statuses', true],
    queryFn: () => getStatuses(true).then(res => res.data)
  })

  const createMutation = useMutation({
    mutationFn: createStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['statuses'])
      handleCancel()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['statuses'])
      handleCancel()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['statuses'])
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (editingStatus) {
      updateMutation.mutate({ id: editingStatus.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleEdit = (status) => {
    setEditingStatus(status)
    setFormData({
      name: status.name,
      color: status.color,
      is_active: status.is_active,
      display_order: status.display_order
    })
    setShowForm(true)
  }

  const handleDelete = (status) => {
    if (status.is_system) {
      alert('Cannot delete system status')
      return
    }
    
    if (confirm(`Delete status "${status.name}"?`)) {
      deleteMutation.mutate(status.id)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingStatus(null)
    setFormData({
      name: '',
      color: '#6c757d',
      is_active: true,
      display_order: 0
    })
  }

  if (isLoading) {
    return <div className="loading">Loading statuses...</div>
  }

  const sortedStatuses = statuses ? [...statuses].sort((a, b) => a.display_order - b.display_order) : []

  return (
    <div className="container" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📋 Status Management</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Configure work order statuses. System statuses cannot be deleted.
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          <Plus size={18} />
          Add Status
        </button>
      </div>

      {/* Statuses List */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Status Name</th>
              <th>Color</th>
              <th>Preview</th>
              <th>Active</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedStatuses.map((status) => (
              <tr key={status.id}>
                <td>{status.display_order}</td>
                <td style={{ fontWeight: 600 }}>{status.name}</td>
                <td>
                  <code style={{ fontSize: '0.75rem' }}>{status.color}</code>
                </td>
                <td>
                  <span 
                    className="badge"
                    style={{ 
                      background: status.color, 
                      color: 'white',
                      padding: '0.25rem 0.5rem'
                    }}
                  >
                    {status.name}
                  </span>
                </td>
                <td>
                  {status.is_active ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-secondary">Inactive</span>
                  )}
                </td>
                <td>
                  {status.is_system ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                      <Lock size={12} />
                      System
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Custom</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEdit(status)}
                      title="Edit status"
                    >
                      <Edit2 size={14} />
                    </button>
                    {!status.is_system && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(status)}
                        title="Delete status"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingStatus ? 'Edit Status' : 'Create New Status'}</h2>
              <button className="close-btn" onClick={handleCancel}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
              <div className="form-group">
                <label>Status Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Awaiting Parts, Quality Check"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Badge Color</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      className="form-input"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      style={{ width: '60px', height: '40px', padding: '0.25rem' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      placeholder="#6c757d"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <small className="form-hint">Color in hex format (e.g., #28a745)</small>
                </div>

                <div className="form-group">
                  <label>Display Order</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                    min="0"
                  />
                  <small className="form-hint">Lower numbers appear first</small>
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Active</span>
                </label>
                <small className="form-hint">Inactive statuses won't appear in dropdowns</small>
              </div>

              <div className="form-group">
                <label>Preview:</label>
                <span 
                  className="badge"
                  style={{ 
                    background: formData.color, 
                    color: 'white',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.875rem'
                  }}
                >
                  {formData.name || 'Status Name'}
                </span>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingStatus ? 'Update Status' : 'Create Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}




