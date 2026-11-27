import { Component, type ReactNode } from 'react'

type Props = { fallback: (reset: () => void, error: unknown) => ReactNode; children: ReactNode }
type State = { error: unknown; failed: boolean }

/** Contains a failure (e.g. a lazy chunk that won't load) to one part of the page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true }
  }

  reset = () => this.setState({ error: null, failed: false })

  render() {
    return this.state.failed ? this.props.fallback(this.reset, this.state.error) : this.props.children
  }
}
