import type { AuthResult, SupabaseAuthProvider } from '../types'

export async function resolveSupabaseAuth(
  config: SupabaseAuthProvider,
): Promise<AuthResult> {
  // 1. Generate a magic link via the Admin API (no email is sent)
  const generateUrl = `${config.url}/auth/v1/admin/generate_link`
  const generateRes = await fetch(generateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
    body: JSON.stringify({
      type: 'magiclink',
      email: config.email,
    }),
  })

  if (!generateRes.ok) {
    const body = await generateRes.text()
    const keyPreview = config.serviceRoleKey.slice(0, 8) + '...'
    throw new Error(
      `Supabase auth failed at POST ${generateUrl} (${generateRes.status}): ${body}\n` +
        `  project url: ${config.url}\n` +
        `  email: ${config.email}\n` +
        `  key starts with: ${keyPreview}\n` +
        `  hint: Make sure you're using the service_role key (not the anon key) from the correct project.`,
    )
  }

  const linkData = await generateRes.json()
  // The raw REST API returns hashed_token at the top level;
  // the JS client nests it under properties. Handle both.
  const hashedToken = linkData.hashed_token ?? linkData.properties?.hashed_token
  if (!hashedToken) {
    throw new Error(
      `Supabase generate_link response missing hashed_token. ` +
        `Response keys: ${Object.keys(linkData).join(', ')}`,
    )
  }

  // 2. Exchange the hashed token for a real session
  const verifyRes = await fetch(`${config.url}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.serviceRoleKey,
    },
    body: JSON.stringify({
      type: 'magiclink',
      token_hash: hashedToken,
    }),
  })

  if (!verifyRes.ok) {
    const body = await verifyRes.text()
    throw new Error(`Supabase verify failed (${verifyRes.status}): ${body}`)
  }

  const session = await verifyRes.json()

  // 3. Derive project ref from URL and build the localStorage key
  const projectRef = new URL(config.url).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`

  return {
    localStorage: {
      [storageKey]: JSON.stringify(session),
    },
  }
}
