import type { Book, SortKey } from '@shared/types'

export const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export type SearchMode = 'general' | 'author'

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

export interface Indexed {
  book: Book
  general: string
  author: string
}

export const indexBooks = (books: Book[]): Indexed[] =>
  books.map((book) => ({
    book,
    general: norm(`${book.title} ${book.author} ${book.fileName} ${book.year ?? ''}`),
    author: norm(book.author)
  }))

export function filterBooks(items: Indexed[], query: string, mode: SearchMode, exactAuthor: string | null): Book[] {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  const exact = exactAuthor !== null ? norm(exactAuthor) : null
  const out: Book[] = []
  for (const it of items) {
    if (exact !== null && it.author !== exact) continue
    const hay = mode === 'author' ? it.author : it.general
    if (terms.every((t) => hay.includes(t))) out.push(it.book)
  }
  return out
}

const byTitle = (a: Book, b: Book): number => collator.compare(a.title, b.title)
const nullsLast = (a: number | null, b: number | null, dir: 1 | -1): number => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * dir
}

export function sortBooks(books: Book[], key: SortKey): Book[] {
  const arr = [...books]
  switch (key) {
    case 'title-asc':
      return arr.sort(byTitle)
    case 'title-desc':
      return arr.sort((a, b) => byTitle(b, a))
    case 'year-desc':
      return arr.sort((a, b) => nullsLast(a.year, b.year, -1) || byTitle(a, b))
    case 'year-asc':
      return arr.sort((a, b) => nullsLast(a.year, b.year, 1) || byTitle(a, b))
    case 'added-desc':
      return arr.sort((a, b) => b.addedAt - a.addedAt || byTitle(a, b))
    case 'opened-desc':
      return arr.sort((a, b) => nullsLast(a.lastOpenedAt, b.lastOpenedAt, -1) || byTitle(a, b))
  }
}

export const SORT_LABELS: Record<SortKey, string> = {
  'title-asc': 'Título A → Z',
  'title-desc': 'Título Z → A',
  'year-desc': 'Año: más nuevo primero',
  'year-asc': 'Año: más viejo primero',
  'added-desc': 'Agregados recientemente',
  'opened-desc': 'Abiertos recientemente'
}

export interface AuthorEntry {
  /** Texto a mostrar. */
  name: string
  /** Valor para filtrar ('' = libros sin autor). */
  value: string
  count: number
}

export function authorList(books: Book[]): AuthorEntry[] {
  const map = new Map<string, AuthorEntry>()
  for (const b of books) {
    const value = b.author.trim()
    const key = norm(value)
    const e = map.get(key)
    if (e) e.count++
    else map.set(key, { name: value || 'Sin autor', value, count: 1 })
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name))
}
