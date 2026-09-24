export type SourceType = 'folder' | 'file'

export interface Source {
  id: string
  type: SourceType
  path: string
  addedAt: number
}

export interface Book {
  id: string
  path: string
  fileName: string
  size: number
  mtime: number
  title: string
  author: string
  year: number | null
  pageCount: number
  addedAt: number
  lastOpenedAt: number | null
  favorite: boolean
  /** Página usada como portada (1 = primera). */
  coverPage: number
  coverFile: string | null
  coverVersion: number
  /** La portada es una imagen elegida por el usuario. */
  coverCustom: boolean
  /** Título/autor/año editados a mano: no se sobreescriben al actualizar. */
  userEdited: boolean
  /** No se pudo leer el PDF (dañado o con contraseña). */
  failed: boolean
}

export type SortKey = 'title-asc' | 'title-desc' | 'year-desc' | 'year-asc' | 'added-desc' | 'opened-desc'

export type ThemeSetting = 'system' | 'dark' | 'light'

export interface Settings {
  theme: ThemeSetting
  sort: SortKey
  cardSize: number
  scanOnStartup: boolean
  sidebarCollapsed: boolean
}

export interface LibraryData {
  version: 1
  sources: Source[]
  books: Record<string, Book>
  /** Rutas quitadas a mano de la biblioteca: no se vuelven a agregar al actualizar. */
  excluded: string[]
  settings: Settings
}

export interface ScanFile {
  id: string
  path: string
  size: number
  mtime: number
  isNew: boolean
  coverPage: number
  /** false cuando la portada es personalizada y no hay que regenerarla. */
  renderCover: boolean
}

export interface ScanResult {
  toProcess: ScanFile[]
  removedIds: string[]
  missingSources: string[]
  totalFound: number
}

export interface ProcessedBook {
  file: ScanFile
  title: string
  author: string
  year: number | null
  pageCount: number
  coverPage: number
  cover: Uint8Array | null
  failed: boolean
}

export type BookPatch = Partial<Pick<Book, 'title' | 'author' | 'year' | 'favorite'>>

export interface OpenResult {
  ok: boolean
  missing?: boolean
  error?: string
  book?: Book | null
}
