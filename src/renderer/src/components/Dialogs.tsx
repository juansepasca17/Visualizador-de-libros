import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Book, BookPatch } from '@shared/types'
import { CloseIcon } from './Icons'

export function Modal({
  title,
  onClose,
  children,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmText,
  danger,
  onConfirm,
  onClose
}: {
  title: string
  message: ReactNode
  confirmText: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">{message}</div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button
          className={'btn ' + (danger ? 'danger' : 'primary')}
          autoFocus
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}

export function EditDialog({
  book,
  onSave,
  onClose
}: {
  book: Book
  onSave: (patch: BookPatch) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [year, setYear] = useState(book.year?.toString() ?? '')
  const submit = (): void => {
    const y = parseInt(year, 10)
    onSave({ title: title.trim() || book.fileName, author: author.trim(), year: Number.isFinite(y) ? y : null })
    onClose()
  }
  return (
    <Modal title="Editar datos del libro" onClose={onClose}>
      <form
        className="modal-body form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label>
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          Autor
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Sin autor" />
        </label>
        <label>
          Año de publicación
          <input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="Ej. 2019"
          />
        </label>
        <p className="hint">Archivo: {book.path}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onClick: () => void
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8)
    })
  }, [x, y])
  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          className={'menu-item' + (it.danger ? ' danger' : '')}
          onClick={() => {
            onClose()
            it.onClick()
          }}
        >
          <span className="menu-icon">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  )
}
