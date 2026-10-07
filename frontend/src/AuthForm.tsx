import { useState, type FormEvent, type Ref } from 'react'
import { api, asApiError, type ApiError, type AuthState } from './api'
import { ErrorMessage, Field, WeatherArtwork } from './components'

export function validateCredentials(email: string, password: string) {
  return {
    email: email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'Enter a valid email address of at most 254 characters.' : '',
    password: [...password].length < 12 || [...password].length > 128
      ? 'Use 12-128 characters.' : '',
  }
}

export function AuthForm({
  mode, session, sessionLoading, onLogin, onRegistered, onFailure, loginLink, alternateLink, headingRef,
}: {
  mode: 'login' | 'register'
  session: AuthState | null
  sessionLoading: boolean
  onLogin: (session: AuthState) => void
  onRegistered: () => void
  onFailure: (error: ApiError) => void
  loginLink: React.ReactNode
  alternateLink: React.ReactNode
  headingRef: Ref<HTMLHeadingElement>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [fields, setFields] = useState({ email: '', password: '' })
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)
  const register = mode === 'register'

  function edit(field: 'email' | 'password', value: string) {
    const nextEmail = field === 'email' ? value : email
    const nextPassword = field === 'password' ? value : password
    if (field === 'email') setEmail(value)
    else setPassword(value)
    if (submitted) setFields((previous) => ({ ...previous, [field]: validateCredentials(nextEmail, nextPassword)[field] }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending || sessionLoading || !session) return
    setSubmitted(true)
    setError(null)
    const invalid = validateCredentials(email, password)
    setFields(invalid)
    if (invalid.email || invalid.password) {
      document.getElementById(invalid.email ? 'email' : 'password')?.focus()
      return
    }
    setPending(true)
    try {
      if (register) {
        await api.register(email.trim().toLowerCase(), password, session.csrfToken)
        setPassword('')
        onRegistered()
      } else {
        const next = await api.login(email.trim().toLowerCase(), password, session.csrfToken)
        setPassword('')
        onLogin(next)
      }
    } catch (failure) {
      const next = asApiError(failure)
      setError(next)
      setFields({
        email: next.fields.find((field) => field.field === 'email')?.message ?? '',
        password: next.fields.find((field) => field.field === 'password')?.message ?? '',
      })
      const invalidField = next.fields.find((field) => field.field === 'email' || field.field === 'password')
      if (invalidField) document.getElementById(invalidField.field)?.focus()
      onFailure(next)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mx-auto my-2 grid w-full max-w-[980px] overflow-hidden rounded-3xl bg-surface shadow-surface md:my-8 md:grid-cols-2" aria-label={register ? 'Register' : 'Log in'}>
      <div className="min-w-0 px-5 py-7 sm:p-8 lg:p-10">
      <div className="mb-5 space-y-2">
        <p className="text-xs font-semibold tracking-widest text-primary">YOUR WEATHER, KEPT CLOSE</p>
        <h1 ref={headingRef} tabIndex={-1}>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="text-sm text-muted">{register ? 'Save the forecast moments that matter to you.' : 'Log in to manage your saved forecasts.'}</p>
      </div>
      <ErrorMessage error={error?.fields.length && error.fields.every((field) => field.field === 'email' || field.field === 'password') ? null : error} />
      {error?.code === 'EMAIL_IN_USE' && <p>Already have an account? {loginLink}</p>}
      <form className="grid gap-4" onSubmit={(event) => { void submit(event) }} noValidate aria-busy={pending || sessionLoading}>
        <Field id="email" label="Email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={(event) => edit('email', event.target.value)} error={fields.email} />
        <Field id="password" label="Password" type={showPassword ? 'text' : 'password'} required
          autoComplete={register ? 'new-password' : 'current-password'}
          hint="Use 12-128 characters. Spaces are preserved."
          value={password} onChange={(event) => edit('password', event.target.value)} error={fields.password}
          control={<button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg border-transparent bg-transparent px-2 py-1 text-xs text-primary hover:border-transparent hover:bg-tint"
            aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>} />
        <button className="w-full" type="submit" disabled={pending || sessionLoading || !session}>
          {pending ? register ? 'Registering...' : 'Logging in...' : register ? 'Register' : 'Log in'}
        </button>
      </form>
      <p className="mt-3 text-sm text-muted">{register ? 'Already have an account? ' : 'New here? '}{alternateLink}</p>
      {register && <p className="text-sm text-muted">After registration, you will be asked to log in.</p>}
      {sessionLoading && <p role="status">Preparing your secure session…</p>}
      <p className="sr-only" role="status">{pending ? register ? 'Registering...' : 'Logging in...' : ''}</p>
      {!sessionLoading && !session && <p className="text-sm text-muted">Retry your session above to continue. Your account form is still here.</p>}
      </div>
      <div className="hidden flex-col items-center justify-center gap-6 bg-gradient-to-br from-blue-100 via-sky-100 to-blue-200 p-8 md:flex" aria-hidden="true">
        <WeatherArtwork className="w-full max-w-72" />
        <div className="max-w-64 text-center">
          <p className="text-2xl font-semibold leading-tight">A little clarity for the coming days.</p>
          <p className="mt-3 text-sm text-muted">Find your city. Explore the forecast. Keep a moment for later.</p>
        </div>
      </div>
    </section>
  )
}
