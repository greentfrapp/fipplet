# Contributing to testreel

Thanks for your interest in contributing! This guide will get you up and running.

## Development setup

```bash
git clone https://github.com/greentfrapp/testreel.git
cd testreel
npm install
npx playwright install chromium
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build with tsup (outputs to `dist/`) |
| `npm run dev` | Build in watch mode |
| `npm test` | Run unit tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:examples` | Run integration tests (requires build first) |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting |

## Project structure

```
src/
  index.ts          # Main API entry point
  cli.ts            # CLI entry point
  fixture.ts        # Playwright test fixture entry point
  recorder.ts       # High-level recording orchestration
  record-page.ts    # Low-level page recording API
  actions.ts        # Step action handlers
  cursor.ts         # Cursor tracking and events
  pipeline.ts       # FFmpeg filter graph construction
  post-process.ts   # FFmpeg execution and format conversion
  types.ts          # TypeScript type definitions
  __tests__/        # Unit tests
```

## Making changes

1. Create a branch from `main`
2. Make your changes
3. Run `npm run format` to format code
4. Run `npm test` to verify tests pass
5. Open a pull request

## Code style

- Prettier handles formatting (single quotes, no semicolons, trailing commas)
- Strict TypeScript — fix type errors, don't suppress them
- Imports are sorted automatically by the Prettier plugin

## Testing

- Unit tests go in `src/__tests__/` and use vitest
- Integration tests go in `examples/` and use Playwright
- Run `npm run build && npm run test:examples` for integration tests

## Reporting bugs

Open an issue at https://github.com/greentfrapp/testreel/issues with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS
