import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { useAction } from '../../hooks/useApi'
import { AuthForm } from './AuthForm'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const { signUp } = useAuth()
  const action = useAction(signUp)
  const message =
    action.error?.status === 409 ? 'An account with this email already exists. Try signing in instead.' : (action.error?.message ?? null)

  return (
    <AuthLayout title="Create your account" subtitle="Add your farm in a few minutes. You only need an email address.">
      <AuthForm mode="register" onSubmit={async (email, password) => void (await action.run(email, password))} pending={action.pending} error={message} />
      <p className="mt-6 text-center text-base text-stone-700">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-800 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
