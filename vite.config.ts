import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'favicon.svg', 'icons.svg'],
      workbox: {
        importScripts: ['sw-push.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          // Offline-friendly caching for TensorFlow.js model artifacts.
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/tfjs-models\/.*\/model\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tfjs-models-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/tfjs-models\/.*\/group\d+-shard\d+of\d+.*\.(bin|json)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tfjs-models-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          // Cache TFJS runtime modules loaded from CDN.
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tensorflow\/.*$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tfjs-runtime-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Pune E-Waste Collection',
        short_name: 'E-Waste',
        description: 'Smart e-waste collection for Pune - Report, Track, Collect',
        theme_color: '#059669',
        background_color: '#f0fdf4',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon-maskable-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ],
        categories: ['utilities', 'productivity']
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          appwrite: ['appwrite']
        }
      }
    }
  }
})
