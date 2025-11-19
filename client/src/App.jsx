import { Suspense, useState, useEffect } from "react"
import { AuthProvider, useAuth } from "./context/AuthContext"
import Auth from "./components/Auth"
import LandingPage from "./components/LandingPage"
import ChatHub from "./components/ChatHub"
import ErrorBoundary from "./components/ErrorBoundary"

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 relative overflow-hidden">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
    </div>

    <div className="text-center z-10 backdrop-blur-xl bg-white/10 border border-white/20 p-8 rounded-2xl max-w-sm mx-4 shadow-2xl">
      <div className="relative mb-6 mx-auto w-16 h-16">
        <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white">VaaniArc</h2>
        <p className="text-gray-300">Connecting you to conversations...</p>
        <div className="flex justify-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce delay-100"></div>
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
        </div>
      </div>
    </div>
  </div>
)

// Main App Content Component
const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth()
  const [path, setPath] = useState(window.location.pathname)

  // Simple client-side routing
  useEffect(() => {
    const handleRouteChange = () => {
      setPath(window.location.pathname)
    }

    window.addEventListener('popstate', handleRouteChange)
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  if (isLoading) {
    return <LoadingScreen />
  }

  // If user is at home route and not authenticated, show landing page
  if (path === '/' && !isAuthenticated) {
    return <LandingPage />
  }

  // For /auth route or when not authenticated
  if (!isAuthenticated) {
    // If trying to access protected route while not authenticated, redirect to auth
    if (path !== '/' && path !== '/auth') {
      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        window.history.pushState({}, '', '/auth')
        setPath('/auth')
      }, 0)
    }
    
    // Show auth page for /auth
    if (path === '/auth') {
      return (
        <div className="min-h-screen w-full">
          <Auth />
        </div>
      )
    }
    
    // Show landing page for root
    return <LandingPage />
  }

  // For authenticated users, check route
  if (path === '/' || path === '/chat' || path.startsWith('/meeting')) {
    return (
      <div className="min-h-screen w-full">
        <ChatHub />
      </div>
    )
  }

  // Default to landing page for authenticated users
  return (
    <div className="min-h-screen w-full">
      <LandingPage />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 font-sans">
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <AppContent />
          </Suspense>
        </AuthProvider>
      </div>
    </ErrorBoundary>
  )
}

export default App
