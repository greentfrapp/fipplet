# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Testreel is a programmatic video recording library for web applications. It takes browser interactions defined in JSON/YAML and generates polished screen recordings (WebM, MP4, GIF) with cursor overlays, window chrome, backgrounds, and zoom effects. Built on Playwright for browser automation and FFmpeg for video post-processing.

## Commands

- **Build:** `npm run build` (tsup, outputs to `dist/`)
- **Dev:** `npm run dev` (tsup watch mode)
- **Test:** `npm test` (vitest)
- **Single test:** `npx vitest run src/__tests__/cursor.test.ts`
- **Test watch:** `npm run test:watch`
- **Integration tests:** `npm run test:examples` (Playwright-based, requires build first)
- **Format:** `npm run format` (Prettier)
- **Format check:** `npm run format:check`

## Architecture

**Three entry points** (built via tsup):
1. `src/index.ts` → main API (`record()`, `loadDefinition()`, `login()`, etc.) — ESM + CJS
2. `src/cli.ts` → CLI (`testreel` command) — CJS with shebang
3. `src/fixture.ts` → Playwright test fixture (`testreel/playwright`) — ESM + CJS

**Core recording flow:**
`loadDefinition()` → `record()` → launch browser → run setup block (no video) → create recording context → execute steps sequentially → stop recording → post-process with FFmpeg (cursor overlay → window frame → background → speed/zoom)

**Key modules:**
- `recorder.ts` — orchestrates the full recording pipeline
- `record-page.ts` — lower-level API for manual page recording (used by Playwright fixture)
- `actions.ts` — step action handlers mapped via `ACTIONS` registry; step types are a discriminated union in `types.ts`
- `post-process.ts` / `pipeline.ts` — FFmpeg filter graph construction and execution
- `chrome-renderer.ts` / `window-frame.ts` — renders macOS-style window chrome and background as PNGs via Playwright, then composites via FFmpeg
- `cursor.ts` — tracks cursor positions over time, serialized to JSON for FFmpeg overlay
- `validation.ts` — loads JSON/JSONC/YAML configs with `${ENV_VAR}` substitution

**Auth system:** `providers/` directory with a router pattern. Currently supports Supabase magic link auth.

## Code Conventions

- ES Module project (`"type": "module"` in package.json)
- Strict TypeScript, target ES2022, bundler module resolution
- Prettier with single quotes, no semicolons, trailing commas, `@trivago/prettier-plugin-sort-imports`
- CLI uses lazy imports to avoid loading heavy modules (playwright-core) at startup
- `playwright-core` is external (peer dependency, not bundled)
- tsup build has a custom esbuild plugin (`resolvePngAssets`) that copies cursor PNGs to dist
- SVG and HTML files are imported as text strings (tsup loader config)

## Testing

- Vitest for unit tests in `src/__tests__/`
- Tests use `vi.fn()` mocks with minimal mock objects
- Playwright integration tests in `examples/` (separate playwright.config.ts)
- JSON Schema at `recording-definition.schema.json` for config file validation/IDE autocomplete
