import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, MessageCircle, Sparkles } from 'lucide-react'
import { request, TOKEN_KEY, USER_KEY } from '../lib/api.js'

function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      navigate('/chat', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="brand-mark"><MessageCircle size={20} /></div>
        <p className="eyebrow">A quieter way to talk</p>
        <h1>Make room<br /><em>for the good stuff.</em></h1>
        <p className="intro-copy">A warm, focused place for the conversations you want to keep close.</p>
        <div className="intro-note"><Sparkles size={16} /><span>Private by design. Present by default.</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Welcome back</p>
          <h2>{mode === 'signin' ? 'Pick up where you left off.' : 'Start your room.'}</h2>
          <p>{mode === 'signin' ? 'Your people are a message away.' : 'Create an account and invite your people in.'}</p>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" /></label>}
          <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
          <label>Password<input required minLength="6" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 6 characters" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Opening...' : mode === 'signin' ? 'Enter the room' : 'Create account'} <ArrowUp size={16} /></button>
        </form>
        <button className="text-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}>
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

export default AuthPage
