/// <reference types="vite/client" />
import type { Api } from '../../preload/index'

declare global {
  const __APP_VERSION__: string
  interface Window {
    api: Api
  }
}
