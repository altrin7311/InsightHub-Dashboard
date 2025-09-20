import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
// Use locally provided png as favicon
// This file is intentionally in src/components/image.png per user request
// Vite will bundle and fingerprint the asset
import icon from './components/NNFavicon.png'

// Attempt to set Novo Nordisk web favicon with local fallback
function setFavicon() {
  const link = document.getElementById('dynamic-favicon') as HTMLLinkElement | null;
  if (!link) return;
  // Prefer local image.png, fallback to env override or the built-in nn.svg
  const override = (import.meta as any).env?.VITE_BRAND_ICON;
  link.href = override || icon || '/nn.svg';
}
setFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
