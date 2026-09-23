import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192-v2.png', 'icon-512-v2.png', 'logo-day-v2.png', 'logo-night-v2.png'],
      manifest: {
        name: "DI'ART by ARIZONA",
        short_name: "DI'ART",
        description: 'Répertoire musical personnel local-first',
        theme_color: '#06171d',
        background_color: '#06171d',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
})
