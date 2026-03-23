import http from 'http'
import { WebSocket } from 'ws'

const VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Fipplet Remote Viewer</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a1a; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, sans-serif; }
  #screen { max-width: 100vw; max-height: calc(100vh - 32px); cursor: default; display: block; }
  #status { color: #888; font-size: 13px; padding: 8px; }
  #status.connected { color: #4a4; }
  #status.error { color: #a44; }
</style>
</head>
<body>
<img id="screen">
<div id="status">Connecting…</div>
<script>
const img = document.getElementById('screen');
const status = document.getElementById('status');
let deviceW = 1280, deviceH = 720, cmdId = 1;

const t0 = performance.now();
function log(msg) { console.log('[viewer-client] ' + msg + ' (+' + Math.round(performance.now() - t0) + 'ms)'); }

log('Page loaded, starting poll loop');

let pendingEvents = [];
const pendingCallbacks = {};
let polling = false;
let connected = false;

function send(method, params) {
  pendingEvents.push({ id: cmdId++, method, params: params || {} });
}

function sendWithCallback(method, params, callback) {
  const id = cmdId++;
  pendingCallbacks[id] = callback;
  pendingEvents.push({ id, method, params: params || {} });
}

function handleMessage(str) {
  const msg = JSON.parse(str);
  if (msg.id && pendingCallbacks[msg.id]) {
    pendingCallbacks[msg.id](msg.result);
    delete pendingCallbacks[msg.id];
  }
  if (msg.method === 'Page.screencastFrame') {
    log('Screencast frame received (' + Math.round(str.length / 1024) + 'KB)');
    img.src = 'data:image/jpeg;base64,' + msg.params.data;
    img.onload = () => { log('Image rendered'); img.onload = null; };
    deviceW = msg.params.metadata.deviceWidth;
    deviceH = msg.params.metadata.deviceHeight;
  }
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const events = pendingEvents;
    pendingEvents = [];
    const res = await fetch('/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    const { messages } = await res.json();
    if (!connected) {
      connected = true;
      log('First poll response');
      status.textContent = 'Connected';
      status.className = 'connected';
    }
    for (const str of messages) {
      handleMessage(str);
    }
  } catch (e) {
    log('Poll error: ' + e.message);
    if (connected) {
      connected = false;
      status.textContent = 'Disconnected — retrying…';
      status.className = 'error';
    }
    await new Promise(r => setTimeout(r, 500));
  } finally {
    polling = false;
  }
}

setInterval(poll, 50);

function coords(e) {
  const r = img.getBoundingClientRect();
  return { x: Math.round((e.clientX - r.left) * deviceW / r.width), y: Math.round((e.clientY - r.top) * deviceH / r.height) };
}

function mouseBtn(e) { return e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left'; }
let mouseDown = false, mouseButton = 'none';

img.addEventListener('mousedown', (e) => {
  e.preventDefault();
  mouseDown = true;
  mouseButton = mouseBtn(e);
  const { x, y } = coords(e);
  send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: mouseButton, clickCount: 1 });
});
img.addEventListener('mouseup', (e) => {
  e.preventDefault();
  const { x, y } = coords(e);
  send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: mouseBtn(e), clickCount: 1 });
  mouseDown = false;
  mouseButton = 'none';
});
img.addEventListener('mousemove', (e) => {
  const { x, y } = coords(e);
  send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: mouseDown ? mouseButton : 'none' });
});
img.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { x, y } = coords(e);
  send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: e.deltaX, deltaY: e.deltaY });
}, { passive: false });
img.addEventListener('contextmenu', (e) => e.preventDefault());

// Keyboard
const SPECIAL_KEYS = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 46,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Home: 36, End: 35, PageUp: 33, PageDown: 34,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117,
  F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};

