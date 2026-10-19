import { defineConfig } from 'vite'
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/iterlay/',
  ssr: {
    noExternal: ['react-router', 'react-router-dom'],
    resolve: { conditions: ['module', 'module-sync', 'node', 'development'] },
  },
})
