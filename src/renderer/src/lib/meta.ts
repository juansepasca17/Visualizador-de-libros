// Deducción de título / autor / año a partir de los metadatos del PDF y del nombre del archivo.

const BAD_TITLE = [
  /^untitled/i,
  /^sin t[ií]tulo/i,
  /microsoft (word|powerpoint)/i,
  /\.(docx?|pdf|indd|qxd|tex|dvi|rtf|odt|pptx?)$/i,
  /^document\d*$/i,
  /^documento\d*$/i,
  /^[\d\s_\-.]+$/,
  /^layout \d/i
]

const BAD_AUTHOR = [/^(administrator|administrador|admin|user|usuario|owner|unknown|desconocido|pc|hp|dell)$/i]

// Etiquetas que algunos sitios de descarga agregan al nombre del archivo, p. ej. "(sitio.com)".
const SITE_TAG = /[([][^)\]]*(z-?lib|1lib|libgen|library\.|annas?-archive|epubli|www\.|\.com|\.org)[^)\]]*[)\]]/gi

const clean = (s: string | undefined | null): string =>
  (s ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()

const isBad = (s: string, rules: RegExp[]): boolean => s.length < 2 || rules.some((r) => r.test(s))

export function yearFromPdfDate(d: string | undefined): number | null {
  const m = /^(?:D:)?(\d{4})/.exec(clean(d))
  if (!m) return null
  const y = Number(m[1])
  return y >= 1400 && y <= new Date().getFullYear() + 1 ? y : null
}

interface FromName {
  title: string
  author: string
  year: number | null
}

export function parseFileName(fileName: string): FromName {
  let name = fileName.replace(/\.pdf$/i, '').replace(SITE_TAG, ' ').replace(/_/g, ' ')
  let year: number | null = null
  const ym = /[([]\s*((?:1\d|20)\d\d)\s*[)\]]/.exec(name)
  if (ym) {
    year = Number(ym[1])
    name = name.replace(ym[0], ' ')
  }
  name = clean(name)
  let author = ''
  // "Título (Autor)"
  const paren = /^(.+?)\s*\(([^()]{3,80})\)\s*$/.exec(name)
  if (paren && !/\d{3,}/.test(paren[2])) {
    return { title: clean(paren[1]), author: clean(paren[2]), year }
  }
  // "Autor - Título"
  const parts = name.split(/\s+[-–—]\s+/)
  if (parts.length >= 2 && parts[0].length <= 60) {
    author = clean(parts[0])
    name = clean(parts.slice(1).join(' - '))
  }
  return { title: name, author, year }
}

export function deriveMeta(
  fileName: string,
  info: Record<string, unknown> | null
): { title: string; author: string; year: number | null } {
  const fromName = parseFileName(fileName)
  const metaTitle = clean(info?.Title as string)
  const metaAuthor = clean(info?.Author as string)
  const title = !isBad(metaTitle, BAD_TITLE) ? metaTitle : fromName.title || fileName
  const author = !isBad(metaAuthor, BAD_AUTHOR) ? metaAuthor : fromName.author
  const year = fromName.year ?? yearFromPdfDate(info?.CreationDate as string)
  return { title, author, year }
}
