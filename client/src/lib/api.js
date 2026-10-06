const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export const TOKEN_KEY = 'common-room-token'
export const USER_KEY = 'common-room-user'

export async function request(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.status === false) {
    throw new Error(body.message || 'Something went wrong')
  }
  return body.data
}

export async function uploadImage(path, formData, token, method = 'POST') {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.status === false) {
    throw new Error(body.message || 'Image upload failed')
  }
  return body.data
}
