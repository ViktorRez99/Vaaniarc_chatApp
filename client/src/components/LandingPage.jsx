import { useState, useEffect, useCallback, useMemo, useRef, memo, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion"
import { MessageCircle, Video, FolderLock, Shield, ArrowRight, Zap, Menu, Play, Globe, Lock } from "lucide-react"

/* ═══════════════════════════════════════
   LAZY-LOADED: Heavy Chat Card (separate chunk)
   ═══════════════════════════════════════ */
const ChatUICard = lazy(() => import("./ChatUICard"))

/* ═══════════════════════════════════════
   MOUSE TRACKING (throttled + motion values)
   ═══════════════════════════════════════ */
const springConfig = { stiffness: 500, damping: 28, restDelta: 0.5 }
const ringSpringConfig = { stiffness: 150, damping: 20, restDelta: 1 }

function useSmoothMouse() {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const smx = useSpring(mx, springConfig)
  const smy = useSpring(my, springConfig)
  const rmx = useSpring(mx, ringSpringConfig)
  const rmy = useSpring(my, ringSpringConfig)

  useEffect(() => {
    let raf
    const onMove = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        mx.set(e.clientX)
        my.set(e.clientY)
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [mx, my])

  return { smx, smy, rmx, rmy }
}

/* ═══════════════════════════════════════
   CUSTOM CURSOR (GPU-optimized)
   ═══════════════════════════════════════ */
const CustomCursor = memo(function CustomCursor() {
  const { smx, smy, rmx, rmy } = useSmoothMouse()
  return (
    <>
      <motion.div className="fixed top-0 left-0 pointer-events-none z-[9999] hidden lg:block will-change-transform"
        style={{ x: smx, y: smy, translateX: '-50%', translateY: '-50%' }}>
        <div className="w-2 h-2 rounded-full bg-[#00F0FF]" style={{ boxShadow: '0 0 10px #00F0FF, 0 0 20px #00F0FF80' }} />
      </motion.div>
      <motion.div className="fixed top-0 left-0 pointer-events-none z-[9998] hidden lg:block will-change-transform"
        style={{ x: rmx, y: rmy, translateX: '-50%', translateY: '-50%' }}>
        <div className="w-8 h-8 rounded-full border border-[rgba(0,240,255,0.35)]" />
      </motion.div>
    </>
  )
})

/* ═══════════════════════════════════════
   FLOATING ORBS (memoized, no re-renders)
   ═══════════════════════════════════════ */
const FloatingOrbs = memo(function FloatingOrbs() {
  const orbs = useMemo(() => [
    { size: 300, x: '10%', y: '20%', color: 'rgba(0,240,255,0.06)', dur: 10, delay: 0 },
    { size: 400, x: '80%', y: '60%', color: 'rgba(0,255,102,0.04)', dur: 14, delay: 2 },
    { size: 250, x: '50%', y: '80%', color: 'rgba(0,240,255,0.04)', dur: 12, delay: 4 },
    { size: 350, x: '20%', y: '70%', color: 'rgba(255,176,32,0.04)', dur: 16, delay: 1 },
  ], [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {orbs.map((orb, i) => (
        <motion.div key={i} className="absolute rounded-full will-change-transform"
          style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y, background: orb.color, filter: 'blur(80px)' }}
          animate={{ y: [0, -30, 0], x: [0, 15, 0] }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: 'easeInOut', delay: orb.delay }}
        />
      ))}
    </div>
  )
})

/* ═══════════════════════════════════════
   SCROLL PROGRESS
   ═══════════════════════════════════════ */
const ScrollProgress = memo(function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  return <motion.div className="fixed top-0 left-0 right-0 h-[2px] z-[60] origin-left will-change-transform"
    style={{ scaleX, background: 'linear-gradient(90deg, #00F0FF, #00FF66)' }} />
})

/* ═══════════════════════════════════════
   DATA
   ═══════════════════════════════════════ */
