import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.jsx"

const isDevLoopbackIp = import.meta.env.DEV
  && ["127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)

if (isDevLoopbackIp) {
  const localDevUrl = new URL(window.location.href)
  localDevUrl.hostname = "localhost"
  window.location.replace(localDevUrl.toString())
}

// Suppress noisy browser extension errors that are outside our control
window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason;
  const message = String(
    reason?.message
    || reason?.reason?.message
    || (typeof reason === 'string' ? reason : '')
    || ''
  );
  if (
    message.includes('message channel closed before a response was received')
    || message.includes('The message port closed before a response was received')
    || message.includes('message channel closed')
    || message.includes('message port closed')
  ) {
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }
});

// Global error display fallback (if React crashes entirely)
window.onerror = function(msg, url, line, col, error) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="background:#000;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;font-family:sans-serif;">
        <div style="max-width:400px;width:100%;background:#131316;border:1px solid rgba(255,68,102,0.3);border-radius:16px;padding:24px;text-align:center;">
          <h2 style="color:#FF4466;margin:0 0 8px;font-size:18px;">Runtime Error</h2>
          <p style="color:rgba(255,255,255,0.6);margin:0 0 16px;font-size:13px;line-height:1.5;">${String(msg).replace(/</g, '&lt;')}</p>
          <button onclick="window.location.reload()" style="background:#00F0FF;color:#000;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;">Reload Page</button>
        </div>
      </div>
    `;
  }
  return false;
};

const clearDevServiceWorkerState = async () => {
  if (!import.meta.env.DEV || !("serviceWorker" in navigator)) {
    return
  }

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))

  if ("caches" in window) {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
  }
}

const renderApp = () => {
  let rootElement = document.getElementById("root")

  if (!rootElement) {
    console.error("Root element not found. Creating one...")
    rootElement = document.createElement("div")
    rootElement.id = "root"
    document.body.appendChild(rootElement)
  }

  const root = createRoot(rootElement)
  const appTree = (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )

  root.render(
    import.meta.env.DEV
      ? appTree
      : (
        <StrictMode>
          {appTree}
        </StrictMode>
      ),
  )
}

const runWhenIdle = (callback) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 3000 })
    return
  }

  window.setTimeout(callback, 1500)
}

const bootstrapApp = () => {
  renderApp()

  if (import.meta.env.DEV) {
    clearDevServiceWorkerState().catch((error) => {
      console.warn("Development service worker cleanup failed:", error)
    })
    return
  }

  runWhenIdle(() => {
    import("./services/notifications.js")
      .then(({ registerServiceWorker }) => registerServiceWorker())
      .catch((error) => {
        console.error("Service worker registration failed:", error)
      })
  })
}

if (!isDevLoopbackIp) {
  bootstrapApp()
}
