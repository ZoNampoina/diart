import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-approved.webp'],
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
          { src: 'icon-approved.webp', sizes: '160x160', type: 'image/webp', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,json,woff,woff2}'],
        navigateFallbackDenylist: [/^\\/api\\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ]
})
