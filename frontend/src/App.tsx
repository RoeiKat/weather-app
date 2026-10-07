import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { api, asApiError, ApiError } from './api'
import { AuthForm } from './AuthForm'
import { ErrorMessage } from './components'
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

  function link(to: string, children: ReactNode) {
    return <a href={to} aria-current={path === to ? 'page' : undefined} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
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
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header container">
        <div className="brand">{link('/', 'Weather')}</div>
        <nav aria-label="Account">
          {auth.loading ? <p role="status">Checking session…</p> : auth.error ? null : auth.session?.user ? (
            <><span>Signed in</span><button className="secondary" disabled={logoutPending} onClick={() => { void logout() }}>Log out{logoutPending ? ' — signing out' : ''}</button></>
          ) : <>{link('/login', 'Log in')}{link('/register', 'Register')}</>}
        </nav>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        <p className="intro">{path === '/' ? 'The coming days in Celsius. Find your city and save the forecast moments that matter.' : ''}</p>
        <p role="status">{auth.notice}</p>
        <ErrorMessage error={auth.error} />
        {auth.error && <button className="secondary" onClick={() => { void auth.refresh() }}>Retry session</button>}
        <ErrorMessage error={logoutError} />
        {logoutError && auth.session && !auth.loading && <button className="secondary" disabled={logoutPending} onClick={() => { void logout() }}>Retry logout</button>}
        {registrationNotice && <p className="message success" role="status">{registrationNotice}</p>}
        <div hidden={path !== '/'}>
          <WeatherView session={auth.error ? null : auth.session} sessionLoading={auth.loading || !!auth.error} onFailure={auth.recover} loginLink={link('/login', 'Log in')} />
        </div>
        {(path === '/login' || path === '/register') && (
          <AuthForm key={path} mode={path === '/login' ? 'login' : 'register'}
            session={auth.error ? null : auth.session} sessionLoading={auth.loading}
            onFailure={auth.recover} loginLink={link('/login', 'Log in')}
            onLogin={(session) => { auth.acceptLogin(session); setLogoutError(null); navigate('/') }}
            onRegistered={() => { navigate('/login'); setRegistrationNotice('Account created. Log in with your email and password.') }} />
        )}
        {!['/', '/login', '/register'].includes(path) && <p>This page is not available. {link('/', 'Return to Weather')}</p>}
      </main>
      <footer className="container supporting">Forecast lookup is public. Sign in only when you want to save a forecast selection.</footer>
    </>
  )
}
