import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import { promises as fs, existsSync } from 'fs'
import { extname, join, normalize } from 'path'
import * as lib from './library'
import type { BookPatch, ProcessedBook, Settings } from '../shared/types'

// Permite usar una carpeta de datos aparte (útil para pruebas sin tocar tu biblioteca real).
if (process.env['BIBLIOTECA_DATA_DIR']) app.setPath('userData', process.env['BIBLIOTECA_DATA_DIR'])

// Protocolo interno "lib://" para servir portadas y recursos de pdf.js al renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lib',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.icc': 'application/octet-stream'
}

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
const pdfjsDir = (): string =>
  isDev ? join(app.getAppPath(), 'src', 'renderer', 'public', 'pdfjs') : join(__dirname, '..', 'renderer', 'pdfjs')

function registerLibProtocol(): void {
  protocol.handle('lib', async (req) => {
    const url = new URL(req.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const root = url.hostname === 'cover' ? lib.coversDir() : url.hostname === 'pdfjs' ? pdfjsDir() : null
    if (!root) return new Response('Not found', { status: 404 })
    const file = normalize(join(root, rel))
    if (!file.startsWith(normalize(root))) return new Response('Forbidden', { status: 403 })
    try {
      const body = await fs.readFile(file)
      return new Response(body, {
        headers: {
          'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=31536000, immutable'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

let win: BrowserWindow | null = null

function createWindow(): void {
  const dark = lib.getLibrary().settings.theme === 'dark' ||
    (lib.getLibrary().settings.theme === 'system' && nativeTheme.shouldUseDarkColors)
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: 'Biblioteca PDF',
    backgroundColor: dark ? '#1f2124' : '#f4f5f7',
    autoHideMenuBar: true,
    // En la app instalada el ícono viene del .exe; esto es para el modo desarrollo.
    ...(isDev ? { icon: join(app.getAppPath(), 'build', 'icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Que el procesamiento de PDFs siga a toda velocidad aunque la ventana esté minimizada.
      backgroundThrottling: false
    }
  })
  win.on('ready-to-show', () => win?.show())
  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (isDev) win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('library:get', () => lib.getLibrary())

  ipcMain.handle('library:addFoldersDialog', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Elige una o varias carpetas con PDFs',
      properties: ['openDirectory', 'multiSelections']
    })
    return r.canceled ? [] : lib.addPaths(r.filePaths)
  })

  ipcMain.handle('library:addFilesDialog', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Elige uno o varios PDFs',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    return r.canceled ? [] : lib.addPaths(r.filePaths)
  })

  ipcMain.handle('library:addPaths', (_e, paths: string[]) => lib.addPaths(paths))
  ipcMain.handle('library:removeSource', (_e, id: string) => lib.removeSource(id))
  ipcMain.handle('library:scan', () => lib.scan())
  ipcMain.handle('library:upsertBook', (_e, p: ProcessedBook) => lib.upsertBook(p))
  ipcMain.handle('library:clearExcluded', () => lib.clearExcluded())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => lib.updateSettings(patch))

  ipcMain.handle('book:update', (_e, id: string, patch: BookPatch) => lib.updateBook(id, patch))
  ipcMain.handle('book:exclude', (_e, id: string) => lib.excludeBook(id))
  ipcMain.handle('book:setCover', (_e, id: string, bytes: Uint8Array, page: number) =>
    lib.setCover(id, bytes, page)
  )
  ipcMain.handle('book:customCoverDialog', async (_e, id: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Elige una imagen para la portada',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const src = r.filePaths[0]
    let ext = extname(src).slice(1).toLowerCase()
    if (ext === 'jpeg') ext = 'jpg'
    return lib.setCover(id, await fs.readFile(src), null, ext)
  })

  ipcMain.handle('book:open', async (_e, id: string) => {
    const book = lib.getLibrary().books[id]
    if (!book) return { ok: false, error: 'Libro no encontrado' }
    if (!existsSync(book.path)) return { ok: false, missing: true }
    const err = await shell.openPath(book.path)
    if (err) return { ok: false, error: err }
    return { ok: true, book: lib.markOpened(id) }
  })
  ipcMain.handle('book:showInFolder', (_e, id: string) => {
    const book = lib.getLibrary().books[id]
    if (book && existsSync(book.path)) shell.showItemInFolder(book.path)
  })

  // Lectura por rangos para que pdf.js cargue solo las partes necesarias del PDF.
  ipcMain.handle('pdf:size', async (_e, path: string) => (await fs.stat(path)).size)
  ipcMain.handle('pdf:read', async (_e, path: string, start: number, end: number) => {
    const fh = await fs.open(path, 'r')
    try {
      const buf = Buffer.alloc(end - start)
      const { bytesRead } = await fh.read(buf, 0, end - start, start)
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead)
    } finally {
      await fh.close()
    }
  })
}

app.whenReady().then(() => {
  lib.loadLibrary()
  registerLibProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false
app.on('before-quit', (e) => {
  if (quitting) return
  e.preventDefault()
  quitting = true
  lib.flushSave().finally(() => app.quit())
})
