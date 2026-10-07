import { useState, type FormEvent } from 'react'
import { api, asApiError, type ApiError, type AuthState } from './api'
import { Card, ErrorMessage, Field } from './components'

export function validateCredentials(email: string, password: string) {
  return {
    email: email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'Enter a valid email address of at most 254 characters.' : '',
    password: [...password].length < 12 || [...password].length > 128
      ? 'Use 12-128 characters. Spaces are preserved.' : '',
  }
}

export function AuthForm({
  mode, session, sessionLoading, onLogin, onRegistered, onFailure, loginLink,
}: {
  mode: 'login' | 'register'
  session: AuthState | null
  sessionLoading: boolean
  onLogin: (session: AuthState) => void
  onRegistered: () => void
  onFailure: (error: ApiError) => void
  loginLink: React.ReactNode
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
      onFailure(next)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="auth-card">
      <p>{register ? 'Create an account to save specific forecast moments.' : 'Log in to manage your saved forecasts.'}</p>
      <ErrorMessage error={error} />
      {error?.code === 'EMAIL_IN_USE' && <p>Already have an account? {loginLink}</p>}
      <form onSubmit={(event) => { void submit(event) }} noValidate aria-busy={pending}>
        <Field id="email" label="Email" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={(event) => edit('email', event.target.value)} error={fields.email} />
        <Field id="password" label="Password" type={showPassword ? 'text' : 'password'} required
          autoComplete={register ? 'new-password' : 'current-password'}
          hint="Use 12-128 characters. Passwords are not trimmed or normalized."
          value={password} onChange={(event) => edit('password', event.target.value)} error={fields.password} />
        <button type="button" className="secondary" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
          {showPassword ? 'Hide password' : 'Show password'}
        </button>
        <button type="submit" disabled={pending || sessionLoading || !session}>
          {register ? 'Register' : 'Log in'}{pending ? ' — please wait' : ''}
        </button>
      </form>
      {register && <p className="supporting">After registration, you will be asked to log in.</p>}
      {sessionLoading && <p role="status">Preparing your secure session…</p>}
    </Card>
  )
}
