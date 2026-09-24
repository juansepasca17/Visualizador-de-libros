import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs, existsSync, readFileSync, mkdirSync } from 'fs'
import { basename, extname, join, sep } from 'path'
import type {
  Book,
  BookPatch,
  LibraryData,
  ProcessedBook,
  ScanFile,
  ScanResult,
  Settings,
  Source
} from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  sort: 'added-desc',
  cardSize: 170,
  scanOnStartup: false,
  sidebarCollapsed: false
}

export const dataDir = (): string => app.getPath('userData')
export const coversDir = (): string => join(dataDir(), 'covers')
const libraryFile = (): string => join(dataDir(), 'library.json')

export const normPath = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase()
export const idFor = (p: string): string =>
  createHash('sha1').update(normPath(p)).digest('hex').slice(0, 16)

let data: LibraryData

export function loadLibrary(): LibraryData {
  mkdirSync(coversDir(), { recursive: true })
  let parsed: Partial<LibraryData> = {}
  try {
    if (existsSync(libraryFile())) parsed = JSON.parse(readFileSync(libraryFile(), 'utf8'))
  } catch (err) {
    console.error('No se pudo leer library.json, se empieza vacía', err)
  }
  data = {
    version: 1,
    sources: parsed.sources ?? [],
    books: parsed.books ?? {},
    excluded: parsed.excluded ?? [],
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
  }
  return data
}

export const getLibrary = (): LibraryData => data

// ---- Guardado agrupado y atómico ----
let saveTimer: NodeJS.Timeout | null = null
let saving: Promise<void> = Promise.resolve()

export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saving = saving.then(writeNow).catch((e) => console.error('Error guardando', e))
  }, 300)
}

async function writeNow(): Promise<void> {
  const tmp = libraryFile() + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
  await fs.rename(tmp, libraryFile())
}

export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    saving = saving.then(writeNow)
  }
  await saving
}

// ---- Fuentes ----
export async function addPaths(paths: string[]): Promise<Source[]> {
  const added: Source[] = []
  for (const p of paths) {
    let stat
    try {
      stat = await fs.stat(p)
    } catch {
      continue
    }
    const type = stat.isDirectory() ? 'folder' : extname(p).toLowerCase() === '.pdf' ? 'file' : null
    if (!type) continue
    if (data.sources.some((s) => normPath(s.path) === normPath(p))) continue
    const source: Source = { id: idFor('src:' + p), type, path: p, addedAt: Date.now() }
    data.sources.push(source)
    added.push(source)
    // Si se vuelve a agregar algo excluido, se deja de excluir.
    data.excluded = data.excluded.filter((e) => !isUnder(e, p))
  }
  if (added.length) scheduleSave()
  return added
}

const isUnder = (file: string, root: string): boolean => {
  const f = normPath(file)
  const r = normPath(root)
  return f === r || f.startsWith(r + sep) || f.startsWith(r + '/')
}

const coveredBySources = (file: string, sources: Source[]): boolean =>
  sources.some((s) => isUnder(file, s.path))

export async function removeSource(id: string): Promise<number> {
  data.sources = data.sources.filter((s) => s.id !== id)
  let removed = 0
  for (const book of Object.values(data.books)) {
    if (!coveredBySources(book.path, data.sources)) {
      await deleteBook(book.id)
      removed++
    }
  }
  scheduleSave()
  return removed
}

async function deleteBook(id: string): Promise<void> {
  const book = data.books[id]
  if (!book) return
  delete data.books[id]
  if (book.coverFile) await fs.rm(join(coversDir(), book.coverFile), { force: true })
}

// ---- Escaneo incremental ----
async function walk(dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return // sin permisos o carpeta inaccesible
  }
  const subdirs: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) subdirs.push(full)
    else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) out.push(full)
  }
  await Promise.all(subdirs.map((d) => walk(d, out)))
}

