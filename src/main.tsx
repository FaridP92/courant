import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Conteneur #root introuvable dans index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
