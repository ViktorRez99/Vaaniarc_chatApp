import { Suspense, lazy, Component, useEffect, useState } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { SocketProvider } from "./context/SocketContext"
import Auth from "./components/Auth"
import { Toaster } from "./components/ui/Toaster"

const ChatHub = lazy(() => import("./components/ChatHub"))
const Settings = lazy(() => import("./components/Settings"))
const PasskeySetup = lazy(() => import("./components/PasskeySetup"))
const VerifyEmail = lazy(() => import("./components/VerifyEmail"))
const DeviceEncryptionResetModal = lazy(() => import("./components/DeviceEncryptionResetModal"))
const PwaRuntimeBanner = lazy(() => import("./components/PwaRuntimeBanner"))

const LoadingScreen = ({ title = "VaaniArc", message = "Establishing secure connection...", actionLabel = "", onAction = null }) => (
  <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: '#000' }}>
    <div className="text-center z-10 max-w-sm mx-4">
      <div>
        <div
          className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.15)' }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M14 3L24 8V20L14 25L4 20V8L14 3Z" stroke="#00F0FF" strokeWidth="1.2" fill="none" opacity="0.5" />
            <circle cx="14" cy="14" r="3" fill="#00F0FF" opacity="0.55" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold mb-2" style={{ color: '#fff' }}>{title}</h2>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{message}</p>

        {onAction && actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer border-none"
            style={{ background: '#00F0FF', color: '#000' }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  </div>
)

class AuthErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error("Auth page crashed:", error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#000' }}>
          <div className="max-w-md w-full rounded-2xl p-8 text-center" style={{ background: '#131316', border: '1px solid rgba(255,68,102,0.3)' }}>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#FF4466' }}>Auth Error</h2>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {this.state.error?.message || "Something went wrong loading the auth page."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none"
              style={{ background: '#00F0FF', color: '#000' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, requiresPasskeyEnrollment, sessionRestoreStatus, sessionRestoreMessage, retrySessionRestore } = useAuth()
  if (sessionRestoreStatus === "unavailable") return <LoadingScreen title="Backend Unavailable" message={sessionRestoreMessage || "The backend is still restarting."} actionLabel="Retry Connection" onAction={() => { void retrySessionRestore() }} />
  if (isLoading) return <LoadingScreen title={sessionRestoreStatus === "recovering" ? "Backend Recovering" : "VaaniArc"} message={sessionRestoreMessage || "Establishing secure connection..."} />
  if (isAuthenticated && requiresPasskeyEnrollment) return <Navigate to="/passkey-setup" replace />
  return isAuthenticated ? children : <Navigate to="/auth" replace />
}

const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, isLoading, requiresPasskeyEnrollment, sessionRestoreStatus, sessionRestoreMessage, retrySessionRestore } = useAuth()
  if (sessionRestoreStatus === "unavailable") return <LoadingScreen title="Backend Unavailable" message={sessionRestoreMessage || "The backend is still restarting."} actionLabel="Retry Connection" onAction={() => { void retrySessionRestore() }} />
  if (isLoading) return <LoadingScreen title={sessionRestoreStatus === "recovering" ? "Backend Recovering" : "VaaniArc"} message={sessionRestoreMessage || "Establishing secure connection..."} />
  return isAuthenticated ? <Navigate to={requiresPasskeyEnrollment ? "/passkey-setup" : "/chat"} replace /> : children
}

const PasskeySetupRoute = ({ children }) => {
  const { isAuthenticated, isLoading, sessionRestoreStatus, sessionRestoreMessage, retrySessionRestore } = useAuth()
  if (sessionRestoreStatus === "unavailable") return <LoadingScreen title="Backend Unavailable" message={sessionRestoreMessage || "The backend is still restarting."} actionLabel="Retry Connection" onAction={() => { void retrySessionRestore() }} />
  if (isLoading) return <LoadingScreen title={sessionRestoreStatus === "recovering" ? "Backend Recovering" : "VaaniArc"} message={sessionRestoreMessage || "Establishing secure connection..."} />
  return isAuthenticated ? children : <Navigate to="/auth" replace />
}

const PageMotion = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.995 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -6, scale: 0.995 }}
    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    style={{ minHeight: '100vh' }}
  >
    {children}
  </motion.div>
)

const RuntimeOverlays = () => {
  const { isAuthenticated } = useAuth()
  const [showPwaRuntimeBanner, setShowPwaRuntimeBanner] = useState(false)

  useEffect(() => {
    const schedule = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback)
      : (callback) => window.setTimeout(callback, 1500)
    const cancel = window.cancelIdleCallback
      ? (handle) => window.cancelIdleCallback(handle)
      : (handle) => window.clearTimeout(handle)
    const handle = schedule(() => setShowPwaRuntimeBanner(true))
    return () => cancel(handle)
  }, [])

  return (
    <>
      {isAuthenticated && <DeviceEncryptionResetModal />}
      {showPwaRuntimeBanner && <PwaRuntimeBanner />}
    </>
  )
}

const AuthenticatedRoutes = () => {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/auth" element={<PublicOnlyRoute><PageMotion><AuthErrorBoundary><Auth /></AuthErrorBoundary></PageMotion></PublicOnlyRoute>} />
        <Route path="/verify-email" element={<PageMotion><VerifyEmail /></PageMotion>} />
        <Route path="/passkey-setup" element={<PasskeySetupRoute><PageMotion><PasskeySetup /></PageMotion></PasskeySetupRoute>} />
        <Route path="/chat" element={<ProtectedRoute><PageMotion><ChatHub /></PageMotion></ProtectedRoute>} />
        <Route path="/meeting/:meetingId" element={<ProtectedRoute><PageMotion><ChatHub /></PageMotion></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><PageMotion><Settings /></PageMotion></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/chat" : "/auth"} replace />} />
      </Routes>
    </AnimatePresence>
  )
}

const AuthenticatedApp = () => (
  <div className="min-h-screen" style={{ background: '#000', minHeight: '100vh' }}>
    <AuthProvider>
      <SocketProvider>
        <Suspense fallback={<LoadingScreen />}>
          <AuthenticatedRoutes />
          <RuntimeOverlays />
        </Suspense>
      </SocketProvider>
    </AuthProvider>
    <Toaster />
  </div>
)

export default AuthenticatedApp
