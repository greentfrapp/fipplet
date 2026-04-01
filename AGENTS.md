# Testreel — Agent Guidelines

Testreel is a programmatic video recording library for web applications. It takes browser interactions defined in JSON/YAML and generates polished screen recordings (WebM, MP4, GIF) with cursor overlays, window chrome, backgrounds, and zoom effects. Built on Playwright and FFmpeg.

**Before writing code that uses testreel, read the relevant documentation bundled with the package.**

## Bundled Documentation

When testreel is installed as a dependency, docs are at `node_modules/testreel/dist/docs/`:

- [Getting Started](./dist/docs/getting-started.md) — Installation, first recording, quick examples
- [API Reference](./dist/docs/api-reference.md) — All exports, function signatures, types, and options
- [Recording Definitions](./dist/docs/recording-definitions.md) — JSON/YAML definition format and schema
- [Actions](./dist/docs/actions.md) — All 13 step types with parameters and defaults
- [Playwright Integration](./dist/docs/playwright.md) — Test fixtures (`page` and `testreelPage`), fixture composition
- [CLI](./dist/docs/cli.md) — `testreel` command, subcommands, and options
- [Authentication](./dist/docs/authentication.md) — Auth providers, setup blocks, session state
- [Examples](./dist/docs/examples.md) — Common patterns and recipes

When working on the testreel source repo itself, docs are at `docs/` in the project root.

## Quick Reference

### Three ways to use testreel

**1. Programmatic API:**
```ts
import { record } from 'testreel'

const result = await record('definition.yaml', { outputDir: './output' })
```

**2. Playwright test fixture:**
```ts
import { test, expect } from 'testreel/playwright'

test('demo', async ({ testreelPage }) => {
  await testreelPage.navigate('https://example.com')
  await testreelPage.click('.button')
  await testreelPage.type('input[name="search"]', 'Hello')
  await testreelPage.stop()
})
```

**3. CLI:**
```bash
testreel definition.yaml --format mp4 --output ./recordings
```

### Key concepts

- **Recording definitions** are JSON/JSONC/YAML files describing a URL, viewport, steps, and visual options
- **Steps** are a sequence of actions (`click`, `type`, `fill`, `scroll`, `zoom`, `navigate`, `wait`, etc.)
- **Post-processing** adds cursor overlay, window chrome, background, and speed changes via FFmpeg
- **Setup blocks** run before recording starts (e.g., login flows) — not captured in video
- **Selectors** accept CSS selectors, XPath, Playwright text/role selectors, or Playwright `Locator` objects
- **`${ENV_VAR}` substitution** works in all string values in definitions

### Package exports

| Import path | What it provides |
|-------------|-----------------|
| `testreel` | `record()`, `recordPage()`, `loadDefinition()`, `login()`, `resolveAuth()`, cursor utilities, types |
| `testreel/playwright` | `test`, `testreelFixtures`, `expect`, `PageRecorder`, `TestreelFixtures` type |

### JSON Schema

IDE autocomplete for definition files: reference `recording-definition.schema.json` from the package.
