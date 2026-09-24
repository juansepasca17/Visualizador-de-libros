import { useMemo, useState } from 'react'
import type { Book, Settings, Source, ThemeSetting } from '@shared/types'
import { authorList, norm } from '../lib/filter'
import { BookIcon, FileIcon, FolderIcon, FolderPlusIcon, TrashIcon } from './Icons'

export function Welcome({ onFolder, onFiles }: { onFolder: () => void; onFiles: () => void }) {
  return (
    <div className="welcome">
      <BookIcon size={56} />
      <h1>Tu biblioteca está vacía</h1>
      <p>
        Agrega una o varias carpetas con PDFs (o PDFs sueltos). La app creará automáticamente una portada para cada
        libro usando su primera página.
      </p>
      <div className="welcome-actions">
        <button className="btn primary big" onClick={onFolder}>
          <FolderPlusIcon size={18} /> Agregar carpeta
        </button>
        <button className="btn big" onClick={onFiles}>
          <FileIcon size={18} /> Agregar PDFs
        </button>
      </div>
      <p className="hint">También puedes arrastrar carpetas o PDFs a esta ventana.</p>
    </div>
  )
}

export function AuthorsView({ books, onPick }: { books: Book[]; onPick: (author: string) => void }) {
  const [filter, setFilter] = useState('')
  const authors = useMemo(() => authorList(books), [books])
  const shown = useMemo(() => {
    const f = norm(filter)
    return f ? authors.filter((a) => norm(a.name).includes(f)) : authors
  }, [authors, filter])
  return (
    <div className="scroller pad">
      <input
        className="field"
        placeholder={`Filtrar ${authors.length} autores…`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="author-list">
        {shown.map((a) => (
          <button key={a.name} className="author-row" onClick={() => onPick(a.value)}>
            <span className="author-avatar">{a.name.charAt(0).toUpperCase()}</span>
            <span className="author-name">{a.name}</span>
            <span className="author-count">
              {a.count} {a.count === 1 ? 'libro' : 'libros'}
            </span>
          </button>
        ))}
        {shown.length === 0 && <p className="hint">No hay autores que coincidan.</p>}
      </div>
    </div>
  )
}

interface SettingsProps {
  sources: Source[]
  settings: Settings
  bookCount: number
  excludedCount: number
  onRemoveSource: (s: Source) => void
  onAddFolder: () => void
  onAddFiles: () => void
  onSettings: (patch: Partial<Settings>) => void
  onClearExcluded: () => void
}

export function SettingsView(p: SettingsProps) {
  const themes: [ThemeSetting, string][] = [
    ['system', 'Igual que Windows'],
    ['dark', 'Oscuro'],
    ['light', 'Claro']
  ]
  return (
    <div className="scroller pad settings">
      <section>
        <h3>Carpetas y archivos de tu biblioteca</h3>
        <p className="hint">
          La app solo busca PDFs aquí, y únicamente cuando agregas algo nuevo o pulsas «Actualizar». Quitar una carpeta
          no borra tus archivos.
        </p>
        <div className="source-list">
          {p.sources.map((s) => (
            <div key={s.id} className="source-row">
              {s.type === 'folder' ? <FolderIcon size={18} /> : <FileIcon size={18} />}
              <span className="source-path" title={s.path}>
                {s.path}
              </span>
              <button className="icon-btn" title="Quitar de la biblioteca" onClick={() => p.onRemoveSource(s)}>
                <TrashIcon size={17} />
              </button>
            </div>
          ))}
          {p.sources.length === 0 && <p className="hint">Todavía no agregaste ninguna carpeta.</p>}
        </div>
        <div className="row-actions">
          <button className="btn primary" onClick={p.onAddFolder}>
            <FolderPlusIcon size={17} /> Agregar carpeta
          </button>
          <button className="btn" onClick={p.onAddFiles}>
            <FileIcon size={17} /> Agregar PDFs
          </button>
        </div>
      </section>

      <section>
        <h3>Apariencia</h3>
        <div className="segmented">
          {themes.map(([v, label]) => (
            <button key={v} className={p.settings.theme === v ? 'on' : ''} onClick={() => p.onSettings({ theme: v })}>
              {label}
            </button>
          ))}
        </div>
        <label className="slider-row">
          Tamaño de las portadas
          <input
            type="range"
            min={120}
            max={260}
            step={10}
            value={p.settings.cardSize}
            onChange={(e) => p.onSettings({ cardSize: Number(e.target.value) })}
          />
          <span>{p.settings.cardSize}px</span>
        </label>
      </section>

      <section>
        <h3>Actualización</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={p.settings.scanOnStartup}
            onChange={(e) => p.onSettings({ scanOnStartup: e.target.checked })}
          />
          Buscar PDFs nuevos automáticamente al abrir la app
        </label>
        <p className="hint">
          Desactivado: la app abre al instante con lo que ya tenía guardado y solo revisa tus carpetas cuando pulsas
          «Actualizar».
        </p>
      </section>

      <section>
        <h3>Biblioteca</h3>
        <p>
          {p.bookCount} libros en total.
          {p.excludedCount > 0 && <> {p.excludedCount} quitados a mano (no se vuelven a agregar al actualizar).</>}
        </p>
        {p.excludedCount > 0 && (
          <button className="btn" onClick={p.onClearExcluded}>
            Volver a incluir los libros quitados
          </button>
        )}
      </section>
    </div>
  )
}
