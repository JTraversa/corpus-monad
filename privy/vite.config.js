import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], base: '/privy/', build: { outDir: '../web/privy', emptyOutDir: true } })
