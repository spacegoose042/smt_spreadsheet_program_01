import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Dashboard
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

export default api

