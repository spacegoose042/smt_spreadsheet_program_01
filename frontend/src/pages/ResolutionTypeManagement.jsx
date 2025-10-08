import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getResolutionTypes, createResolutionType, updateResolutionType, deleteResolutionType } from '../api'
import { Plus, Edit2, Trash2, X, Save, CheckCircle } from 'lucide-react'

export default function ResolutionTypeManagement() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#28a745',
    category: '',
    is_active: true,
    display_order: 0
  })

  const { data: resolutionTypes, isLoading } = useQuery({
    queryKey: ['resolution-types'],
    queryFn: () => getResolutionTypes(true).then(res => res.data)
  })

  const createMutation = useMutation({
    mutationFn: createResolutionType,
    onSuccess: () => {
      queryClient.invalidateQueries(['resolution-types'])
      setShowForm(false)
      resetForm()
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateResolutionType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['resolution-types'])
      setEditingType(null)
      setShowForm(false)
      resetForm()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteResolutionType,
    onSuccess: () => {
      queryClient.invalidateQueries(['resolution-types'])
    }
  })

  const resetForm = () => {
    setFormData({ name: '', color: '#28a745', category: '', is_active: true, display_order: 0 })
  }

  const handleEdit = (resolutionType) => {
    setEditingType(resolutionType)
    setFormData({
      name: resolutionType.name,
      color: resolutionType.color,
      category: resolutionType.category || '',
      is_active: resolutionType.is_active,
      display_order: resolutionType.display_order
    })
    setShowForm(true)
  }

  const handleDelete = (resolutionType) => {
    if (resolutionType.is_system) {
      alert('Cannot delete system resolution type')
      return
    }
    if (confirm(`Delete resolution type "${resolutionType.name}"?`)) {
      deleteMutation.mutate(resolutionType.id)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  if (isLoading) return <div className="container loading">Loading...</div>

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resolution Type Management</h1>
          <p className="page-description">Manage how issues are resolved and tracked</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            resetForm()
            setEditingType(null)
            setShowForm(!showForm)
          }}
        >
          <Plus size={18} />
          Add Resolution Type
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {editingType ? 'Edit Resolution Type' : 'New Resolution Type'}
            </h2>
            <button className="btn btn-sm btn-secondary" onClick={() => {
              setShowForm(false)
              setEditingType(null)
              resetForm()
            }}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., BOM Update Required"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  name="category"
                  className="form-input"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Action Required, Packaging"
                />
              </div>
            </div>

            <div className="grid grid-cols-3">
              <div className="form-group">
                <label className="form-label">Color</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    name="color"
                    className="form-input"
                    value={formData.color}
                    onChange={handleChange}
                    style={{ width: '60px', height: '40px', padding: '2px' }}
                  />
                  <input
                    type="text"
                    name="color"
                    className="form-input"
                    value={formData.color}
                    onChange={handleChange}
                    placeholder="#28a745"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Display Order</label>
                <input
                  type="number"
                  name="display_order"
                  className="form-input"
                  value={formData.display_order}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                  />
                  Active
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={18} />
                {editingType ? 'Update' : 'Create'}
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => {
                  setShowForm(false)
                  setEditingType(null)
                  resetForm()
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Name</th>
              <th>Category</th>
              <th style={{ width: '120px' }}>Color</th>
              <th style={{ width: '100px' }}>Order</th>
              <th style={{ width: '100px' }}>Status</th>
              <th style={{ width: '150px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {resolutionTypes && resolutionTypes.length > 0 ? (
              resolutionTypes.map(resolutionType => (
                <tr key={resolutionType.id}>
                  <td>
                    <strong>{resolutionType.name}</strong>
                    {resolutionType.is_system && (
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        fontSize: '0.7rem', 
                        color: 'var(--text-secondary)' 
                      }}>
                        (System)
                      </span>
                    )}
                  </td>
                  <td>{resolutionType.category || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '4px',
                        background: resolutionType.color,
                        border: '1px solid var(--border)'
                      }} />
                      <code style={{ fontSize: '0.75rem' }}>{resolutionType.color}</code>
                    </div>
                  </td>
                  <td>{resolutionType.display_order}</td>
                  <td>
                    <span className={`badge ${resolutionType.is_active ? 'badge-success' : 'badge-secondary'}`}>
                      {resolutionType.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => handleEdit(resolutionType)}
                        title="Edit Resolution Type"
                      >
                        <Edit2 size={14} />
                      </button>
                      {!resolutionType.is_system && (
                        <button 
                          className="btn btn-sm btn-danger" 
                          onClick={() => handleDelete(resolutionType)}
                          title="Delete Resolution Type"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  <CheckCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No resolution types found. Create your first resolution type above.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}




