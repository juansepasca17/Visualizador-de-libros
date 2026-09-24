import type { Book, ScanFile } from '@shared/types'
import { canvasToJpeg, COVER_WIDTH, isBlank, openPdf, renderPage } from './pdf'
import { deriveMeta } from './meta'

const fileNameOf = (p: string): string => p.split(/[\\/]/).pop() ?? p

async function processOne(file: ScanFile): Promise<Book> {
  const fileName = fileNameOf(file.path)
  let doc = null
  try {
    doc = await openPdf(file.path)
    const meta = await doc.getMetadata().catch(() => null)
    const { title, author, year } = deriveMeta(fileName, (meta?.info as Record<string, unknown>) ?? null)

    let cover: Uint8Array | null = null
    let coverPage = Math.min(Math.max(1, file.coverPage), doc.numPages)
    if (file.renderCover) {
      let canvas = await renderPage(doc, coverPage, COVER_WIDTH)
      // Solo en la portada automática: saltar hojas en blanco iniciales (hasta la página 3).
      if (file.coverPage === 1) {
        while (isBlank(canvas) && coverPage < Math.min(3, doc.numPages)) {
          coverPage++
          canvas = await renderPage(doc, coverPage, COVER_WIDTH)
        }
      }
      cover = await canvasToJpeg(canvas)
    }
    return await window.api.upsertBook({
      file,
      title,
      author,
      year,
      pageCount: doc.numPages,
      coverPage,
      cover,
      failed: false
    })
  } catch (err) {
    console.warn('No se pudo procesar', file.path, String(err))
    const { title, author, year } = deriveMeta(fileName, null)
    return window.api.upsertBook({
      file,
      title,
      author,
      year,
      pageCount: 0,
      coverPage: 1,
      cover: null,
      failed: true
    })
  } finally {
    await doc?.loadingTask.destroy().catch(() => {})
  }
}

export interface ProcessCallbacks {
  onProgress: (done: number, current: string) => void
  onBook: (book: Book) => void
  isCancelled: () => boolean
}

/** Procesa los PDFs con concurrencia limitada para no saturar la máquina. */
export async function processFiles(files: ScanFile[], cb: ProcessCallbacks, concurrency = 3): Promise<number> {
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    while (next < files.length && !cb.isCancelled()) {
      const file = files[next++]
      cb.onProgress(done, fileNameOf(file.path))
      const book = await processOne(file)
      done++
      cb.onBook(book)
      cb.onProgress(done, fileNameOf(file.path))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return done
}
