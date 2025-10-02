import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Dashboard & Analytics
export const getDashboard = () => api.get('/api/dashboard')
export const getTrolleyStatus = () => api.get('/api/trolley-status')

// Lines
export const getLines = (includeInactive = false) => 
  api.get('/api/lines', { params: { include_inactive: includeInactive } })
export const getLine = (id) => api.get(`/api/lines/${id}`)
export const createLine = (data) => api.post('/api/lines', data)
export const updateLine = (id, data) => api.put(`/api/lines/${id}`, data)

// Work Orders
export const getWorkOrders = (params = {}) => 
  api.get('/api/work-orders', { params })
export const getWorkOrder = (id) => api.get(`/api/work-orders/${id}`)
export const createWorkOrder = (data) => api.post('/api/work-orders', data)
export const updateWorkOrder = (id, data) => api.put(`/api/work-orders/${id}`, data)
export const deleteWorkOrder = (id) => api.delete(`/api/work-orders/${id}`)
export const completeWorkOrder = (id, data) => api.post(`/api/work-orders/${id}/complete`, data)

// Completed
export const getCompletedWorkOrders = (limit = 50) => 
  api.get('/api/completed', { params: { limit } })
export const updateCompletedWorkOrder = (id, data) => api.put(`/api/completed/${id}`, data)
export const uncompleteWorkOrder = (id) => api.post(`/api/completed/${id}/uncomplete`)

// Users (Admin only)
export const getUsers = () => api.get('/api/users')
export const createUser = (data) => api.post('/api/users', data)
export const updateUser = (id, data) => api.put(`/api/users/${id}`, data)
export const deleteUser = (id) => api.delete(`/api/users/${id}`)

// Capacity Calendar
export const getCapacityCalendar = (lineId, startDate = null, weeks = 8) =>
  api.get(`/api/capacity/calendar/${lineId}`, { params: { start_date: startDate, weeks } })
export const createCapacityOverride = (data) => api.post('/api/capacity/overrides', data)
export const updateCapacityOverride = (id, data) => api.put(`/api/capacity/overrides/${id}`, data)
export const deleteCapacityOverride = (id) => api.delete(`/api/capacity/overrides/${id}`)
export const createShift = (data) => api.post('/api/capacity/shifts', data)
export const updateShift = (id, data) => api.put(`/api/capacity/shifts/${id}`, data)

export default api

