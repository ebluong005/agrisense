import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { TextField } from '../../components/ui/TextField'

export const MIN_PASSWORD_LENGTH = 10

type Props = {
  mode: 'login' | 'register'
  onSubmit: (email: string, password: string) => Promise<void>
  pending: boolean
  error: string | null
  notice?: string
}

export function AuthForm({ mode, onSubmit, pending, error, notice }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`)
      return
    }
    setLocalError(null)
    void onSubmit(email.trim(), password)
  }

  return (
    <form onSubmit={submit} noValidate={false} className="space-y-5">
      {notice && <Notice tone="info">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div>
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'register' ? MIN_PASSWORD_LENGTH : undefined}
          hint={mode === 'register' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          error={localError}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="mt-3 flex min-h-11 items-center gap-3 text-base text-stone-700">
          <input type="checkbox" className="size-5 accent-brand-700" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
          Show password
        </label>
      </div>
      <Button type="submit" fullWidth loading={pending}>
        {mode === 'login' ? 'Sign in' : 'Create my account'}
      </Button>
    </form>
  )
}
