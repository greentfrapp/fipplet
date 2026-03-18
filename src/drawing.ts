import zlib from 'zlib'

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcBuf])
}

/** Encode raw RGBA pixel data into a minimal PNG file. */
export function encodePng(width: number, height: number, rgbaData: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type: RGBA
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  const rowBytes = 1 + width * 4
  const rawRows = Buffer.alloc(height * rowBytes)
  for (let y = 0; y < height; y++) {
    rawRows[y * rowBytes] = 0 // filter: None
    rgbaData.copy(rawRows, y * rowBytes + 1, y * width * 4, (y + 1) * width * 4)
  }
  const compressed = zlib.deflateSync(rawRows)

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export interface RGB {
  r: number
  g: number
  b: number
}

/** Parse '#RRGGBB' or '#RGB' hex color to { r, g, b }. */
export function parseHexColor(hex: string): RGB {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Convert '#RRGGBB' to FFmpeg '0xRRGGBB' format. */
export function hexToFFmpeg(hex: string): string {
  return '0x' + hex.replace(/^#/, '').padEnd(6, '0')
}

export function lighten(c: RGB, amount: number): RGB {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
  }
}

export function darken(c: RGB, amount: number): RGB {
  return {
    r: Math.round(c.r * (1 - amount)),
    g: Math.round(c.g * (1 - amount)),
    b: Math.round(c.b * (1 - amount)),
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ---------------------------------------------------------------------------
// Pixel operations
// ---------------------------------------------------------------------------

export function setPixel(
  data: Buffer,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  const i = (y * width + x) * 4
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = a
}

export function blendPixel(
  data: Buffer,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  const i = (y * width + x) * 4
  const srcA = a / 255
  const dstA = data[i + 3] / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA === 0) return
  data[i] = Math.round((r * srcA + data[i] * dstA * (1 - srcA)) / outA)
  data[i + 1] = Math.round((g * srcA + data[i + 1] * dstA * (1 - srcA)) / outA)
  data[i + 2] = Math.round((b * srcA + data[i + 2] * dstA * (1 - srcA)) / outA)
  data[i + 3] = Math.round(outA * 255)
}

// ---------------------------------------------------------------------------
// Bitmap font renderer (6x10 grid per glyph, printable ASCII 0x20–0x7E)
// ---------------------------------------------------------------------------

// Each glyph is 5 columns × 8 rows packed into 5 bytes (one byte per column, MSB = top row).
// Stored as a hex string: 10 hex chars per glyph, 95 glyphs (space through tilde).
const FONT_DATA =
  '0000000000' + // space
  '005f000000' + // !
  '0003000300' + // "
  '147f147f14' + // #
  '24'+'2a'+'7f'+'2a'+'12' + // $
  '2313086462' + // %
  '3649562050' + // &
  '0003000000' + // '
  '001c224100' + // (
  '0041221c00' + // )
  '0a047f040a' + // *
  '08083e0808' + // +
  '0050300000' + // ,
  '0808080808' + // -
  '0060600000' + // .
  '2010080402' + // /
  '3e5149453e' + // 0
  '00427f4000' + // 1
  '4261514946' + // 2
  '2141454b31' + // 3
  '1814127f10' + // 4
  '2745454539' + // 5
  '3c4a494930' + // 6
  '0161110907' + // 7
  '3649494936' + // 8
  '064949291e' + // 9
  '0036360000' + // :
  '0056360000' + // ;
  '0008142241' + // <
  '1414141414' + // =
  '0041221408' + // >
  '0201510906' + // ?
  '324979413e' + // @
  '7e1111117e' + // A
  '7f49494936' + // B
  '3e41414122' + // C
  '7f4141221c' + // D
  '7f49494941' + // E
  '7f09090901' + // F
  '3e41495932' + // G
  '7f0808087f' + // H
  '00417f4100' + // I
  '2040413f01' + // J
  '7f08142241' + // K
  '7f40404040' + // L
  '7f020c027f' + // M
  '7f0408107f' + // N
  '3e4141413e' + // O
  '7f09090906' + // P
  '3e4151215e' + // Q
  '7f09192946' + // R
  '2649494932' + // S
  '01017f0101' + // T
  '3f4040403f' + // U
  '1f2040201f' + // V
  '3f4038403f' + // W
  '6314081463' + // X
  '0304780403' + // Y
  '6151494543' + // Z
  '007f414100' + // [
  '0204081020' + // backslash
  '00414'+'17f00' + // ]
  '0402010204' + // ^
  '4040404040' + // _
  '0001020400' + // `
  '2054545478' + // a
  '7f48444438' + // b
  '3844444428' + // c
  '38444448'+'7f' + // d
  '3854545418' + // e
  '087e090102' + // f
  '0c52525244' + // g
  '7f08040478' + // h
  '00447d4000' + // i
  '2040443d00' + // j
  '7f10284400' + // k
  '00417f4000' + // l
  '7c04180478' + // m
  '7c08040478' + // n
  '3844444438' + // o
  '7c14141408' + // p
  '0814147c40' + // q
  '7c08040408' + // r
  '4854545424' + // s
  '043f444020' + // t
  '3c4040207c' + // u
  '1c2040201c' + // v
  '3c4030403c' + // w
  '4428102844' + // x
  '0c50502044' + // y
  '4464544c44' + // z
  '0008364100' + // {
  '00007f0000' + // |
  '0041360800' + // }
  '0402040804'   // ~

/** Decode a glyph from the font data. Returns a 5×8 boolean grid (column-major). */
function getGlyph(ch: string): boolean[][] {
  const code = ch.charCodeAt(0)
  if (code < 0x20 || code > 0x7e) return getGlyph('?')
  const idx = (code - 0x20) * 10
  const cols: boolean[][] = []
  for (let c = 0; c < 5; c++) {
    const byte = parseInt(FONT_DATA.slice(idx + c * 2, idx + c * 2 + 2), 16)
    const column: boolean[] = []
    for (let r = 0; r < 8; r++) {
      column.push(!!(byte & (1 << r)))
    }
    cols.push(column)
  }
  return cols
}

/** Measure text width in pixels at the given scale. Glyphs are 5px wide + 1px gap. */
export function measureText(text: string, scale: number): number {
  return text.length * 6 * scale - scale
}

/** Render text into an RGBA buffer using the bitmap font. */
export function renderText(
  data: Buffer,
  bufWidth: number,
  text: string,
  startX: number,
  startY: number,
  scale: number,
  color: RGB,
  alpha: number = 255,
) {
  let cursorX = startX
  for (const ch of text) {
    const glyph = getGlyph(ch)
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 8; row++) {
        if (glyph[col][row]) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cursorX + col * scale + sx
              const py = startY + row * scale + sy
              blendPixel(data, bufWidth, px, py, color.r, color.g, color.b, alpha)
            }
          }
        }
      }
    }
    cursorX += 6 * scale
  }
}
