import { relative, resolve } from 'path'
import colors from 'picocolors'
import picomatch from 'picomatch'
import { type PluginOption, type ViteDevServer, normalizePath } from 'vite'

/**
 * Configuration for the watched paths.
 */
export interface Config {
  /**
   * Whether full reload should happen regardless of the file path.
   * @default true
   */
  always?: boolean

  /**
   * How many milliseconds to wait before reloading the page after a file change.
   * @default 0
   */
  delay?: number

  /**
   * Whether to log when a file change triggers a full reload.
   * @default true
   */
  log?: boolean

  /**
   * Files will be resolved against this path.
   * @default process.cwd()
   */
  root?: string

  /**
   * Files will be resolved against this path.
   * @default process.cwd()
   */
  turbo?: boolean
}

export function normalizePaths (root: string, path: string | string[]): string[] {
  return (Array.isArray(path) ? path : [path]).map(path => resolve(root, path)).map(normalizePath)
}

/**
 * Allows to automatically reload the page when a watched file changes.
 */
export default (paths: string | string[], config: Config = {}): PluginOption => ({
  name: 'vite-plugin-full-reload',

  apply: 'serve',

  // NOTE: Enable globbing so that Vite keeps track of the template files.
  config: () => ({ server: { watch: { disableGlobbing: false } } }),

  transform(code, id, options) {
    if ((options == null ? void 0 : options.ssr) && !process.env.VITEST)
      return;

    if (config.turbo && id.includes("hotwired_turbo-rails.js")) {
      const metaHotFooter = `
        if (import.meta.hot) {
          import.meta.hot.on("turbo-refresh", (data) => {
            console.log("Run <turbo-stream action=refresh> via vite-plugin-full-reload");
            Turbo.renderStreamMessage('<turbo-stream action="refresh"></turbo-stream>');
          })
        }
      `.replace(/(\n|\s\s)+/gm, "");

      return `${code}\n${metaHotFooter}`;
    }
  },

  configureServer ({ watcher, ws, config: { logger } }: ViteDevServer) {
    const { root = process.cwd(), log = true, always = true, delay = 0, turbo = false } = config

    const files = normalizePaths(root, paths)
    const shouldReload = picomatch(files)
    const checkReload = (path: string) => {
      if (shouldReload(path)) {
        if (turbo) {
          setTimeout(() => ws.send({ type: 'custom', event: 'turbo-refresh'}), delay)
        } else {
          setTimeout(() => ws.send({ type: 'full-reload', path: always ? '*' : path }), delay)
        }
        if (log)
          logger.info(`${colors.green('full reload')} ${colors.dim(relative(root, path))}`, { clear: true, timestamp: true })
      }
    }

    // Ensure Vite keeps track of the files and triggers HMR as needed.
    watcher.add(files)

    // Do a full page reload if any of the watched files changes.
    watcher.on('add', checkReload)
    watcher.on('change', checkReload)
  },
})
