import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Book,
  BookPatch,
  LibraryData,
  OpenResult,
  ProcessedBook,
  ScanResult,
  Settings,
  Source
} from '../shared/types'

const api = {
  getLibrary: (): Promise<LibraryData> => ipcRenderer.invoke('library:get'),
  addFoldersDialog: (): Promise<Source[]> => ipcRenderer.invoke('library:addFoldersDialog'),
  addFilesDialog: (): Promise<Source[]> => ipcRenderer.invoke('library:addFilesDialog'),
  addPaths: (paths: string[]): Promise<Source[]> => ipcRenderer.invoke('library:addPaths', paths),
  removeSource: (id: string): Promise<number> => ipcRenderer.invoke('library:removeSource', id),
  scan: (): Promise<ScanResult> => ipcRenderer.invoke('library:scan'),
  upsertBook: (p: ProcessedBook): Promise<Book> => ipcRenderer.invoke('library:upsertBook', p),
  clearExcluded: (): Promise<void> => ipcRenderer.invoke('library:clearExcluded'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),
  updateBook: (id: string, patch: BookPatch): Promise<Book | null> => ipcRenderer.invoke('book:update', id, patch),
  excludeBook: (id: string): Promise<void> => ipcRenderer.invoke('book:exclude', id),
  setCover: (id: string, bytes: Uint8Array, page: number): Promise<Book | null> =>
    ipcRenderer.invoke('book:setCover', id, bytes, page),
  customCoverDialog: (id: string): Promise<Book | null> => ipcRenderer.invoke('book:customCoverDialog', id),
  openBook: (id: string): Promise<OpenResult> => ipcRenderer.invoke('book:open', id),
  showInFolder: (id: string): Promise<void> => ipcRenderer.invoke('book:showInFolder', id),
  pdfSize: (path: string): Promise<number> => ipcRenderer.invoke('pdf:size', path),
  pdfRead: (path: string, start: number, end: number): Promise<Uint8Array> =>
    ipcRenderer.invoke('pdf:read', path, start, end),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
