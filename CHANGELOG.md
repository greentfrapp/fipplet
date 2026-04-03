# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `clean` option to remove previous output files before recording (CLI: `--clean`, API: `clean: true`)
- GitHub Actions CI (Node 18, 20, 22) and automated npm release workflow
- CONTRIBUTING.md with development setup instructions
- README badges for npm version, CI status, and license

### Changed
- Playwright fixture now defaults to `clean: true` to prevent output file accumulation

## [0.1.1] - 2026-03-31

### Fixed
- FFmpeg resolution in ESM projects — async fallback chain: `FFMPEG_PATH` env var, `require('ffmpeg-static')`, `import('ffmpeg-static')`, system `ffmpeg`
- Improved FFmpeg ENOENT error message with actionable install/config suggestions

### Added
- `name` option in `RecordPageOptions` for stable output filenames (e.g., `add-product-demo.webm`)
- Playwright fixture defaults recording name to sanitized test title
- `SelectorOrLocator` type — `PageRecorder` methods now accept Playwright `Locator` objects in addition to string selectors
- JSDoc documentation on `TestreelFixtures` and all `PageRecorder` methods
- Fixture composition guide with performance notes in Playwright docs

## [0.1.0] - 2026-03-30

### Added
- Initial release
- `record()` API for recording from JSON/JSONC/YAML definitions
- `recordPage()` API for manual Playwright page recording
- Playwright test fixture (`testreel/playwright`)
- CLI with `record`, `validate`, `init`, and `login` commands
- 13 step actions: click, type, fill, clear, select, scroll, hover, keyboard, navigate, screenshot, zoom, wait, waitForNetwork
- Animated cursor overlay with click ripples
- macOS-style window chrome rendering
- Background styling with gradients, padding, and rounded corners
- Output formats: WebM (default), MP4, GIF
- Retina/HiDPI support via `scale` option
- Environment variable substitution in definitions (`${VAR}`)
- Authentication: setup blocks, localStorage/cookies, storage state, interactive login, Supabase provider
- Global and per-step speed control
- JSON Schema for IDE autocomplete

[Unreleased]: https://github.com/greentfrapp/testreel/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/greentfrapp/testreel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/greentfrapp/testreel/releases/tag/v0.1.0
