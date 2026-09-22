import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { void updateSW(true) },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    window.setInterval(()=>void registration.update(), 60_000)
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void registration.update()})
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
