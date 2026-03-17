import http from 'http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { startViewer } from './remote-viewer'

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer()
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })
}

/** Minimal mock CDP server that records received messages and lets tests push messages to the client */
function createMockCdp(port: number): Promise<{
  wss: WebSocketServer
  url: string
  received: string[]
  sendToClient: (msg: object) => void
  waitForConnection: () => Promise<void>
}> {
  return new Promise((resolve) => {
    const received: string[] = []
    let client: WebSocket | null = null
    let connectionResolve: (() => void) | null = null
    const connectionPromise = new Promise<void>((r) => {
      connectionResolve = r
    })

    const wss = new WebSocketServer({ port }, () => {
      resolve({
        wss,
        url: `ws://127.0.0.1:${port}`,
        received,
        sendToClient: (msg: object) => {
          if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msg))
          }
        },
        waitForConnection: () => connectionPromise,
      })
    })

    wss.on('connection', (ws) => {
      client = ws
      ws.on('message', (data) => received.push(data.toString()))
      connectionResolve?.()
    })
  })
}

function poll(
  port: number,
  events: object[] = [],
): Promise<{ status: number; messages: string[] }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ events })
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/poll', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => (data += chunk))
        res.on('end', () => {
          resolve({ status: res.statusCode!, messages: JSON.parse(data).messages })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, body: data }))
    }).on('error', reject)
  })
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('startViewer', () => {
  let cdpPort: number
  let viewerPort: number
  let mockCdp: Awaited<ReturnType<typeof createMockCdp>>
  let viewer: { url: string; close: () => Promise<void> }

  beforeEach(async () => {
    ;[cdpPort, viewerPort] = await Promise.all([findFreePort(), findFreePort()])
    mockCdp = await createMockCdp(cdpPort)
    viewer = await startViewer(mockCdp.url, viewerPort)
    await mockCdp.waitForConnection()
    // Wait for CDP initialization commands (Page.enable, Runtime.enable, Page.startScreencast)
    await wait(50)
  })

  afterEach(async () => {
    await viewer.close()
    mockCdp.wss.close()
  })

  it('serves HTML on GET /', async () => {
    const res = await httpGet(viewerPort, '/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('Fipplet Remote Viewer')
    expect(res.body).toContain('poll')
  })

  it('returns 404 for unknown paths', async () => {
    const res = await httpGet(viewerPort, '/unknown')
    expect(res.status).toBe(404)
  })

  it('returns empty messages when no CDP messages buffered', async () => {
    const res = await poll(viewerPort)
    expect(res.status).toBe(200)
    expect(res.messages).toEqual([])
  })

  it('sends CDP initialization commands on connect', async () => {
    const methods = mockCdp.received.map((m) => JSON.parse(m).method)
    expect(methods).toContain('Page.enable')
    expect(methods).toContain('Runtime.enable')
    expect(methods).toContain('Page.startScreencast')
  })

  it('buffers CDP messages and returns them on poll', async () => {
    const msg = { id: 999, result: { value: 'hello' } }
    mockCdp.sendToClient(msg)
    await wait(20)

    const res = await poll(viewerPort)
    expect(res.messages).toHaveLength(1)
    expect(JSON.parse(res.messages[0])).toEqual(msg)
  })

  it('drains buffer after poll — second poll returns empty', async () => {
    mockCdp.sendToClient({ id: 999, result: {} })
    await wait(20)

    const first = await poll(viewerPort)
    expect(first.messages).toHaveLength(1)

    const second = await poll(viewerPort)
    expect(second.messages).toHaveLength(0)
  })

  it('forwards client events to CDP', async () => {
    const before = mockCdp.received.length
    await poll(viewerPort, [{ id: 50, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 100, y: 200 } }])
    await wait(20)

    const forwarded = mockCdp.received.slice(before)
    expect(forwarded.length).toBeGreaterThanOrEqual(1)
    const parsed = JSON.parse(forwarded[forwarded.length - 1])
    expect(parsed.method).toBe('Input.dispatchMouseEvent')
    expect(parsed.params.x).toBe(100)
  })

  it('deduplicates screencast frames — only latest frame in buffer', async () => {
    // Send two frames before polling
    mockCdp.sendToClient({
      method: 'Page.screencastFrame',
      params: { data: 'frame1data', sessionId: 1, metadata: { deviceWidth: 1280, deviceHeight: 720 } },
    })
    await wait(10)
    mockCdp.sendToClient({
      method: 'Page.screencastFrame',
      params: { data: 'frame2data', sessionId: 2, metadata: { deviceWidth: 1280, deviceHeight: 720 } },
    })
    await wait(20)

    const res = await poll(viewerPort)
    // Should have exactly one screencast frame (the latest)
    const frames = res.messages
      .map((m) => JSON.parse(m))
      .filter((m: { method?: string }) => m.method === 'Page.screencastFrame')
    expect(frames).toHaveLength(1)
    expect(frames[0].params.data).toBe('frame2data')
  })

  it('sends latest frame on first poll only, not on subsequent idle polls', async () => {
    // Send a frame
    mockCdp.sendToClient({
      method: 'Page.screencastFrame',
      params: { data: 'initialframe', sessionId: 1, metadata: { deviceWidth: 1280, deviceHeight: 720 } },
    })
    await wait(20)

    // First poll gets the frame
    const first = await poll(viewerPort)
    const firstFrames = first.messages
      .map((m) => JSON.parse(m))
      .filter((m: { method?: string }) => m.method === 'Page.screencastFrame')
    expect(firstFrames).toHaveLength(1)

    // Second idle poll should NOT re-send the same frame
    const second = await poll(viewerPort)
    expect(second.messages).toHaveLength(0)

    // Third idle poll also empty
    const third = await poll(viewerPort)
    expect(third.messages).toHaveLength(0)
  })

  it('filters out server-initiated CDP command responses', async () => {
    // The server sends Page.enable, Runtime.enable, Page.startScreencast on connect.
    // Responses to those should be filtered out.
    // Find the IDs the server used
    const serverIds = mockCdp.received.map((m) => JSON.parse(m).id)

    // Send responses for those IDs
    for (const id of serverIds) {
      mockCdp.sendToClient({ id, result: {} })
    }
    await wait(20)

    // None of these should appear in poll results
    const res = await poll(viewerPort)
    for (const msg of res.messages) {
      const parsed = JSON.parse(msg)
      expect(serverIds).not.toContain(parsed.id)
    }
  })

  it('returns 400 for invalid POST body', async () => {
    const res = await new Promise<{ status: number }>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: viewerPort, path: '/poll', method: 'POST' },
        (res) => {
          res.resume()
          res.on('end', () => resolve({ status: res.statusCode! }))
        },
      )
      req.on('error', reject)
      req.end('not json')
    })
    expect(res.status).toBe(400)
  })
})
