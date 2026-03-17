import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSupabaseAuth } from './supabase'
import type { SupabaseAuthProvider } from '../types'

const mockConfig: SupabaseAuthProvider = {
  provider: 'supabase',
  url: 'https://abc123.supabase.co',
  serviceRoleKey: 'test-service-role-key',
  email: 'demo@example.com',
}

const mockSession = {
  access_token: 'eyJ-access-token',
  refresh_token: 'eyJ-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'user-id-123', email: 'demo@example.com' },
}

describe('resolveSupabaseAuth', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('generates a session and returns the correct localStorage key', async () => {
    fetchSpy
      // First call: generate_link
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            properties: { hashed_token: 'hashed-abc' },
          }),
          { status: 200 },
        ),
      )
      // Second call: verify
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), { status: 200 }),
      )

    const result = await resolveSupabaseAuth(mockConfig)

    expect(result.localStorage).toEqual({
      'sb-abc123-auth-token': JSON.stringify(mockSession),
    })
  })

  it('calls generate_link with correct parameters', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ properties: { hashed_token: 'h' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), { status: 200 }),
      )

    await resolveSupabaseAuth(mockConfig)

    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://abc123.supabase.co/auth/v1/admin/generate_link')
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: 'test-service-role-key',
        Authorization: 'Bearer test-service-role-key',
      },
    })
    expect(JSON.parse(options!.body as string)).toEqual({
      type: 'magiclink',
      email: 'demo@example.com',
    })
  })

  it('calls verify with the hashed token', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ properties: { hashed_token: 'my-hash' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), { status: 200 }),
      )

    await resolveSupabaseAuth(mockConfig)

    const [url, options] = fetchSpy.mock.calls[1]
    expect(url).toBe('https://abc123.supabase.co/auth/v1/verify')
    expect(JSON.parse(options!.body as string)).toEqual({
      type: 'magiclink',
      token_hash: 'my-hash',
    })
  })

  it('throws when generate_link returns an error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    )

    await expect(resolveSupabaseAuth(mockConfig)).rejects.toThrow(
      /Supabase auth failed.*401.*Unauthorized/,
    )
  })

  it('includes diagnostic info in generate_link error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    )

    await expect(resolveSupabaseAuth(mockConfig)).rejects.toThrow(
      /service_role key/,
    )
  })

  it('reads hashed_token from top-level (raw REST API format)', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ hashed_token: 'top-level-hash', id: 'user-1' }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), { status: 200 }),
      )

    await resolveSupabaseAuth(mockConfig)

    const [, options] = fetchSpy.mock.calls[1]
    expect(JSON.parse(options!.body as string).token_hash).toBe(
      'top-level-hash',
    )
  })

  it('throws when generate_link response is missing hashed_token', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }),
    )

    await expect(resolveSupabaseAuth(mockConfig)).rejects.toThrow(
      /missing hashed_token.*Response keys/,
    )
  })

  it('throws when verify returns an error', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ properties: { hashed_token: 'h' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('Invalid token', { status: 422 }),
      )

    await expect(resolveSupabaseAuth(mockConfig)).rejects.toThrow(
      'Supabase verify failed (422): Invalid token',
    )
  })

  it('extracts project ref from various URL formats', async () => {
    const configs: [string, string][] = [
      ['https://myproject.supabase.co', 'sb-myproject-auth-token'],
      ['https://xyz-789.supabase.co', 'sb-xyz-789-auth-token'],
    ]

    for (const [url, expectedKey] of configs) {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ properties: { hashed_token: 'h' } }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockSession), { status: 200 }),
        )

      const result = await resolveSupabaseAuth({ ...mockConfig, url })
      expect(Object.keys(result.localStorage!)[0]).toBe(expectedKey)
    }
  })

  it('does not return cookies or headers', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ properties: { hashed_token: 'h' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockSession), { status: 200 }),
      )

    const result = await resolveSupabaseAuth(mockConfig)
    expect(result.cookies).toBeUndefined()
    expect(result.headers).toBeUndefined()
  })
})
