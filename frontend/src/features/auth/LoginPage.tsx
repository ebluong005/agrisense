import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { useAction } from '../../hooks/useApi'
import { AuthForm } from './AuthForm'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { state, signIn } = useAuth()
  // On success the PublicOnly guard redirects to the page the farmer originally asked for.
  const action = useAction(signIn)
  const message =
    action.error?.status === 401 ? "That email and password don't match. Please check them and try again." : (action.error?.message ?? null)

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. See how your fields are doing.">
      <AuthForm
        mode="login"
        onSubmit={async (email, password) => void (await action.run(email, password))}
        pending={action.pending}
        error={message}
        notice={state.status === 'signedOut' ? state.notice : undefined}
      />
      <p className="mt-6 text-center text-base text-stone-700">
        New to AgriSense?{' '}
        <Link to="/register" className="font-semibold text-brand-800 underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
