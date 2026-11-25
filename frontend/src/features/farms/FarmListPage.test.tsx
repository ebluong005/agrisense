import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { farm, mockApi } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { FarmListPage } from './FarmListPage'

const me = () => ({ json: { id: 1, email: 'farmer@example.com' } })

describe('FarmListPage', () => {
  beforeEach(() => localStorage.setItem('agrisense_token', 'tok'))

  it('guides a new farmer to add their first farm', async () => {
    mockApi({ 'GET /auth/me': me, 'GET /farms': () => ({ json: [] }) })
    renderRoute('/', <FarmListPage />)
    expect(await screen.findByRole('heading', { name: "Let's add your first farm" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add my farm' })).toHaveAttribute('href', '/farms/new')
  })

  it('lists farms as links to their dashboards', async () => {
    mockApi({ 'GET /auth/me': me, 'GET /farms': () => ({ json: [farm] }) })
    renderRoute('/', <FarmListPage />)
    const link = await screen.findByRole('link', { name: /Creek Farm/ })
    expect(link).toHaveAttribute('href', '/farms/7')
    expect(link).toHaveTextContent('32.2226° N, 110.9747° W')
  })

  it('shows an error with a working retry', async () => {
    let fail = true
    mockApi({ 'GET /auth/me': me, 'GET /farms': () => (fail ? { status: 500 } : { json: [farm] }) })
    renderRoute('/', <FarmListPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Creek Farm/ })).toBeInTheDocument()
  })
})
