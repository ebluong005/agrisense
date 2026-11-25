import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  ghost: 'text-brand-800 hover:bg-brand-50',
}

function buttonClass(variant: Variant = 'primary', fullWidth = false, extra = '') {
  return `${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${extra}`.trim()
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  fullWidth?: boolean
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', fullWidth, loading, icon, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, fullWidth, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', fullWidth, icon, children, className = '', ...rest }: LinkProps & { variant?: Variant; fullWidth?: boolean; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, fullWidth, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
