import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-selected-v6.jpg'],
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
          { src: 'logo-selected-v6.jpg', sizes: '192x192', type: 'image/jpeg', purpose: 'any' }
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
