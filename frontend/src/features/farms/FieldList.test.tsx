import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { field, mockApi } from '../../test/fetchMock'
import { FieldList } from './FieldList'

describe('FieldList', () => {
  it('deletes a field only after confirmation', async () => {
    const { calls } = mockApi({ 'DELETE /fields/3': () => ({ status: 204 }) })
    const onChanged = vi.fn()
    render(
      <MemoryRouter>
        <FieldList farmId={7} fields={[field]} onChanged={onChanged} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Wheat · about 258.7 acres (104.7 ha) · planted Mar 15, 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'South field' })).toHaveAttribute('href', '/farms/7/fields/3')
    expect(screen.getByRole('link', { name: 'Edit South field' })).toHaveAttribute('href', '/farms/7/fields/3/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Delete South field' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete South field?' })
    expect(calls).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete field' }))
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/fields/3' })
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
