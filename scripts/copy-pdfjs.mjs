// Copia los recursos de pdf.js (fuentes, cmaps, wasm) a la carpeta pública del renderer.
import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const src = join('node_modules', 'pdfjs-dist')
const dest = join('src', 'renderer', 'public', 'pdfjs')
mkdirSync(dest, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const from = join(src, dir)
  if (existsSync(from)) cpSync(from, join(dest, dir), { recursive: true })
}
console.log('Recursos de pdf.js copiados a', dest)
