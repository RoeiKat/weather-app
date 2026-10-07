import { useCallback, useEffect, useRef, useState } from 'react'
import { api, asApiError, type ApiError, type AuthState } from './api'

export function useSession() {
  const [session, setSession] = useState<AuthState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const bootstrap = useRef<Promise<AuthState> | null>(null)

  const refresh = useCallback(async (clearPrivate = false) => {
    const current = ++generation.current
    if (clearPrivate) setSession(null)
    setLoading(true)
    setError(null)
    // One response must own the cookie and token, even with concurrent recovery.
    const pending = bootstrap.current ?? api.session()
    bootstrap.current = pending
    try {
      const next = await pending
      if (current === generation.current) setSession(next)
    } catch (failure) {
      if (current === generation.current) setError(asApiError(failure))
    } finally {
      if (bootstrap.current === pending) bootstrap.current = null
      if (current === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const counter = generation
    void refresh()
    return () => { counter.current++ }
  }, [refresh])

  const acceptLogin = useCallback((next: AuthState) => {
    generation.current++
    setSession(next)
    setLoading(false)
    setError(null)
    setNotice('You are signed in.')
  }, [])

  const recover = useCallback((failure: ApiError) => {
    if (failure.code === 'UNAUTHENTICATED') {
      setNotice('Your session expired. Log in again to manage saved forecasts. Your last action was not retried.')
      void refresh(true)
    } else if (failure.code === 'CSRF_FAILED') {
      setNotice('Your security session needs refreshing. Wait for it to finish, then try your action again. It was not retried.')
      void refresh()
    }
  }, [refresh])

  const loggedOut = useCallback(() => {
    setNotice('You are signed out.')
    void refresh(true)
  }, [refresh])

  return { session, loading, error, notice, refresh, acceptLogin, recover, loggedOut }
}
