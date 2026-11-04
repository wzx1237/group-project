export async function request(path, options) {
  const response = await fetch(`/api${path}`, options)
  if (response.status === 401) {
    const next = window.location.pathname + window.location.search
    window.location.assign(`/api/auth/login?${new URLSearchParams({ next })}`)
    return new Promise(() => {}) // never settles: the page is leaving to sign in again
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      detail = (await response.json()).detail || detail
    } catch {}
    throw new Error(detail)
  }
  return response.status === 204 ? null : response.json()
}