document.addEventListener('keydown', (e) => {
  e.preventDefault();
  const modifiers = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

  // Clipboard: Paste
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    navigator.clipboard.readText().then(text => {
      if (text) send('Input.insertText', { text });
    });
    return;
  }

  // Clipboard: Copy
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    sendWithCallback('Runtime.evaluate',
      { expression: 'window.getSelection().toString()' },
      (result) => {
        if (result && result.result && result.result.value) {
          navigator.clipboard.writeText(result.result.value);
        }
      }
    );
    return;
  }

  // Clipboard: Cut
  if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    sendWithCallback('Runtime.evaluate',
      { expression: 'window.getSelection().toString()' },
      (result) => {
        if (result && result.result && result.result.value) {
          navigator.clipboard.writeText(result.result.value);
        }
      }
    );
    // Forward Ctrl+X to remote so it deletes the selection
    send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers });
    send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88, modifiers });
    return;
  }

  const windowsVirtualKeyCode = SPECIAL_KEYS[e.key] || e.keyCode;
  send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: e.key, code: e.code,
    windowsVirtualKeyCode, modifiers,
  });
  if (e.key.length === 1) {
    send('Input.dispatchKeyEvent', { type: 'char', text: e.key, key: e.key, code: e.code, modifiers });
  }
});
document.addEventListener('keyup', (e) => {
  e.preventDefault();
  const modifiers = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: e.key, code: e.code,
    windowsVirtualKeyCode: SPECIAL_KEYS[e.key] || e.keyCode, modifiers,
  });
});
</script>
</body>
</html>`

export function startViewer(
  cdpWsUrl: string,
  port: number,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const ts = () => `+${Math.round(performance.now() - t0)}ms`

    // Buffer CDP messages for polling clients
    let messageBuffer: string[] = []
    let lastFrameIndex: number | null = null
    let latestFrame: string | null = null
    let clientHasFrame = false
    let cdpCmdId = 1
    const serverCmdIds = new Set<number>()
    let cdpWs: WebSocket | null = null
    let shutdownRequested = false
    let firstFrameReceived = false

    function cdpSend(method: string, params: object) {
      const id = cdpCmdId++
      serverCmdIds.add(id)
      cdpWs!.send(JSON.stringify({ id, method, params }))
    }

    function connectCdp() {
      console.log(`[viewer] [${ts()}] CDP connecting to ${cdpWsUrl}`)
      cdpWs = new WebSocket(cdpWsUrl)

      cdpWs.on('open', () => {
        console.log(`[viewer] [${ts()}] CDP connected, starting screencast`)
        cdpSend('Page.enable', {})
        cdpSend('Runtime.enable', {})
        cdpSend('Page.startScreencast', {
          format: 'jpeg', quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1,
        })
      })

      cdpWs.on('message', (data) => {
        const str = data.toString()
        const msg = JSON.parse(str)

        // Skip responses to server-initiated commands
        if (msg.id && serverCmdIds.has(msg.id)) {
          serverCmdIds.delete(msg.id)
          return
        }

        if (msg.method === 'Page.screencastFrame') {
          if (!firstFrameReceived) {
            firstFrameReceived = true
            console.log(`[viewer] [${ts()}] First screencast frame received`)
          }
          latestFrame = str
          cdpSend('Page.screencastFrameAck', { sessionId: msg.params.sessionId })
          // Replace previous frame in buffer instead of accumulating stale frames
          if (lastFrameIndex !== null) {
            messageBuffer[lastFrameIndex] = str
            return
          }
          // First frame: record its index and fall through to push
          lastFrameIndex = messageBuffer.length
        }
        messageBuffer.push(str)
      })

      cdpWs.on('close', () => {
        if (!shutdownRequested) {
          console.log(`[viewer] [${ts()}] CDP disconnected, reconnecting in 1s`)
          setTimeout(connectCdp, 1000)
        }
      })

      cdpWs.on('error', (err) => {
        console.log(`[viewer] [${ts()}] CDP error: ${(err as Error).message}`)
      })
    }

    connectCdp()

    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/poll') {
        let body = ''
        req.on('data', (chunk: Buffer) => (body += chunk))
        req.on('end', () => {
          try {
            const { events } = JSON.parse(body) as { events: Array<{ id: number; method: string; params: object }> }

            // Forward client events to CDP
            if (events && cdpWs && cdpWs.readyState === WebSocket.OPEN) {
              for (const event of events) {
                cdpWs.send(JSON.stringify(event))
              }
            }

            // Drain buffered messages
            const messages = messageBuffer
            messageBuffer = []
            lastFrameIndex = null

            // On first poll, send the latest frame if the buffer was empty
            if (messages.length === 0 && latestFrame && !clientHasFrame) {
              messages.push(latestFrame)
            }
            if (messages.length > 0) {
              clientHasFrame = true
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ messages }))
          } catch {
            res.writeHead(400)
            res.end('Bad request')
          }
        })
      } else if (req.url === '/' || req.url === '/index.html') {
        console.log(`[viewer] [${ts()}] Serving HTML page to ${req.socket.remoteAddress}`)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(VIEWER_HTML)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.keepAliveTimeout = 120_000

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is in use. Try --port <other>`))
      } else {
        reject(err)
      }
    })

    server.listen(port, () => {
      const url = `http://localhost:${port}`
      console.log(`[viewer] [${ts()}] HTTP on port ${port} (polling)`)
      resolve({
        url,
        close: () =>
          new Promise<void>((res) => {
            shutdownRequested = true
            if (cdpWs) cdpWs.close()
            server.close(() => res())
          }),
      })
    })
  })
}
