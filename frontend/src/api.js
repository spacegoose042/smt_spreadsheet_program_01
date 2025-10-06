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

// Handle 401 errors (expired token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      console.error('❌ Authentication failed (401). Redirecting to login...')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

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
export const changePassword = (data) => api.post('/api/users/change-password', data)
export const adminResetPassword = (userId, data) => api.post(`/api/users/${userId}/reset-password`, data)

// Capacity Calendar
export const getCapacityCalendar = (lineId, startDate = null, weeks = 8) =>
  api.get(`/api/capacity/calendar/${lineId}`, { params: { start_date: startDate, weeks } })
export const createCapacityOverride = (data) => api.post('/api/capacity/overrides', data)
export const updateCapacityOverride = (id, data) => api.put(`/api/capacity/overrides/${id}`, data)
export const deleteCapacityOverride = (id) => api.delete(`/api/capacity/overrides/${id}`)
export const createShift = (data) => api.post('/api/capacity/shifts', data)
export const updateShift = (id, data) => api.put(`/api/capacity/shifts/${id}`, data)
export const deleteShift = (id) => api.delete(`/api/capacity/shifts/${id}`)
export const createShiftBreak = (data) => api.post('/api/capacity/shifts/breaks', data)

// Statuses (Admin only)
export const getStatuses = (includeInactive = false) => 
  api.get('/api/statuses', { params: { include_inactive: includeInactive } })
export const createStatus = (data) => api.post('/api/statuses', data)
export const updateStatus = (id, data) => api.put(`/api/statuses/${id}`, data)
export const deleteStatus = (id) => api.delete(`/api/statuses/${id}`)

// Issue Types (Admin only)
export const getIssueTypes = (includeInactive = false) =>
  api.get('/api/issue-types', { params: { include_inactive: includeInactive } })
export const createIssueType = (data) => api.post('/api/issue-types', data)
export const updateIssueType = (id, data) => api.put(`/api/issue-types/${id}`, data)
export const deleteIssueType = (id) => api.delete(`/api/issue-types/${id}`)

// Issues (All users)
export const getIssues = (params = {}) => api.get('/api/issues', { params })
export const createIssue = (data) => api.post('/api/issues', data)
export const updateIssue = (id, data) => api.put(`/api/issues/${id}`, data)
export const deleteIssue = (id) => api.delete(`/api/issues/${id}`)

// Resolution Types (Admin only)
export const getResolutionTypes = (includeInactive = false) =>
  api.get('/api/resolution-types', { params: { include_inactive: includeInactive } })
export const createResolutionType = (data) => api.post('/api/resolution-types', data)
export const updateResolutionType = (id, data) => api.put(`/api/resolution-types/${id}`, data)
export const deleteResolutionType = (id) => api.delete(`/api/resolution-types/${id}`)

// Cetec ERP API Proxy (All authenticated users)
export const getCetecLocationMaps = (ordlineId, includeChildren = false) =>
  api.get(`/api/cetec/ordline/${ordlineId}/location_maps`, { 
    params: { include_children: includeChildren } 
  })
export const getCetecOperations = (ordlineId, ordlineMapId) =>
  api.get(`/api/cetec/ordline/${ordlineId}/location_map/${ordlineMapId}/operations`)
export const getCetecOperationDetail = (ordlineId, ordlineMapId, opId) =>
  api.get(`/api/cetec/ordline/${ordlineId}/location_map/${ordlineMapId}/operation/${opId}`)
export const getCetecCombinedData = (ordlineId) =>
  api.get(`/api/cetec/ordline/${ordlineId}/combined`)
export const getCetecOrdlineStatuses = () =>
  api.get('/api/cetec/ordlinestatus/list')
export const getCetecPart = (prcpart) =>
  api.get(`/api/cetec/part/${encodeURIComponent(prcpart)}`)
export const getCetecCustomer = (custnum) =>
  api.get(`/api/cetec/customer/${encodeURIComponent(custnum)}`)
export const runCetecImport = (data) =>
  api.post('/api/cetec/import', data)
export const getCetecSyncLogs = (days = 30) =>
  api.get('/api/cetec/sync-logs', { params: { days } })

export default api