const landingFeatures = [
  { icon: MessageCircle, title: "Real-Time Messaging", description: "Sub-100ms latency with end-to-end encryption.", color: "#00F0FF" },
  { icon: Video, title: "Video Conferencing", description: "HD meetings with a single click. No plugins.", color: "#00FF66" },
  { icon: FolderLock, title: "Smart Organization", description: "Channels, threads, AI-powered search.", color: "#00F0FF" },
  { icon: Shield, title: "Zero-Knowledge", description: "Encrypted in your browser. We can't read them.", color: "#00FF66" },
]

/* ═══════════════════════════════════════
   FEATURE CARD (memoized)
   ═══════════════════════════════════════ */
const FeatureCard = memo(function FeatureCard({ feature, index, activeFeature, setActiveFeature }) {
  const Icon = feature.icon
  const isActive = activeFeature === index
  return (
    <motion.div initial={{ opacity: 0, y: 60, rotateX: 15 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => setActiveFeature(index)} className="relative cursor-pointer group will-change-transform"
      style={{ transformStyle: 'preserve-3d', perspective: 800 }}
      whileHover={{ scale: 1.03, rotateX: -3, rotateY: 3, transition: { duration: 0.3 } }}>
      <div className="rounded-2xl p-6 h-full transition-all duration-500"
        style={{
          background: isActive ? `${feature.color}08` : 'rgba(255,255,255,0.02)',
          border: isActive ? `1px solid ${feature.color}35` : '1px solid rgba(255,255,255,0.06)',
          boxShadow: isActive ? `0 0 30px ${feature.color}12, 0 10px 40px rgba(0,0,0,0.3)` : '0 4px 20px rgba(0,0,0,0.2)',
        }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300"
          style={{ background: isActive ? `${feature.color}15` : 'rgba(255,255,255,0.04)', border: isActive ? `1px solid ${feature.color}40` : '1px solid rgba(255,255,255,0.06)', transform: 'translateZ(30px)', boxShadow: isActive ? `0 0 20px ${feature.color}20` : 'none' }}>
          <Icon size={22} style={{ color: isActive ? feature.color : 'rgba(255,255,255,0.4)' }} />
        </div>
        <h3 className="text-base font-bold mb-2" style={{ color: '#fff', transform: 'translateZ(20px)' }}>{feature.title}</h3>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)', transform: 'translateZ(15px)' }}>{feature.description}</p>
      </div>
    </motion.div>
  )
})

/* ═══════════════════════════════════════
   SUSPENSE FALLBACK
   ═══════════════════════════════════════ */
function CardSkeleton() {
  return <div className="w-full max-w-5xl mx-auto h-[500px] rounded-[24px] animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
}

function DeferredChatPreview() {
  const containerRef = useRef(null)
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element || shouldLoadPreview) return undefined

    if (!('IntersectionObserver' in window)) {
      setShouldLoadPreview(true)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoadPreview(true)
        observer.disconnect()
      }
    }, { rootMargin: '320px 0px' })

    observer.observe(element)
    return () => observer.disconnect()
  }, [shouldLoadPreview])

  return (
    <section ref={containerRef} className="relative h-screen flex items-center justify-center px-4" style={{ perspective: '1500px' }}>
      {shouldLoadPreview ? (
        <Suspense fallback={<CardSkeleton />}>
          <ChatUICard />
        </Suspense>
      ) : (
        <CardSkeleton />
      )}
    </section>
  )
}

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */
const LandingPage = () => {
  const navigate = useNavigate()
  const { login, isAuthenticated, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setActiveFeature(p => (p + 1) % landingFeatures.length), 5000)
    return () => clearInterval(interval)
  }, [])

  const handleDemo = useCallback(async () => {
    try { await login({ identifier: "demo", password: "demopassword" }); navigate('/chat') }
    catch (navigationError) {
      console.error('Failed to open demo route:', navigationError)
      navigate('/auth')
    }
  }, [login, navigate])

  const { scrollYProgress } = useScroll()
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0])
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -100])

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: '#000' }}>
      <ScrollProgress />
      <FloatingOrbs />

      {/* Subtle grid */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.02]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* HEADER */}
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto px-6 py-4">
          <div className="rounded-2xl px-6 py-3 flex items-center justify-between backdrop-blur-xl"
            style={{ background: 'rgba(10,10,10,0.80)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,240,255,0.12)', border: '1px solid rgba(0,240,255,0.25)' }}>
                <Zap className="w-4 h-4" style={{ color: '#00F0FF' }} />
              </div>
              <span className="text-lg font-bold tracking-tight" style={{ color: '#fff' }}>VaaniArc</span>
            </div>
            <div className="flex items-center gap-3">
              {!isAuthenticated ? (
                <>
                  <button onClick={() => navigate('/auth')} className="hidden lg:block px-4 py-2 text-sm font-medium hover:text-white transition-colors cursor-pointer bg-transparent border-none" style={{ color: 'rgba(255,255,255,0.6)' }}>Log In</button>
                  <button onClick={() => navigate('/auth?signup=true')} className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black transition-all cursor-pointer border-none"
                    style={{ background: '#00F0FF', boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)' }}>
                    Get Started <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button aria-label="Open navigation menu" onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 transition-colors cursor-pointer bg-transparent border-none" style={{ color: 'rgba(255,255,255,0.6)' }}><Menu className="w-5 h-5" /></button>
                </>
              ) : (
                <>
                  <button onClick={() => navigate('/chat')} className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black transition-all cursor-pointer border-none" style={{ background: '#00FF66' }}>Go to Chats</button>
                  <button onClick={logout} className="hidden lg:block px-4 py-2 text-sm font-medium hover:text-white transition-colors cursor-pointer bg-transparent border-none" style={{ color: 'rgba(255,255,255,0.6)' }}>Logout</button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* ═══════ HERO ═══════ */}
      <section className="relative min-h-screen flex items-center justify-center px-4 pt-24 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div className="absolute rounded-full border will-change-transform" style={{ width: 600, height: 600, borderColor: 'rgba(0,240,255,0.05)' }}
            animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute rounded-full border will-change-transform" style={{ width: 500, height: 500, borderColor: 'rgba(0,255,102,0.03)' }}
            animate={{ rotate: -360 }} transition={{ duration: 45, repeat: Infinity, ease: 'linear' }} />
        </div>

        <motion.div className="text-center max-w-[900px] relative z-10" style={{ opacity: heroOpacity, y: heroY }}>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
            style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.15)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00F0FF' }} />
            <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: '#00F0FF' }}>Now in Public Beta</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-[-0.04em] mb-6">
            <span className="block" style={{ color: '#fff' }}>Zero-Knowledge.</span>
            <span className="block mt-2" style={{
              background: 'linear-gradient(135deg, #00F0FF 0%, #00FF66 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              filter: 'drop-shadow(0 0 30px rgba(0, 240, 255, 0.4))'
            }}>Infinite Freedom.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Post-quantum encrypted messaging with true end-to-end protection.
            <br className="hidden sm:block" />
            Built for teams that refuse to compromise on privacy.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button onClick={() => navigate('/auth?signup=true')}
              className="group flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold text-black transition-all cursor-pointer border-none"
              style={{ background: '#00F0FF', boxShadow: '0 0 30px rgba(0, 240, 255, 0.4)' }}
              whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(0, 240, 255, 0.6)' }} whileTap={{ scale: 0.98 }}>
              Start Free <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </motion.button>
            <motion.button onClick={handleDemo}
              className="group flex items-center gap-2 px-8 py-4 rounded-xl text-base font-medium transition-all cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.08)' }} whileTap={{ scale: 0.98 }}>
              <Play className="w-4 h-4" style={{ color: '#00F0FF' }} /> Try Demo
            </motion.button>
          </motion.div>
        </motion.div>

        <motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Scroll</span>
          <div className="w-[1px] h-8" style={{ background: 'linear-gradient(180deg, rgba(0,240,255,0.5), transparent)' }} />
        </motion.div>
      </section>

      {/* ═══════ CHAT PREVIEW (lazy-loaded) ═══════ */}
      <DeferredChatPreview />

      {/* ═══════ FEATURES ═══════ */}
      <section className="relative py-32 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7 }}
            className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4" style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.12)' }}>
              <Zap size={14} style={{ color: '#00F0FF' }} />
              <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: '#00F0FF' }}>Core Features</span>
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4" style={{ color: '#fff' }}>
              Built for Modern Teams
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Every feature designed with performance and privacy as the foundation.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6" style={{ perspective: 1000 }}>
            {landingFeatures.map((feature, index) => (
              <FeatureCard key={index} feature={feature} index={index} activeFeature={activeFeature} setActiveFeature={setActiveFeature} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SECURITY ═══════ */}
      <section className="relative py-32 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7 }}>
            <div className="rounded-3xl p-8 md:p-14 text-center relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 176, 32, 0.05) 0%, rgba(0, 0, 0, 0.3) 100%)',
                border: '1px solid rgba(255, 176, 32, 0.15)',
                boxShadow: '0 0 80px rgba(255, 176, 32, 0.06), 0 20px 60px rgba(0,0,0,0.4)',
              }}>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8" style={{ background: 'rgba(255, 176, 32, 0.08)', border: '1px solid rgba(255, 176, 32, 0.2)' }}>
                <Lock size={14} style={{ color: '#FFB020' }} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: '#FFB020' }}>Stealth Vault</span>
              </div>

              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6" style={{ color: '#fff' }}>
                Your keys never<br />leave this device.
              </h2>

              <p className="text-lg max-w-xl mx-auto mb-12" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                VaaniArc uses zero-knowledge architecture with post-quantum encryption.
                Messages are encrypted in your browser before they ever reach our servers.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-8">
                {[
                  { icon: Shield, text: "AES-256-GCM" },
                  { icon: Globe, text: "Post-quantum" },
                  { icon: Lock, text: "Zero-knowledge" },
                ].map((item, index) => (
                  <motion.div key={index} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
                    className="flex items-center gap-3 px-5 py-3.5 rounded-xl" style={{ background: 'rgba(255, 176, 32, 0.05)', border: '1px solid rgba(255, 176, 32, 0.1)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255, 176, 32, 0.1)', border: '1px solid rgba(255, 176, 32, 0.2)' }}>
                      <item.icon size={18} style={{ color: '#FFB020' }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="relative py-32 px-4">
        <div className="max-w-lg mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.6 }}
            className="rounded-2xl p-10 md:p-12 relative overflow-hidden"
            style={{ background: 'rgba(18,18,18,0.80)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: 'rgba(0,240,255,0.08)' }} />

            <h2 className="text-3xl md:text-4xl font-bold mb-4 relative" style={{ color: '#fff' }}>Ready to get started?</h2>
            <p className="text-base mb-10 relative" style={{ color: 'rgba(255,255,255,0.5)' }}>Join thousands of teams who trust VaaniArc.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative">
              <motion.button onClick={() => navigate('/auth?signup=true')}
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-black transition-all cursor-pointer border-none"
                style={{ background: '#00F0FF', boxShadow: '0 0 30px rgba(0, 240, 255, 0.4)' }}
                whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(0, 240, 255, 0.6)' }} whileTap={{ scale: 0.98 }}>
                Create Free Account <ArrowRight size={16} />
              </motion.button>
              <motion.button onClick={handleDemo}
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all cursor-pointer"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.05)' }} whileTap={{ scale: 0.98 }}>
                <Play size={16} style={{ color: '#00F0FF' }} /> Try Demo
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 px-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(0,240,255,0.12)' }}>
              <Zap className="w-3 h-3" style={{ color: '#00F0FF' }} />
            </div>
            <span className="text-sm font-bold" style={{ color: '#fff' }}>VaaniArc</span>
          </div>
          <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>&copy; 2026 VaaniArc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