export async function scan(): Promise<ScanResult> {
  const missingSources: string[] = []
  const candidates: string[] = []

  for (const source of data.sources) {
    if (!existsSync(source.path)) {
      missingSources.push(source.path)
      continue
    }
    if (source.type === 'folder') await walk(source.path, candidates)
    else candidates.push(source.path)
  }

  const excluded = new Set(data.excluded.map(normPath))
  const seen = new Map<string, string>()
  for (const p of candidates) {
    const id = idFor(p)
    if (!seen.has(id) && !excluded.has(normPath(p))) seen.set(id, p)
  }

  const toProcess: ScanFile[] = []
  const entries = [...seen.entries()]
  const BATCH = 64
  for (let i = 0; i < entries.length; i += BATCH) {
    const stats = await Promise.all(
      entries.slice(i, i + BATCH).map(async ([id, path]) => {
        try {
          const st = await fs.stat(path)
          return { id, path, size: st.size, mtime: Math.round(st.mtimeMs) }
        } catch {
          return null
        }
      })
    )
    for (const st of stats) {
      if (!st) continue
      const existing = data.books[st.id]
      const changed = !existing || existing.size !== st.size || existing.mtime !== st.mtime
      const needsCover = existing && !existing.coverFile && !existing.coverCustom && !existing.failed
      if (changed || needsCover) {
        toProcess.push({
          ...st,
          isNew: !existing,
          coverPage: existing?.coverPage ?? 1,
          renderCover: !existing?.coverCustom
        })
      }
    }
  }

  // Libros cuyo archivo ya no existe (si la carpeta de origen sí existe: una unidad
  // desconectada no debe vaciar la biblioteca).
  const removedIds: string[] = []
  for (const book of Object.values(data.books)) {
    if (seen.has(book.id)) continue
    const underMissing = missingSources.some((m) => isUnder(book.path, m))
    if (!underMissing) {
      await deleteBook(book.id)
      removedIds.push(book.id)
    }
  }
  if (removedIds.length) scheduleSave()

  return { toProcess, removedIds, missingSources, totalFound: seen.size }
}

// ---- Libros ----
async function writeCover(id: string, bytes: Uint8Array, ext = 'jpg'): Promise<string> {
  const file = `${id}.${ext}`
  // Borra una portada anterior con otra extensión.
  for (const other of ['jpg', 'png', 'webp']) {
    if (other !== ext) await fs.rm(join(coversDir(), `${id}.${other}`), { force: true })
  }
  await fs.writeFile(join(coversDir(), file), bytes)
  return file
}

export async function upsertBook(p: ProcessedBook): Promise<Book> {
  const { file } = p
  const existing = data.books[file.id]
  const book: Book = existing
    ? { ...existing }
    : {
        id: file.id,
        path: file.path,
        fileName: basename(file.path),
        size: file.size,
        mtime: file.mtime,
        title: '',
        author: '',
        year: null,
        pageCount: 0,
        addedAt: Date.now(),
        lastOpenedAt: null,
        favorite: false,
        coverPage: 1,
        coverFile: null,
        coverVersion: 0,
        coverCustom: false,
        userEdited: false,
        failed: false
      }

  book.path = file.path
  book.fileName = basename(file.path)
  book.size = file.size
  book.mtime = file.mtime
  book.pageCount = p.pageCount
  book.failed = p.failed
  if (!book.userEdited) {
    book.title = p.title
    book.author = p.author
    book.year = p.year
  }
  if (p.cover) {
    book.coverFile = await writeCover(book.id, p.cover)
    book.coverPage = p.coverPage
    book.coverVersion++
    book.coverCustom = false
  }
  data.books[book.id] = book
  scheduleSave()
  return book
}

export function updateBook(id: string, patch: BookPatch): Book | null {
  const book = data.books[id]
  if (!book) return null
  const metaChanged = 'title' in patch || 'author' in patch || 'year' in patch
  Object.assign(book, patch)
  if (metaChanged) book.userEdited = true
  scheduleSave()
  return book
}

export async function setCover(id: string, bytes: Uint8Array, page: number | null, ext = 'jpg'): Promise<Book | null> {
  const book = data.books[id]
  if (!book) return null
  book.coverFile = await writeCover(id, bytes, ext)
  book.coverVersion++
  book.coverCustom = page === null
  if (page !== null) book.coverPage = page
  scheduleSave()
  return book
}

export async function excludeBook(id: string): Promise<void> {
  const book = data.books[id]
  if (!book) return
  data.excluded.push(book.path)
  await deleteBook(id)
  scheduleSave()
}

export function clearExcluded(): void {
  data.excluded = []
  scheduleSave()
}

export function markOpened(id: string): Book | null {
  const book = data.books[id]
  if (!book) return null
  book.lastOpenedAt = Date.now()
  scheduleSave()
  return book
}

export function updateSettings(patch: Partial<Settings>): Settings {
  data.settings = { ...data.settings, ...patch }
  scheduleSave()
  return data.settings
}
