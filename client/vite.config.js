import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VAANIARC_PROXY_TARGET || 'http://localhost:3000'
const backendProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    timeout: 10000,
  },
  '/socket.io': {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    ws: true,
    timeout: 10000,
  },
  '/uploads': {
    target: apiTarget,
    changeOrigin: true,
    secure: false,
    timeout: 10000,
  },
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    css: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    modulePreload: {
      resolveDependencies(filename, deps, context) {
        if (context.hostType !== 'html') {
          return deps
        }

        return deps.filter((dep) => (
          (dep.includes('/vendor-') && !dep.includes('/vendor-other-'))
          || dep.includes('/router-')
          || (dep.includes('vendor-') && !dep.includes('vendor-other-'))
          || dep.includes('router-')
        ))
      },
    },
    rollupOptions: {
      output: {
        hoistTransitiveImports: false,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Three.js / React Three Fiber
            if (id.includes('three') || id.includes('@react-three')) return '3d'
            // Framer Motion
            if (id.includes('framer-motion')) return 'motion'
            // React Router
            if (id.includes('react-router')) return 'router'
            // Icons
            if (id.includes('lucide-react')) return 'icons'
            // Socket.IO
            if (id.includes('socket.io')) return 'socket'
            // Post-quantum crypto (the largest library)
            if (id.includes('@noble/post-quantum')) return 'pq'
            // Classic crypto
            if (id.includes('libsodium') || id.includes('secrets.js')) return 'crypto'
            // Radix UI primitives
            if (id.includes('@radix-ui')) return 'radix'
            // React core
            if (id.includes('react') || id.includes('react-dom')) return 'vendor'
            // Everything else
            return 'vendor-other'
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    host: 'localhost',
    proxy: backendProxy,
  },
  preview: {
    port: 4173,
    host: 'localhost',
    proxy: backendProxy,
  },
})
