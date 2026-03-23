# Examples

Common recording patterns to get you started.

## Simple page walkthrough

Scroll through a page and capture key sections:

```json
{
  "url": "https://en.wikipedia.org/wiki/Main_Page",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot", "name": "above-fold" },
    { "action": "scroll", "y": 400 },
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": "#mp-tfa a:first-of-type" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "article" }
  ]
}
```

## Form filling demo

Show a sign-up flow with realistic typing:

```json
{
  "url": "https://app.example.com/signup",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "type", "selector": "#name", "text": "Jane Smith", "delay": 60 },
    { "action": "type", "selector": "#email", "text": "jane@example.com", "delay": 60 },
    { "action": "fill", "selector": "#password", "text": "s3cure-password" },
    { "action": "screenshot", "name": "form-filled" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "success" }
  ]
}
```

## Zoom and highlight

Draw attention to a specific part of the page:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "zoom", "selector": ".feature-card", "scale": 2.5, "duration": 800 },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "zoomed-feature" },
    { "action": "zoom", "scale": 1, "duration": 600 },
    { "action": "wait", "ms": 500 }
  ]
}
```

## GIF for pull requests

Create a small, lightweight GIF to embed in a PR description:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 800, "height": 600 },
  "outputFormat": "gif",
  "speed": 1.5,
  "steps": [
    { "action": "wait", "ms": 500 },
    { "action": "hover", "selector": ".new-feature" },
    { "action": "click", "selector": ".new-feature" },
    { "action": "wait", "ms": 1000 }
  ]
}
```

## Polished demo with window chrome

Add macOS-style chrome and a gradient background for marketing/docs:

```json
{
  "url": "https://app.example.com",
  "viewport": { "width": 1280, "height": 720 },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#667eea", "to": "#764ba2" },
    "padding": 60,
    "borderRadius": 12
  },
  "outputFormat": "mp4",
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": ".demo-button" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "hero" }
  ]
}
```

## Authenticated app recording

Record a dashboard that requires login, using a setup block:

```json
{
  "url": "https://app.example.com/dashboard",
  "viewport": { "width": 1280, "height": 720 },
  "setup": {
    "url": "https://app.example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "text": "${TEST_USER_EMAIL}" },
      { "action": "fill", "selector": "#password", "text": "${TEST_USER_PASSWORD}" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "wait", "ms": 3000 }
    ]
  },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot", "name": "dashboard" },
    { "action": "click", "selector": "[data-tab=analytics]" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "analytics" }
  ]
}
```

## Wait for async content

Wait for an API response before interacting:

```json
{
  "url": "https://app.example.com/reports",
  "steps": [
    { "action": "click", "selector": "button.load-report" },
    { "action": "waitForNetwork", "urlPattern": "/api/reports" },
    { "action": "screenshot", "name": "report-loaded" },
    { "action": "zoom", "selector": ".chart", "scale": 2 },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "chart-zoomed" }
  ]
}
```

## Using environment variables

Keep secrets out of your definition files:

```json
{
  "url": "https://${APP_HOST}/dashboard",
  "localStorage": {
    "auth-token": "${AUTH_TOKEN}"
  },
  "steps": [
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "dashboard" }
  ]
}
```

```bash
APP_HOST=staging.example.com AUTH_TOKEN=eyJ... npx fipplet recording.json
```
