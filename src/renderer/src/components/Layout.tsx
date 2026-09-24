import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { SortKey } from '@shared/types'
import { SORT_LABELS, type SearchMode } from '../lib/filter'
import {
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  FileIcon,
  FolderPlusIcon,
  HeartIcon,
  HomeIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SortIcon,
  SunIcon,
  UsersIcon
} from './Icons'

export type View = 'all' | 'favorites' | 'recent' | 'authors' | 'settings'

interface SidebarProps {
  view: View
  onView: (v: View) => void
  onSearch: () => void
  collapsed: boolean
  onToggle: () => void
  counts: Partial<Record<View, number>>
}

export function Sidebar({ view, onView, onSearch, collapsed, onToggle, counts }: SidebarProps) {
  const item = (v: View | 'search', label: string, icon: ReactNode) => (
    <button
      className={'side-item' + (view === v ? ' active' : '')}
      onClick={() => (v === 'search' ? onSearch() : onView(v))}
      title={collapsed ? label : undefined}
    >
      <span className="side-icon">{icon}</span>
      {!collapsed && <span className="side-label">{label}</span>}
      {!collapsed && v !== 'search' && counts[v] !== undefined && <span className="side-count">{counts[v]}</span>}
    </button>
  )
  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <button className={'side-home' + (view === 'all' ? ' active' : '')} onClick={() => onView('all')} title="Inicio">
        <HomeIcon size={22} />
        {!collapsed && <span>Biblioteca</span>}
      </button>
      <nav className="side-nav">
        {item('search', 'Buscar', <SearchIcon />)}
        {item('all', 'Todos los libros', <HomeIcon />)}
        {item('favorites', 'Favoritos', <HeartIcon />)}
        {item('recent', 'Abiertos recientemente', <ClockIcon />)}
        {item('authors', 'Autores', <UsersIcon />)}
        {item('settings', 'Carpetas y ajustes', <SettingsIcon />)}
      </nav>
      <div className="side-bottom">
        {!collapsed && <span className="version">v{__APP_VERSION__}</span>}
        <button className="side-item" onClick={onToggle} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
          <span className="side-icon">
            <ChevronIcon dir={collapsed ? 'right' : 'left'} />
          </span>
        </button>
      </div>
    </aside>
  )
}

function useOutsideClose(open: boolean, close: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

export function SortDropdown({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div className="dropdown" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SortIcon size={17} />
        <span className="hide-narrow">{SORT_LABELS[value]}</span>
        <ChevronIcon dir="down" size={15} />
      </button>
      {open && (
        <div className="dropdown-menu right">
          <div className="dropdown-title">Ordenar por</div>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              className={'menu-item' + (k === value ? ' selected' : '')}
              onClick={() => {
                onChange(k)
                setOpen(false)
              }}
            >
              <span className="menu-check">{k === value ? '✓' : ''}</span>
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AddDropdown({ onFolder, onFiles }: { onFolder: () => void; onFiles: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div className="dropdown" ref={ref}>
      <button className="btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FolderPlusIcon size={17} />
        <span className="hide-narrow">Agregar</span>
      </button>
      {open && (
        <div className="dropdown-menu right">
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onFolder()
            }}
          >
            <span className="menu-icon">
              <FolderPlusIcon size={16} />
            </span>
            Agregar carpeta(s)…
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false)
              onFiles()
            }}
          >
            <span className="menu-icon">
              <FileIcon size={16} />
            </span>
            Agregar PDF(s) sueltos…
          </button>
        </div>
      )}
    </div>
  )
}

export interface Progress {
  phase: 'scan' | 'process'
  total: number
  done: number
  current: string
}

interface TopBarProps {
  searchRef: RefObject<HTMLInputElement | null>
  query: string
  onQuery: (q: string) => void
  mode: SearchMode
  onMode: (m: SearchMode) => void
  sort: SortKey
  onSort: (k: SortKey) => void
  dark: boolean
  onToggleTheme: () => void
  onRefresh: () => void
  onAddFolder: () => void
  onAddFiles: () => void
  progress: Progress | null
  onCancel: () => void
  hasSources: boolean
}

export function TopBar(p: TopBarProps) {
  const busy = p.progress !== null
  return (
    <header className="topbar">
      <div className="search-wrap">
        <div className="search-tabs" role="tablist">
          <button role="tab" className={p.mode === 'general' ? 'on' : ''} onClick={() => p.onMode('general')}>
            General
          </button>
          <button role="tab" className={p.mode === 'author' ? 'on' : ''} onClick={() => p.onMode('author')}>
            Por autor
          </button>
        </div>
        <div className="search-box">
          <SearchIcon size={18} />
          <input
            ref={p.searchRef}
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder={p.mode === 'author' ? 'Buscar por autor…' : 'Buscar por título, autor, archivo o año…'}
            spellCheck={false}
          />
          {p.query && (
            <button className="icon-btn" onClick={() => p.onQuery('')} title="Borrar búsqueda">
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="top-actions">
        <SortDropdown value={p.sort} onChange={p.onSort} />
        <button
          className={'btn' + (busy ? ' spinning' : '')}
          onClick={p.onRefresh}
          disabled={busy || !p.hasSources}
          title="Buscar PDFs nuevos o cambiados en tus carpetas"
        >
          <RefreshIcon size={17} />
          <span className="hide-narrow">Actualizar</span>
        </button>
        <AddDropdown onFolder={p.onAddFolder} onFiles={p.onAddFiles} />
        <button className="icon-btn big" onClick={p.onToggleTheme} title={p.dark ? 'Modo claro' : 'Modo oscuro'}>
          {p.dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
      {p.progress && (
        <div className="progress" role="status">
          <div className="progress-text">
            {p.progress.phase === 'scan' ? (
              'Buscando PDFs en tus carpetas…'
            ) : (
              <>
                Procesando PDFs… <b>{p.progress.done}</b> / {p.progress.total}
                <span className="progress-file">{p.progress.current}</span>
              </>
            )}
          </div>
          {p.progress.phase === 'process' && (
            <button className="btn small" onClick={p.onCancel}>
              Cancelar
            </button>
          )}
          <div className="progress-track">
            <div
              className={'progress-fill' + (p.progress.phase === 'scan' ? ' indeterminate' : '')}
              style={{ width: p.progress.total ? `${(p.progress.done / p.progress.total) * 100}%` : undefined }}
            />
          </div>
        </div>
      )}
    </header>
  )
}
