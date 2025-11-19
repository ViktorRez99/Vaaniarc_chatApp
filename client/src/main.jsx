import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "./assets/animations.css"
import App from "./App.jsx"

const rootElement = document.getElementById("root")

if (!rootElement) {
  console.error("Root element not found. Creating one...")
  const newRoot = document.createElement("div")
  newRoot.id = "root"
  document.body.appendChild(newRoot)
}

const root = createRoot(rootElement || document.getElementById("root"))

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
