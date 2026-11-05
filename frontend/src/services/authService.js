// authentication service handling umd single sign-on sessions and credentials

// redirects the user to the university cas authentication login endpoint
export function loginWithUmdSso(nextPath = '/courses') {
  window.location.assign(`/api/auth/login?${new URLSearchParams({ next: nextPath })}`)
}

// retrieves the current authenticated staff member profile and session status
export async function fetchCurrentStaffSession() {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  return response.ok ? response.json() : null
}

// terminates the active staff session and redirects to login
export async function logoutStaffSession() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {}
  if (typeof window !== 'undefined') {
    window.location.assign('/login')
  }
}
