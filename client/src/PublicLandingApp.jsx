/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

import { AuthProvider } from "./context/AuthContext"
import LandingPage from "./components/LandingPage"

const PublicLandingApp = () => (
  <AuthProvider>
    <LandingPage />
  </AuthProvider>
)

export default PublicLandingApp
