import fs from 'fs'
import path from 'path'
import { input, select, confirm } from '@inquirer/prompts'

export async function runInit(): Promise<void> {
  const url = await input({
    message: 'What URL should the recording open?',
    validate: (val) => {
      try {
        new URL(val)
        return true
      } catch {
        return 'Please enter a valid URL (e.g., https://example.com)'
      }
    },
  })

  const widthStr = await input({
    message: 'Viewport width',
    default: '1280',
    validate: (val) => {
      const n = parseInt(val, 10)
      return !isNaN(n) && n > 0 ? true : 'Must be a positive number'
    },
  })

  const heightStr = await input({
    message: 'Viewport height',
    default: '720',
    validate: (val) => {
      const n = parseInt(val, 10)
      return !isNaN(n) && n > 0 ? true : 'Must be a positive number'
    },
  })

  const authMethod = await select({
    message: 'Auth method',
    choices: [
      { name: 'None', value: 'none' },
      { name: 'Storage state (Playwright session file)', value: 'storageState' },
      { name: 'localStorage injection', value: 'localStorage' },
      { name: 'Supabase auth provider', value: 'supabase' },
    ],
  })

  const filename = await input({
    message: 'Output filename',
    default: 'recording.json',
    validate: (val) => val.trim().length > 0 ? true : 'Filename cannot be empty',
  })

  const outPath = path.resolve(filename)

  if (fs.existsSync(outPath)) {
    const overwrite = await confirm({
      message: `${filename} already exists. Overwrite?`,
      default: false,
    })
    if (!overwrite) {
      console.log('Aborted.')
      return
    }
  }

  const definition: Record<string, unknown> = {
    $schema: 'https://fipplet.dev/recording-definition.schema.json',
    url,
    viewport: {
      width: parseInt(widthStr, 10),
      height: parseInt(heightStr, 10),
    },
  }

  if (authMethod === 'storageState') {
    definition.storageState = './state.json'
  } else if (authMethod === 'localStorage') {
    definition.localStorage = {
      'auth-token': 'YOUR_TOKEN_HERE',
    }
  } else if (authMethod === 'supabase') {
    definition.auth = {
      provider: 'supabase',
      url: '${SUPABASE_URL}',
      serviceRoleKey: '${SUPABASE_SERVICE_ROLE_KEY}',
      email: '${SUPABASE_USER_EMAIL}',
    }
  }

  definition.steps = [
    { action: 'wait', ms: 1000 },
    { action: 'screenshot', name: 'initial' },
  ]

  fs.writeFileSync(outPath, JSON.stringify(definition, null, 2) + '\n')
  console.log(`\nCreated ${filename}`)
}
