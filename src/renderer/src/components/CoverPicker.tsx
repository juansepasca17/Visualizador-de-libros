import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Book } from '@shared/types'
import { canvasToJpeg, COVER_WIDTH, openPdf, renderPage } from '../lib/pdf'
import { Modal } from './Dialogs'
import { ImageIcon } from './Icons'

const PAGE_BATCH = 12
const THUMB_WIDTH = 150

export function CoverPicker({
  book,
  onDone,
  onClose
}: {
  book: Book
  onDone: (b: Book) => void
  onClose: () => void
}) {
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [limit, setLimit] = useState(PAGE_BATCH)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const thumbsRef = useRef<Record<number, string>>({})

  useEffect(() => {
    let alive = true
    openPdf(book.path)
      .then((doc) => {
        if (!alive) return doc.loadingTask.destroy()
        docRef.current = doc
        setNumPages(doc.numPages)
      })
      .catch(() => alive && setError('No se pudo abrir este PDF.'))
    return () => {
      alive = false
      docRef.current?.loadingTask.destroy()
      docRef.current = null
    }
  }, [book.path])

  // Renderiza las miniaturas de una en una para que la ventana siga fluida.
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      const doc = docRef.current
      if (!doc) return
      for (let p = 1; p <= Math.min(limit, numPages); p++) {
        if (!alive) return
        if (thumbsRef.current[p]) continue
        try {
          const canvas = await renderPage(doc, p, THUMB_WIDTH)
          const url = canvas.toDataURL('image/jpeg', 0.75)
          thumbsRef.current[p] = url
          if (alive) setThumbs((t) => ({ ...t, [p]: url }))
        } catch {
          /* página ilegible: se deja sin miniatura */
        }
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [numPages, limit])

  const choose = async (page: number): Promise<void> => {
    const doc = docRef.current
    if (!doc || saving) return
    setSaving(page)
    try {
      const canvas = await renderPage(doc, page, COVER_WIDTH)
      const updated = await window.api.setCover(book.id, await canvasToJpeg(canvas), page)
      if (updated) onDone(updated)
      onClose()
    } finally {
      setSaving(null)
    }
  }

  const customImage = async (): Promise<void> => {
    const updated = await window.api.customCoverDialog(book.id)
    if (updated) {
      onDone(updated)
      onClose()
    }
  }

  const pages = Array.from({ length: Math.min(limit, numPages) }, (_, i) => i + 1)

  return (
    <Modal title={`Elegir portada — ${book.title}`} onClose={onClose} wide>
      <div className="modal-body">
        <div className="picker-toolbar">
          <span className="hint">Haz clic en la página que quieres usar como portada.</span>
          <button className="btn" onClick={customImage}>
            <ImageIcon size={16} /> Usar imagen propia…
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!error && numPages === 0 && <p className="hint">Abriendo PDF…</p>}
        <div className="picker-grid">
          {pages.map((p) => (
            <button
              key={p}
              className={'picker-page' + (p === book.coverPage && !book.coverCustom ? ' current' : '')}
              onClick={() => choose(p)}
              disabled={saving !== null}
            >
              {thumbs[p] ? <img src={thumbs[p]} alt={`Página ${p}`} /> : <div className="picker-loading" />}
              <span>{saving === p ? 'Guardando…' : `Página ${p}`}</span>
            </button>
          ))}
        </div>
        {limit < numPages && (
          <div className="picker-more">
            <button className="btn" onClick={() => setLimit((l) => l + PAGE_BATCH)}>
              Cargar más páginas ({numPages - limit} restantes)
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
