import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { changePassword } from '../api'
import { useAuth } from '../context/AuthContext'
import { Lock, Check, AlertCircle } from 'lucide-react'

export default function ChangePassword() {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setSuccess(true)
      setError('')
      setFormData({
        current_password: '',
        new_password: '',
        confirm_password: ''
      })
      setTimeout(() => setSuccess(false), 5000)
    },
    onError: (error) => {
      setError(error.response?.data?.detail || 'Failed to change password')
      setSuccess(false)
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // Validation
    if (formData.new_password.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    if (formData.new_password !== formData.confirm_password) {
      setError('New passwords do not match')
      return
    }

    mutation.mutate({
      current_password: formData.current_password,
      new_password: formData.new_password
    })
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Change Password</h1>
        <p className="page-description">Update your password for {user?.username}</p>
      </div>

      <div style={{ maxWidth: '500px' }}>
        <div className="card">
          {success && (
            <div style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
              border: '1px solid #b1dfbb',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#155724'
            }}>
              <Check size={20} />
              <strong>Password changed successfully!</strong>
            </div>
          )}

          {error && (
            <div style={{
              padding: '1rem',
              background: 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)',
              border: '1px solid #f5c6cb',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#721c24'
            }}>
              <AlertCircle size={20} />
              <strong>{error}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">
                <Lock size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />
                Current Password
              </label>
              <input
                type="password"
                name="current_password"
                className="form-input"
                value={formData.current_password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <Lock size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />
                New Password
              </label>
              <input
                type="password"
                name="new_password"
                className="form-input"
                value={formData.new_password}
                onChange={handleChange}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <small style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.25rem', display: 'block' }}>
                Must be at least 6 characters
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">
                <Lock size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirm_password"
                className="form-input"
                value={formData.confirm_password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Changing...' : 'Change Password'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFormData({
                    current_password: '',
                    new_password: '',
                    confirm_password: ''
                  })
                  setError('')
                  setSuccess(false)
                }}
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, #d1ecf1 0%, #bee5eb 100%)',
          border: '1px solid #bee5eb',
          borderRadius: '12px',
          color: '#0c5460'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Password Tips
          </h3>
          <ul style={{ paddingLeft: '1.25rem', lineHeight: '1.8' }}>
            <li>Use at least 6 characters (longer is better)</li>
            <li>Mix uppercase and lowercase letters</li>
            <li>Include numbers and special characters</li>
            <li>Don't use common words or personal information</li>
            <li>Use a unique password for this account</li>
          </ul>
        </div>
      </div>
    </div>
  )
}




