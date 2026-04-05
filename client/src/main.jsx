import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import "./assets/animations.css"
import App from "./App.jsx"
import { registerServiceWorker } from "./services/notifications.js"

const rootElement = document.getElementById("root")

if (!rootElement) {
  console.error("Root element not found. Creating one...")
  const newRoot = document.createElement("div")
  newRoot.id = "root"
  document.body.appendChild(newRoot)
}

const root = createRoot(rootElement || document.getElementById("root"))
const appTree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
)

registerServiceWorker().catch((error) => {
  console.error("Service worker registration failed:", error)
})

root.render(
  import.meta.env.DEV
    ? appTree
    : (
      <StrictMode>
        {appTree}
      </StrictMode>
    ),
)
