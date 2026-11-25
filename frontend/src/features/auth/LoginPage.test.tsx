import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('explains a wrong password in plain language', async () => {
    mockApi({ 'POST /auth/login': () => ({ status: 401, json: { detail: 'Invalid credentials' } }) })
    renderRoute('/login', <LoginPage />, { publicPage: true })
    await userEvent.type(screen.getByLabelText('Email address'), 'farmer@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match")
  })

  it('signs in, stores the session and opens the app', async () => {
    const { calls } = mockApi({
      'POST /auth/login': () => ({ json: { access_token: 'tok-1', token_type: 'bearer' } }),
      'GET /auth/me': () => ({ json: { id: 1, email: 'farmer@example.com' } }),
    })
    renderRoute('/login', <LoginPage />, { publicPage: true, extra: [{ path: '/', element: <p>My farms screen</p> }] })
    await userEvent.type(screen.getByLabelText('Email address'), '  farmer@example.com ')
    await userEvent.type(screen.getByLabelText('Password'), 'right-password-1')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('My farms screen')).toBeInTheDocument()
    expect(localStorage.getItem('agrisense_token')).toBe('tok-1')
    expect(calls[0].body).toEqual({ email: 'farmer@example.com', password: 'right-password-1' })
  })

  it('sends signed-out visitors of private pages to login', async () => {
    mockApi({})
    renderRoute('/', <p>Secret</p>)
    expect(await screen.findByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })

  it('keeps a saved session when the network is down and offers a retry', async () => {
    localStorage.setItem('agrisense_token', 'saved')
    let online = false
    mockApi({ 'GET /auth/me': () => (online ? { json: { id: 1, email: 'a@b.co' } } : { status: 503 }) })
    renderRoute('/', <p>My farms screen</p>)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Can't reach AgriSense/)
    expect(localStorage.getItem('agrisense_token')).toBe('saved')
    online = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('My farms screen')).toBeInTheDocument())
  })
})
