export function loginWithUmdSso(nextPath) {
  window.location.assign(`/api/auth/login?${new URLSearchParams({ next: nextPath })}`)
}

export async function fetchCurrentStaffSession() {
  const response = await fetch('/api/auth/me')
  return response.ok ? response.json() : null
}

export async function logoutStaffSession() {}
