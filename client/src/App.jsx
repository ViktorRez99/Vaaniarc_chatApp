import { Suspense, lazy } from "react"
import { Route, Routes } from "react-router-dom"
import ErrorBoundary from "./components/ErrorBoundary"

const PublicLandingApp = lazy(() => import("./PublicLandingApp"))
const AuthenticatedApp = lazy(() => import("./AuthenticatedApp"))

const RouteFallback = () => (
  <div className="grid min-h-screen place-items-center bg-black text-white">
    <div className="text-center">
      <div className="mx-auto mb-4 h-10 w-10 rounded-xl border border-cyan-300/30 bg-cyan-300/10" />
      <p className="text-sm text-white/60">Loading VaaniArc...</p>
    </div>
  </div>
)

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={(
            <Suspense fallback={<RouteFallback />}>
              <PublicLandingApp />
            </Suspense>
          )}
        />
        <Route
          path="/*"
          element={(
            <Suspense fallback={<RouteFallback />}>
              <AuthenticatedApp />
            </Suspense>
          )}
        />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
