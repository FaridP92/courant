import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, resolveTheme } from './hooks/useTheme.ts'

// le script inline d'index.html a déjà posé le thème ; on le confirme côté React
applyTheme(resolveTheme())

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Conteneur #root introuvable dans index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
