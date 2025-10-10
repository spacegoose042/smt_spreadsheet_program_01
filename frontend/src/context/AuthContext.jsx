import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (token) {
      // Fetch current user info
      axios.get(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          setUser(res.data)
          setLoading(false)
        })
        .catch(() => {
          // Token invalid
          logout()
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (username, password) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)

    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, formData)
    const { access_token } = response.data
    
    localStorage.setItem('token', access_token)
    setToken(access_token)
    
    // Set default auth header
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    
    // Fetch user info
    const userResponse = await axios.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    setUser(userResponse.data)
    
    return userResponse.data
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    delete axios.defaults.headers.common['Authorization']
  }

  const value = {
    user,
    token,
    login,
    logout,
    loading,
    isAdmin: user?.role === 'admin',
    isScheduler: user?.role === 'scheduler',
    isOperator: user?.role === 'operator',
    isManager: user?.role === 'manager',
    canEdit: user?.role === 'admin' || user?.role === 'scheduler',
    canComplete: user?.role === 'admin' || user?.role === 'scheduler' || user?.role === 'operator',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}




