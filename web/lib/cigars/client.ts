export const API_BASE = '/api/cigars'

class CigarsClientError extends Error {
  statusCode: number
  code: string
  constructor(code: string, statusCode = 0, message?: string) {
    super(message || code)
    this.name = 'CigarsClientError'
    this.code = code
    this.statusCode = statusCode
  }
}

export const cigarsClient = {
  async list() {
    try {
      const res = await fetch(API_BASE, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }))
        throw new CigarsClientError('LIST_FAILED', res.status, error.error || 'Failed to list cigars')
      }
      const body = await res.json()
      return body.data || []
    } catch (err) {
      if (err instanceof CigarsClientError) throw err
      throw new CigarsClientError('NETWORK_ERROR', 0, String(err))
    }
  }
}
