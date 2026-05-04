import { AuthProvider } from "./context/AuthContext"
import LandingPage from "./components/LandingPage"

const PublicLandingApp = () => (
  <AuthProvider>
    <LandingPage />
  </AuthProvider>
)

export default PublicLandingApp
