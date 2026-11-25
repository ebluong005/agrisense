import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'

export function AccountPage() {
  const { state, signOut } = useAuth()
  const email = state.status === 'signedIn' ? state.user.email : ''
  return (
    <>
      <PageHeader title="Account" />
      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <UserRound aria-hidden className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-stone-600">Signed in as</p>
              <p className="truncate text-lg font-bold text-stone-900">{email}</p>
            </div>
          </div>
          <Button variant="secondary" fullWidth className="mt-5 sm:w-auto" icon={<LogOut aria-hidden className="size-5" />} onClick={() => signOut()}>
            Sign out
          </Button>
        </Card>
        <Card title="About your data">
          <ul className="list-disc space-y-2 pl-5 text-base text-stone-700">
            <li>Weather comes from NASA POWER: estimates for your area, not readings from your field.</li>
            <li>Field areas are calculated from the boundary you draw, so they are estimates.</li>
            <li>Warnings are prompts to check your field, not diagnoses or irrigation advice.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
