import qrcode from 'qrcode-generator'

export const QR_LIGHT = '#f7f5f0'
export const QR_DARK = '#16151a'

/** The dark modules of a QR code, with a 4-module quiet zone: `count` is the full width in modules */
export function qrModules(text: string): { dark: [number, number][]; count: number } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const dark: [number, number][] = []
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(row, col)) dark.push([col + 4, row + 4])
    }
  }
  return { dark, count: n + 8 }
}

/** The QR code as a PNG, sharp at any size it gets pasted at */
export function qrPng(text: string, scale = 12): Promise<Blob> {
  const { dark, count } = qrModules(text)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = count * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = QR_LIGHT
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = QR_DARK
  for (const [x, y] of dark) ctx.fillRect(x * scale, y * scale, scale, scale)
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'))
}
