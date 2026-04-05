import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Auth from "./components/Auth";
import LandingPage from "./components/LandingPage";
import ChatHub from "./components/ChatHub";
import ErrorBoundary from "./components/ErrorBoundary";
import Settings from "./components/Settings";
import DeviceEncryptionResetModal from "./components/DeviceEncryptionResetModal";

const LoadingScreen = ({
  title = "VaaniArc",
  message = "Connecting you to conversations...",
  actionLabel = "",
  onAction = null
}) => (
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
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-gray-300">{message}</p>
        {onAction && actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            {actionLabel}
          </button>
        )}
        <div className="flex justify-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce delay-100"></div>
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
        </div>
      </div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const {
    isAuthenticated,
    isLoading,
    sessionRestoreStatus,
    sessionRestoreMessage,
    retrySessionRestore
  } = useAuth();

  if (sessionRestoreStatus === "unavailable") {
    return (
      <LoadingScreen
        title="Backend Unavailable"
        message={sessionRestoreMessage || "The backend is still restarting."}
        actionLabel="Retry Connection"
        onAction={() => {
          void retrySessionRestore();
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title={sessionRestoreStatus === "recovering" ? "Backend Recovering" : "VaaniArc"}
        message={sessionRestoreMessage || "Connecting you to conversations..."}
      />
    );
  }

  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

const PublicOnlyRoute = ({ children }) => {
  const {
    isAuthenticated,
    isLoading,
    sessionRestoreStatus,
    sessionRestoreMessage,
    retrySessionRestore
  } = useAuth();

  if (sessionRestoreStatus === "unavailable") {
    return (
      <LoadingScreen
        title="Backend Unavailable"
        message={sessionRestoreMessage || "The backend is still restarting."}
        actionLabel="Retry Connection"
        onAction={() => {
          void retrySessionRestore();
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <LoadingScreen
        title={sessionRestoreStatus === "recovering" ? "Backend Recovering" : "VaaniArc"}
        message={sessionRestoreMessage || "Connecting you to conversations..."}
      />
    );
  }

  return isAuthenticated ? <Navigate to="/chat" replace /> : children;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicOnlyRoute>
            <LandingPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/auth"
        element={
          <PublicOnlyRoute>
            <Auth />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/meeting/:meetingId"
        element={
          <ProtectedRoute>
            <ChatHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? "/chat" : "/"} replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 font-sans">
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <AppRoutes />
            <DeviceEncryptionResetModal />
          </Suspense>
        </AuthProvider>
      </div>
    </ErrorBoundary>
  );
}

export default App;
