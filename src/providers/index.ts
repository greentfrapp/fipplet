import type { AuthProvider, AuthResult } from '../types'
import { resolveSupabaseAuth } from './supabase'

export async function resolveAuth(config: AuthProvider): Promise<AuthResult> {
  switch (config.provider) {
    case 'supabase':
      return resolveSupabaseAuth(config)
    default:
      throw new Error(
        `Unknown auth provider: '${(config as { provider: string }).provider}'`,
      )
  }
}
