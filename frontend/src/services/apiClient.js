// base http client communicating with the gradeflow backend api

// executes an authenticated http request with automatic session expiration redirect
export async function request(path, options = {}) {
  const headers = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (response.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = window.location.pathname + window.location.search
      window.location.assign(`/api/auth/login?${new URLSearchParams({ next })}`)
    }
    return new Promise(() => {})
  }

  if (!response.ok) {
    let detail = `request failed (${response.status})`
    try {
      const json = await response.json()
      detail = json.detail || json.message || detail
    } catch {}
    throw new Error(detail)
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.blob()
}

// sends a get request and returns parsed json data
export async function get(path, headers = {}) {
  return request(path, { method: 'GET', headers })
}

// sends a post request with json payload
export async function post(path, body, headers = {}) {
  return request(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    headers,
  })
}

// sends a put request with json payload
export async function put(path, body, headers = {}) {
  return request(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers,
  })
}

// sends a patch request with partial json updates
export async function patch(path, body, headers = {}) {
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers,
  })
}

// sends a delete request to remove a resource
export async function del(path, headers = {}) {
  return request(path, { method: 'DELETE', headers })
}

// uploads multipart form data such as pdf scans and rosters
export async function upload(path, formData, headers = {}) {
  return request(path, {
    method: 'POST',
    body: formData,
    headers,
  })
}
