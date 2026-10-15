import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import { app } from '../src/app'
import { verifyGithubSignature } from '../src/modules/github/github.signature'

describe('app', () => {
  it('GET /health returns ok', async () => {
    const res = await app.request('/health')

    expect(res.status).toBe(200)

    const body = await res.json()

    expect((body as { message: string }).message).toBe("OK")
  })

  it('GET /api/v1/health returns ok', async () => {
    const res = await app.request('/api/v1/health')

    expect(res.status).toBe(200)

    const body = await res.json()

    expect((body as { message: string }).message).toBe("OK")
  })

  it('GET /missing returns 404', async () => {
    const res = await app.request('/missing')

    expect(res.status).toBe(404)
  })

  it('POST /api/webhooks/github rejects a bad signature before parsing', async () => {
    const res = await app.request('/api/webhooks/github', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery-1',
        'x-hub-signature-256': 'sha256=deadbeef',
      },
      body: '{"zen":true}',
    })

    expect(res.status).toBe(401)
  })

  it('accepts a matching GitHub webhook signature', () => {
    const body = '{"zen":true}'
    const secret = 'webhook-secret'
    const digest = createHmac('sha256', secret).update(body).digest('hex')

    expect(verifyGithubSignature(body, `sha256=${digest}`, secret)).toBe(true)
    expect(verifyGithubSignature(body, 'sha256=deadbeef', secret)).toBe(false)
    expect(verifyGithubSignature(body, `sha256=${digest}`, '')).toBe(false)
  })
})