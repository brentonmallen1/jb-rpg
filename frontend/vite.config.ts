import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load .env from project root (parent directory)
  envDir: '..',
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '5173'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '8008'}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split React into its own chunk for better caching
          if (id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/react-router')) {
            return 'router'
          }
        },
      },
    },
    // Target modern browsers for smaller output
    target: 'es2020',
  },
})
