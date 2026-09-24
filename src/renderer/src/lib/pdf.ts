import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

// Un único worker compartido por todos los documentos: destruir un documento no lo cierra,
// así varios PDFs pueden procesarse a la vez sin conflictos.
const sharedWorker = pdfjs.PDFWorker.create({ port: new PdfWorker() })

const RES = 'lib://pdfjs/'
/** Por debajo de este tamaño se lee el archivo entero (más rápido que pedir rangos). */
const WHOLE_FILE_LIMIT = 6 * 1024 * 1024
const INITIAL_CHUNK = 256 * 1024

class IpcRangeTransport extends pdfjs.PDFDataRangeTransport {
  constructor(private path: string, length: number, initial: Uint8Array) {
    super(length, initial)
  }
  requestDataRange(begin: number, end: number): void {
    window.api.pdfRead(this.path, begin, end).then(
      (chunk) => this.onDataRange(begin, chunk),
      (err) => console.error('Error leyendo rango del PDF', err)
    )
  }
}

export async function openPdf(path: string): Promise<PDFDocumentProxy> {
  const size = await window.api.pdfSize(path)
  const common = {
    cMapUrl: RES + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: RES + 'standard_fonts/',
    wasmUrl: RES + 'wasm/',
    iccUrl: RES + 'iccs/',
    disableAutoFetch: true,
    disableStream: true,
    disableFontFace: false,
    verbosity: 0,
    worker: sharedWorker
  }
  if (size <= WHOLE_FILE_LIMIT) {
    const data = await window.api.pdfRead(path, 0, size)
    return pdfjs.getDocument({ ...common, data }).promise
  }
  const initial = await window.api.pdfRead(path, 0, Math.min(INITIAL_CHUNK, size))
  const range = new IpcRangeTransport(path, size, initial)
  return pdfjs.getDocument({ ...common, range, rangeChunkSize: 128 * 1024 }).promise
}

export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  width: number
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // intent 'print': pdf.js no espera a requestAnimationFrame, que se detiene cuando la ventana
  // está minimizada u oculta (si no, el procesamiento se congelaría en segundo plano).
  await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise
  page.cleanup()
  return canvas
}

/** true si la página es casi toda blanca (hojas en blanco al inicio de algunos PDFs). */
export function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let light = 0
  const step = 16 // muestrea 1 de cada 4 píxeles
  let total = 0
  for (let i = 0; i < data.length; i += step) {
    total++
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) light++
  }
  return light / total > 0.995
}

// Se usa toDataURL (síncrono) y no toBlob: Chromium ejecuta toBlob en tiempos libres del
// dibujado de pantalla, que casi no ocurren con la ventana minimizada.
export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Uint8Array> {
  const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export const COVER_WIDTH = 400
