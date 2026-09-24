import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Book, BookPatch, LibraryData, Settings, Source } from '@shared/types'
import { filterBooks, indexBooks, sortBooks, type SearchMode } from './lib/filter'
import { processFiles } from './lib/processor'
import { BookGrid } from './components/BookGrid'
import { CoverPicker } from './components/CoverPicker'
import { ConfirmDialog, ContextMenu, EditDialog, type MenuItem } from './components/Dialogs'
import { CloseIcon, EditIcon, ExternalIcon, FolderIcon, HeartIcon, ImageIcon, TrashIcon } from './components/Icons'
import { Sidebar, TopBar, type Progress, type View } from './components/Layout'
import { AuthorsView, SettingsView, Welcome } from './components/Views'

const VIEW_TITLES: Record<View, string> = {
  all: 'Todos los libros',
  favorites: 'Favoritos',
  recent: 'Abiertos recientemente',
  authors: 'Autores',
  settings: 'Carpetas y ajustes'
}

interface Confirm {
  title: string
  message: React.ReactNode
  confirmText: string
  danger?: boolean
  onConfirm: () => void
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

export default function App() {
  const [loaded, setLoaded] = useState(false)
  const [books, setBooks] = useState<Record<string, Book>>({})
  const [sources, setSources] = useState<Source[]>([])
  const [excludedCount, setExcludedCount] = useState(0)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [osDark, setOsDark] = useState(systemDark.matches)

  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('general')
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)

