import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { api, asApiError, ApiError } from './api'
import { AuthForm } from './AuthForm'
import { ErrorMessage, Skeleton } from './components'
import { useSession } from './session'
import { WeatherView } from './WeatherView'

function routePath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

export function App() {
  const auth = useSession()
  const [path, setPath] = useState(routePath)
  const [registrationNotice, setRegistrationNotice] = useState('')
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState<ApiError | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const pop = () => { setPath(routePath()); setRegistrationNotice('') }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  const title = path === '/' ? 'Your weather, simply' : path === '/login' ? 'Log in' : path === '/register' ? 'Register' : 'Page not found'
  useEffect(() => {
    document.title = `${title} - Weather`
    heading.current?.focus()
  }, [path, title])

  function navigate(next: string) {
    if (next !== path) window.history.pushState(null, '', next)
    setPath(next)
    setRegistrationNotice('')
  }

  function link(to: string, children: ReactNode, className?: string) {
    return <a className={className} href={to} aria-current={path === to ? 'page' : undefined} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(to)
    }}>{children}</a>
  }

  async function logout() {
    if (!auth.session || logoutPending || auth.loading) return
    setLogoutPending(true)
    setLogoutError(null)
    try {
      await api.logout(auth.session.csrfToken)
      auth.loggedOut()
      navigate('/')
    } catch (failure) {
      const next = asApiError(failure)
      setLogoutError(new ApiError(`Logout did not complete. ${next.message}`, next.status, next.code, next.requestId, next.fields, next.retryAfter))
      auth.recover(next)
    } finally {
      setLogoutPending(false)
    }
  }

  return (
    <>
      <a className="absolute -top-24 left-4 z-10 rounded-2xl bg-surface px-4 py-3 focus:top-2" href="#main">Skip to content</a>
      <header className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="text-xl font-semibold">{link('/', <>Weather<span aria-hidden="true" className="text-primary">.</span></>, 'text-ink no-underline')}</div>
        <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold" aria-label="Account" aria-busy={auth.loading}>
          {auth.loading ? (
            <><span className="sr-only" role="status">Checking session…</span><Skeleton className="h-5 w-20" /><Skeleton className="h-11 w-24" /></>
          ) : auth.error ? (
            <><span className="text-xs text-muted">Account unavailable</span>{link('/login', 'Log in', 'secondary')}{link('/register', 'Register', 'primary-action')}</>
          ) : auth.session?.user ? (
            <><span className="text-xs text-muted">Signed in</span>{path !== '/' && link('/', 'Saved forecasts', 'secondary')}<button className="secondary" disabled={logoutPending} onClick={() => { void logout() }}>{logoutPending ? 'Logging out...' : 'Log out'}</button></>
          ) : <>{link('/login', 'Log in', 'secondary')}{link('/register', 'Register', 'primary-action')}</>}
        </nav>
      </header>
      <p className="sr-only" role="status">{logoutPending ? 'Logging out...' : ''}</p>
      <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6" tabIndex={-1}>
        {path !== '/login' && path !== '/register' && <h1 ref={heading} tabIndex={-1}>{title}</h1>}
        {path === '/' && <p className="mt-2 max-w-2xl text-sm text-muted">The coming days in Celsius. Find your city and save the forecast moments that matter.</p>}
        <p className={auth.notice ? 'message bg-tint text-ink' : ''} role="status">{auth.notice}</p>
        {auth.error && <section aria-label="Session recovery" className="mt-6 max-w-2xl">
          <ErrorMessage error={auth.error} message="We could not check your session. You can still search for weather. Retry to use account actions." />
          <button className="secondary" onClick={() => { void auth.refresh() }}>Retry session</button>
        </section>}
        <ErrorMessage error={logoutError} />
        {logoutError && auth.session && !auth.loading && <button className="secondary" disabled={logoutPending} onClick={() => { void logout() }}>Retry logout</button>}
        {registrationNotice && <p className="message success" role="status">{registrationNotice}</p>}
        <div hidden={path !== '/'}>
          <WeatherView session={auth.error ? null : auth.session} sessionLoading={auth.loading || !!auth.error} onFailure={auth.recover} loginLink={link('/login', 'Log in')} />
        </div>
        {(path === '/login' || path === '/register') && (
          <AuthForm key={path} headingRef={heading} mode={path === '/login' ? 'login' : 'register'}
            session={auth.error ? null : auth.session} sessionLoading={auth.loading}
            onFailure={auth.recover} loginLink={link('/login', 'Log in')}
            alternateLink={path === '/login' ? link('/register', 'Register') : link('/login', 'Log in')}
            onLogin={(session) => { auth.acceptLogin(session); setLogoutError(null); navigate('/') }}
            onRegistered={() => { navigate('/login'); setRegistrationNotice('Account created. Log in with your email and password.') }} />
        )}
        {!['/', '/login', '/register'].includes(path) && <p>This page is not available. {link('/', 'Return to Weather')}</p>}
      </main>
      <footer className="mx-auto w-full max-w-[1200px] px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">Forecast lookup is public. Sign in only when you want to save a forecast selection.</footer>
    </>
  )
}
