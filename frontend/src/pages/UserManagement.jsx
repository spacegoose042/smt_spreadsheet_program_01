import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Plus, Edit2, Trash2, X, Save, Key } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function UserManagement() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator'
  })

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const token = localStorage.getItem('token')
      const response = await axios.get(`${API_BASE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const token = localStorage.getItem('token')
      return axios.post(`${API_BASE_URL}/api/users`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      setShowForm(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const token = localStorage.getItem('token')
      return axios.put(`${API_BASE_URL}/api/users/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
      setEditingUser(null)
      setShowForm(false)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = localStorage.getItem('token')
      return axios.delete(`${API_BASE_URL}/api/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['users'])
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }) => {
      const token = localStorage.getItem('token')
      return axios.post(`${API_BASE_URL}/api/users/${userId}/reset-password`, 
        { new_password: newPassword }, 
        { headers: { Authorization: `Bearer ${token}` } }
      )
    },
    onSuccess: () => {
      alert('Password reset successfully!')
    },
  })

  const handleResetPassword = (user) => {
    const newPassword = prompt(`Enter new password for ${user.username}:\n\n(Minimum 6 characters)`)
    if (newPassword && newPassword.length >= 6) {
      if (confirm(`Reset password for ${user.username}?`)) {
        resetPasswordMutation.mutate({ userId: user.id, newPassword })
      }
    } else if (newPassword) {
      alert('Password must be at least 6 characters')
    }
  }

  const resetForm = () => {
    setFormData({ username: '', email: '', password: '', role: 'operator' })
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role
    })
    setShowForm(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingUser) {
      const updateData = { ...formData }
      if (!updateData.password) delete updateData.password
      updateMutation.mutate({ id: editingUser.id, data: updateData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (user) => {
    if (window.confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      deleteMutation.mutate(user.id)
    }
  }

  if (isLoading) {
    return <div className="container loading">Loading users...</div>
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-description">Manage system users and permissions (Admin only)</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Users ({users?.length || 0})</h3>
          <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); setEditingUser(null); }}>
            <Plus size={16} />
            Add User
          </button>
        </div>

        {showForm && (
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>{editingUser ? 'Edit User' : 'New User'}</h4>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2" style={{ gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required={!editingUser}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select
                    className="form-select"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="scheduler">Scheduler</option>
                    <option value="operator">Operator</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditingUser(null); }}>
                  <X size={14} /> Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={14} /> {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map(user => (
              <tr key={user.id}>
                <td><strong>{user.username}</strong></td>
                <td>{user.email}</td>
                <td>
                  <span className={`badge ${
                    user.role === 'admin' ? 'badge-danger' :
                    user.role === 'scheduler' ? 'badge-info' :
                    user.role === 'operator' ? 'badge-success' :
                    'badge-secondary'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${user.is_active ? 'badge-success' : 'badge-secondary'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(user)} title="Edit User">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn btn-sm btn-warning" onClick={() => handleResetPassword(user)} title="Reset Password">
                      <Key size={14} />
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user)} title="Delete User">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role Descriptions */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Role Descriptions</h3>
        <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.8rem' }}>
          <div>
            <strong>Admin:</strong> Full system access including user management, all scheduling functions, and system configuration.
          </div>
          <div>
            <strong>Scheduler:</strong> Full scheduling access - create/edit/delete work orders, assign lines, complete jobs, configure lines.
          </div>
          <div>
            <strong>Operator:</strong> Limited access - view assigned line, complete jobs on their line, view job details. Cannot edit schedule.
          </div>
          <div>
            <strong>Manager:</strong> View-only access - see all pages and reports but cannot make changes.
          </div>
        </div>
      </div>
    </div>
  )
}