  const [progress, setProgress] = useState<Progress | null>(null)
  const cancelRef = useRef(false)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ book: Book; x: number; y: number } | null>(null)
  const [editing, setEditing] = useState<Book | null>(null)
  const [picking, setPicking] = useState<Book | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ---- Tema ----
  useEffect(() => {
    const on = (e: MediaQueryListEvent): void => setOsDark(e.matches)
    systemDark.addEventListener('change', on)
    return () => systemDark.removeEventListener('change', on)
  }, [])
  const dark = settings ? (settings.theme === 'system' ? osDark : settings.theme === 'dark') : osDark
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  useEffect(() => {
    if (settings) document.documentElement.style.setProperty('--card-w', `${settings.cardSize}px`)
  }, [settings?.cardSize])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    window.api.updateSettings(patch)
  }, [])

  // ---- Toast ----
  const toastTimer = useRef<number>(0)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }, [])

  const applyLibrary = (lib: LibraryData): void => {
    setBooks(lib.books)
    setSources(lib.sources)
    setExcludedCount(lib.excluded.length)
    setSettings(lib.settings)
  }

  // ---- Escaneo + procesamiento (siempre con indicador visible) ----
  const busyRef = useRef(false)
  const runScan = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    cancelRef.current = false
    setProgress({ phase: 'scan', total: 0, done: 0, current: '' })
    try {
      const res = await window.api.scan()
      if (res.removedIds.length) {
        setBooks((prev) => {
          const next = { ...prev }
          for (const id of res.removedIds) delete next[id]
          return next
        })
      }
      let newCount = 0
      let updated = 0
      if (res.toProcess.length) {
        setProgress({ phase: 'process', total: res.toProcess.length, done: 0, current: '' })
        // Los libros terminados se agrupan y se pintan cada 300 ms para no redibujar por cada uno.
        let pending: Book[] = []
        const flush = (): void => {
          if (!pending.length) return
          const batch = pending
          pending = []
          setBooks((prev) => {
            const next = { ...prev }
            for (const b of batch) next[b.id] = b
            return next
          })
        }
        const timer = window.setInterval(flush, 300)
        try {
          await processFiles(res.toProcess, {
            isCancelled: () => cancelRef.current,
            onBook: (b) => pending.push(b),
            onProgress: (done, current) =>
              setProgress({ phase: 'process', total: res.toProcess.length, done, current })
          })
        } finally {
          window.clearInterval(timer)
          flush()
        }
        newCount = res.toProcess.filter((f) => f.isNew).length
        updated = res.toProcess.length - newCount
      }
      const parts: string[] = []
      if (cancelRef.current) parts.push('Procesamiento cancelado')
      if (newCount) parts.push(`${newCount} nuevo${newCount === 1 ? '' : 's'}`)
      if (updated) parts.push(`${updated} actualizado${updated === 1 ? '' : 's'}`)
      if (res.removedIds.length) parts.push(`${res.removedIds.length} eliminado${res.removedIds.length === 1 ? '' : 's'}`)
      if (res.missingSources.length) parts.push(`${res.missingSources.length} carpeta(s) no encontrada(s)`)
      showToast(parts.length ? parts.join(' · ') : 'Todo está al día: no hay PDFs nuevos')
    } catch (err) {
      console.error(err)
      showToast('Ocurrió un error al actualizar la biblioteca')
    } finally {
      busyRef.current = false
      setProgress(null)
    }
  }, [showToast])

  useEffect(() => {
    window.api.getLibrary().then((lib) => {
      applyLibrary(lib)
      setLoaded(true)
      if (lib.settings.scanOnStartup && lib.sources.length) runScan()
    })
  }, [runScan])

  const afterAdd = useCallback(
    async (added: Source[]) => {
      if (!added.length) return
      setSources((s) => [...s, ...added])
      await runScan()
    },
    [runScan]
  )
  const addFolder = useCallback(async () => afterAdd(await window.api.addFoldersDialog()), [afterAdd])
  const addFiles = useCallback(async () => afterAdd(await window.api.addFilesDialog()), [afterAdd])

  // ---- Arrastrar y soltar ----
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth++
      setDragOver(true)
    }
    const leave = (): void => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragOver(false)
    }
    const over = (e: DragEvent): void => e.preventDefault()
    const drop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      depth = 0
      setDragOver(false)
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => window.api.getPathForFile(f)).filter(Boolean)
      if (!paths.length) return
      const added = await window.api.addPaths(paths)
      if (!added.length) showToast('Esas carpetas o PDFs ya estaban en la biblioteca (o no son PDFs)')
      else afterAdd(added)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [afterAdd, showToast])

  // ---- Atajos ----
  const focusSearch = useCallback(() => {
    setView((v) => (v === 'authors' || v === 'settings' ? 'all' : v))
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focusSearch()
      }
      if (e.key === 'F5') {
        e.preventDefault()
        runScan()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusSearch, runScan])

  // ---- Acciones sobre libros ----
  const putBook = useCallback((b: Book | null | undefined) => {
    if (b) setBooks((prev) => ({ ...prev, [b.id]: b }))
  }, [])

  const removeFromState = useCallback((id: string) => {
    setBooks((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const excludeBook = useCallback(
    (b: Book) =>
      setConfirm({
        title: 'Quitar de la biblioteca',
        message: (
          <>
            ¿Quitar <b>{b.title}</b> de la biblioteca? El archivo PDF <b>no se borra</b> de tu computadora, y no se
            volverá a agregar al pulsar «Actualizar».
          </>
        ),
        confirmText: 'Quitar',
        danger: true,
        onConfirm: async () => {
          await window.api.excludeBook(b.id)
          removeFromState(b.id)
          setExcludedCount((c) => c + 1)
        }
      }),
    [removeFromState]
  )

  const openBook = useCallback(
    async (b: Book) => {
      const res = await window.api.openBook(b.id)
      if (res.ok) putBook(res.book)
      else if (res.missing)
        setConfirm({
          title: 'Archivo no encontrado',
          message: (
            <>
              El PDF <b>{b.fileName}</b> ya no está en su ubicación. ¿Quieres quitarlo de la biblioteca?
            </>
          ),
          confirmText: 'Quitar',
          danger: true,
          onConfirm: async () => {
            await window.api.excludeBook(b.id)
            removeFromState(b.id)
          }
        })
      else showToast(`No se pudo abrir el PDF: ${res.error ?? 'error desconocido'}`)
    },
    [putBook, removeFromState, showToast]
  )

  const toggleFav = useCallback(
    async (b: Book) => {
      putBook({ ...b, favorite: !b.favorite })
      putBook(await window.api.updateBook(b.id, { favorite: !b.favorite }))
    },
    [putBook]
  )

  const saveEdit = useCallback(
    async (id: string, patch: BookPatch) => putBook(await window.api.updateBook(id, patch)),
    [putBook]
  )

  const openMenu = useCallback((book: Book, x: number, y: number) => setMenu({ book, x, y }), [])

  const menuItems = (b: Book): MenuItem[] => [
    { label: 'Abrir PDF', icon: <ExternalIcon size={16} />, onClick: () => openBook(b) },
    {
      label: b.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos',
      icon: <HeartIcon size={16} filled={b.favorite} />,
      onClick: () => toggleFav(b)
    },
    { label: 'Cambiar portada…', icon: <ImageIcon size={16} />, onClick: () => setPicking(b) },
    { label: 'Editar título, autor y año…', icon: <EditIcon size={16} />, onClick: () => setEditing(b) },
    { label: 'Mostrar en la carpeta', icon: <FolderIcon size={16} />, onClick: () => window.api.showInFolder(b.id) },
    { label: 'Quitar de la biblioteca', icon: <TrashIcon size={16} />, danger: true, onClick: () => excludeBook(b) }
  ]

  const removeSource = useCallback(
    (s: Source) =>
      setConfirm({
        title: 'Quitar carpeta',
        message: (
          <>
            ¿Quitar <b>{s.path}</b> de la biblioteca? Sus libros dejarán de aparecer en la app. Tus archivos{' '}
            <b>no se borran</b>.
          </>
        ),
        confirmText: 'Quitar',
        danger: true,
        onConfirm: async () => {
          const removed = await window.api.removeSource(s.id)
          applyLibrary(await window.api.getLibrary())
          showToast(`Carpeta quitada · ${removed} libro(s) fuera de la biblioteca`)
        }
      }),
    [showToast]
  )

  // ---- Datos derivados ----
  const allBooks = useMemo(() => Object.values(books), [books])
  const indexed = useMemo(() => indexBooks(allBooks), [allBooks])
  const deferredQuery = useDeferredValue(query)

  const shown = useMemo(() => {
    let list = filterBooks(indexed, deferredQuery, mode, view === 'all' ? authorFilter : null)
    if (view === 'favorites') list = list.filter((b) => b.favorite)
    if (view === 'recent') return sortBooks(list.filter((b) => b.lastOpenedAt), 'opened-desc')
    return sortBooks(list, settings?.sort ?? 'added-desc')
  }, [indexed, deferredQuery, mode, authorFilter, view, settings?.sort])

  const counts = useMemo(
    () => ({
      all: allBooks.length,
      favorites: allBooks.filter((b) => b.favorite).length,
      recent: allBooks.filter((b) => b.lastOpenedAt).length
    }),
    [allBooks]
  )

  const changeView = useCallback((v: View) => {
    setView(v)
    if (v !== 'all') setAuthorFilter(null)
  }, [])

  if (!loaded || !settings) return <div className="app-loading" />

  const isGridView = view === 'all' || view === 'favorites' || view === 'recent'
  const empty = sources.length === 0 && allBooks.length === 0

  return (
    <div className="app">
      <Sidebar
        view={view}
        onView={changeView}
        onSearch={focusSearch}
        collapsed={settings.sidebarCollapsed}
        onToggle={() => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })}
        counts={counts}
      />
      <main className="main">
        <TopBar
          searchRef={searchRef}
          query={query}
          onQuery={(q) => {
            setQuery(q)
            if (!isGridView) setView('all')
          }}
          mode={mode}
          onMode={(m) => {
            setMode(m)
            searchRef.current?.focus()
          }}
          sort={settings.sort}
          onSort={(sort) => updateSettings({ sort })}
          dark={dark}
          onToggleTheme={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
          onRefresh={runScan}
          onAddFolder={addFolder}
          onAddFiles={addFiles}
          progress={progress}
          onCancel={() => (cancelRef.current = true)}
          hasSources={sources.length > 0}
        />

        <div className="section-head">
          <h1>{VIEW_TITLES[view]}</h1>
          {isGridView && (
            <span className="section-count">
              {shown.length} {shown.length === 1 ? 'libro' : 'libros'}
            </span>
          )}
          {view === 'all' && authorFilter !== null && (
            <button className="chip" onClick={() => setAuthorFilter(null)} title="Quitar filtro">
              Autor: {authorFilter || 'Sin autor'} <CloseIcon size={14} />
            </button>
          )}
          {isGridView && (
            <label className="size-slider" title="Tamaño de las portadas">
              <input
                type="range"
                min={120}
                max={260}
                step={10}
                value={settings.cardSize}
                onChange={(e) => updateSettings({ cardSize: Number(e.target.value) })}
              />
            </label>
          )}
        </div>

        {empty && isGridView ? (
          <Welcome onFolder={addFolder} onFiles={addFiles} />
        ) : isGridView ? (
          shown.length ? (
            <BookGrid books={shown} onOpen={openBook} onToggleFav={toggleFav} onMenu={openMenu} />
          ) : (
            <div className="empty">
              {query
                ? 'Ningún libro coincide con tu búsqueda.'
                : view === 'favorites'
                  ? 'Aún no tienes favoritos. Toca el corazón en la esquina de un libro para agregarlo aquí.'
                  : view === 'recent'
                    ? 'Aquí aparecerán los libros que abras.'
                    : progress
                      ? 'Cargando libros…'
                      : 'No hay libros. Pulsa «Actualizar» para buscar PDFs en tus carpetas.'}
            </div>
          )
        ) : view === 'authors' ? (
          <AuthorsView
            books={allBooks}
            onPick={(a) => {
              setAuthorFilter(a)
              setQuery('')
              setView('all')
            }}
          />
        ) : (
          <SettingsView
            sources={sources}
            settings={settings}
            bookCount={allBooks.length}
            excludedCount={excludedCount}
            onRemoveSource={removeSource}
            onAddFolder={addFolder}
            onAddFiles={addFiles}
            onSettings={updateSettings}
            onClearExcluded={async () => {
              await window.api.clearExcluded()
              setExcludedCount(0)
              showToast('Listo. Pulsa «Actualizar» para volver a agregarlos.')
            }}
          />
        )}
      </main>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.book)} onClose={() => setMenu(null)} />}
      {editing && (
        <EditDialog book={editing} onSave={(p) => saveEdit(editing.id, p)} onClose={() => setEditing(null)} />
      )}
      {picking && <CoverPicker book={picking} onDone={putBook} onClose={() => setPicking(null)} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {dragOver && (
        <div className="drop-overlay">
          <div>Suelta aquí tus carpetas o PDFs</div>
        </div>
      )}
    </div>
  )
}
