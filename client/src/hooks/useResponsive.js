/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

import { useState, useEffect } from 'react'

export const useResponsive = () => {
  const [isMobile, setIsMobile] = useState(false)
  const [windowWidth, setWindowWidth] = useState(0)

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setWindowWidth(width)
      setIsMobile(width < 768)
    }

    // Set initial values
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    isMobile,
    windowWidth,
    isTablet: windowWidth >= 768 && windowWidth < 1024,
    isDesktop: windowWidth >= 1024
  }
}