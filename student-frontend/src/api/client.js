import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) {
      // let the app handle redirecting to login
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(e)
  },
)

export default api

export function errMsg(err) {
  if (!err) return 'An error occurred.'
  if (typeof err === 'string') return err
  const data = err.response?.data
  if (typeof data === 'string') return data
  if (data?.message) return data.message
  if (data?.error) return data.error
  if (err.message) return err.message
  return 'An unexpected error occurred.'
}
