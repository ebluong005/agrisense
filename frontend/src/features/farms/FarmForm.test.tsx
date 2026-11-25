import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FarmForm } from './FarmForm'

// Leaflet can't render in jsdom; the picker is exercised in the browser smoke test.
vi.mock('../../components/map/LocationPicker', () => ({
  LocationPicker: ({ onChange }: { onChange: (p: { lat: number; lon: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 41.5, lon: -93.25 })}>
      Fake map tap
    </button>
  ),
}))

describe('FarmForm', () => {
  it('asks for a name and a location before saving', async () => {
    const onSubmit = vi.fn()
    render(<FarmForm submitLabel="Save farm" pending={false} error={null} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }))
    expect(screen.getByText('Please give your farm a name.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Please mark where your farm is')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('saves a location chosen on the map', async () => {
    const onSubmit = vi.fn()
    render(<FarmForm submitLabel="Save farm" pending={false} error={null} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Farm name'), '  Home farm ')
    await userEvent.click(screen.getByRole('button', { name: 'Fake map tap' }))
    expect(screen.getByText('Selected: 41.5000° N, 93.2500° W')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Home farm', latitude: 41.5, longitude: -93.25 })
  })

  it('accepts typed coordinates as a keyboard-only alternative', async () => {
    const onSubmit = vi.fn()
    render(<FarmForm submitLabel="Save farm" pending={false} error={null} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Farm name'), 'Typed')
    await userEvent.click(screen.getByText('Type coordinates instead'))
    await userEvent.type(screen.getByLabelText('Latitude'), '32.2')
    await userEvent.type(screen.getByLabelText('Longitude'), '-110.9')
    await userEvent.click(screen.getByRole('button', { name: 'Save farm' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Typed', latitude: 32.2, longitude: -110.9 })
  })

  it('shows server errors', () => {
    render(<FarmForm submitLabel="Save farm" pending={false} error="latitude: Input should be less than or equal to 90" onSubmit={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('latitude: Input should be')
  })
})
