import { useState, useCallback, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Cropper from 'react-easy-crop'
import getCroppedImg from '../utils/cropImage'
import { useAuth } from "../context/AuthContext"
import passkeyService from "../services/passkeys"
import { PASSWORD_POLICY, validatePassword } from "../utils/passwordPolicy"
import {
  Eye, EyeOff, ArrowRight, Loader2, AlertCircle, Upload, Check,
  ChevronLeft, X, Fingerprint, ShieldCheck, Lock, Mail, User,
  Phone, KeyRound, Sparkles, Shield, Zap
} from "lucide-react"

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const createInitialFormData = () => ({ username: "", email: "", password: "", firstName: "", lastName: "", phone: "", avatar: "", bio: "" })

const EASE = [0.16, 1, 0.3, 1]
const EASE_SMOOTH = [0.4, 0, 0.2, 1]

/* ═══════════════════════════════════════════════════════
   GLOSSY CARD with mouse-tracking glow (no 3D clip bugs)
   ═══════════════════════════════════════════════════════ */
const GlossyCard = ({ children, className = "" }) => {
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setGlowPos({ x, y })
  }

  const handleMouseLeave = () => {
    setGlowPos({ x: 50, y: 50 })
    setIsHovered(false)
  }

  return (
    <div
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setIsHovered(true)}
    >
      {/* Outer glow */}
      <div
        className="absolute -inset-[1px] rounded-[32px] pointer-events-none transition-opacity duration-500"
        style={{
          opacity: isHovered ? 0.7 : 0.35,
          background: `radial-gradient(600px circle at ${glowPos.x}% ${glowPos.y}%, rgba(0,240,255,0.12), transparent 45%)`,
        }}
      />

      {/* Animated border */}
      <div className="absolute -inset-[1px] rounded-[32px] overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: "conic-gradient(from 0deg, transparent, rgba(0,240,255,0.35), transparent, rgba(0,255,102,0.25), transparent)",
            animation: "spin 8s linear infinite",
          }}
        />
        <div className="absolute inset-[1px] rounded-[31px]" style={{ background: "#0c0c10" }} />
      </div>

      {/* Card body */}
      <div
        className="relative rounded-[30px] overflow-hidden"
        style={{
          background: "linear-gradient(165deg, rgba(20,20,28,0.95) 0%, rgba(10,10,16,0.98) 50%, rgba(8,8,14,0.99) 100%)",
          boxShadow: `
            0 0 0 1px rgba(0,240,255,0.08),
            0 0 60px rgba(0,240,255,0.06),
            0 40px 80px -20px rgba(0,0,0,0.9),
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        }}
      >
        {/* Glossy sheen overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: `radial-gradient(400px circle at ${glowPos.x}% ${glowPos.y}%, rgba(255,255,255,0.07), transparent 50%)`,
            mixBlendMode: "overlay",
          }}
        />

        {/* Top gradient accent */}
        <div className="relative z-10 h-[2px] w-full overflow-hidden">
          <div
            className="h-full w-[200%]"
            style={{
              background: "linear-gradient(90deg, transparent, #00F0FF, #00FF66, #00F0FF, transparent)",
              animation: "shimmer 3s linear infinite",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { from { transform: translateX(-50%); } to { transform: translateX(0%); } }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   AMBIENT BACKGROUND - Mesh gradient + floating orbs
   ═══════════════════════════════════════════════════════ */
const AmbientBackground = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
    {/* Mesh gradient blobs */}
    <div className="absolute inset-0 opacity-40">
      <div className="absolute rounded-full" style={{ width: 600, height: 600, top: "-20%", left: "-10%", background: "radial-gradient(circle, rgba(0,240,255,0.12) 0%, transparent 60%)", filter: "blur(100px)", animation: "float1 20s ease-in-out infinite" }} />
      <div className="absolute rounded-full" style={{ width: 500, height: 500, bottom: "-15%", right: "-10%", background: "radial-gradient(circle, rgba(0,255,102,0.08) 0%, transparent 60%)", filter: "blur(100px)", animation: "float2 25s ease-in-out infinite" }} />
      <div className="absolute rounded-full" style={{ width: 300, height: 300, top: "40%", left: "50%", background: "radial-gradient(circle, rgba(0,240,255,0.06) 0%, transparent 60%)", filter: "blur(80px)", animation: "float3 18s ease-in-out infinite" }} />
    </div>

    {/* Floating particles */}
    {Array.from({ length: 15 }).map((_, i) => (
      <div
        key={i}
        className="absolute rounded-full"
        style={{
          width: Math.random() * 3 + 1,
          height: Math.random() * 3 + 1,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          background: Math.random() > 0.5 ? "rgba(0,240,255,0.6)" : "rgba(0,255,102,0.4)",
          boxShadow: `0 0 ${Math.random() * 8 + 4}px ${Math.random() > 0.5 ? "rgba(0,240,255,0.4)" : "rgba(0,255,102,0.3)"}`,
          animation: `particle ${Math.random() * 20 + 15}s linear infinite`,
          animationDelay: `${Math.random() * -20}s`,
        }}
      />
    ))}

    {/* Subtle grid */}
    <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

    <style>{`
      @keyframes float1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -20px) scale(1.1); } }
      @keyframes float2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-20px, 30px) scale(1.15); } }
      @keyframes float3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(15px, 15px) scale(1.2); } }
      @keyframes particle { 0% { transform: translateY(100vh) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; } }
    `}</style>
  </div>
)

/* ═══════════════════════════════════════════════════════
   PASSWORD STRENGTH
   ═══════════════════════════════════════════════════════ */
const PasswordStrength = ({ password }) => {
  const strength = (() => {
    if (!password) return { level: 0, text: "", color: "" }
    let score = 0
    if (password.length >= PASSWORD_POLICY.minLength) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    const levels = [
      { level: 0, text: "", color: "" },
      { level: 1, text: "Very Weak", color: "#FF4466" },
      { level: 2, text: "Weak", color: "#f97316" },
      { level: 3, text: "Fair", color: "#FFB020" },
      { level: 4, text: "Good", color: "#00FF66" },
      { level: 5, text: "Strong", color: "#00F0FF" },
    ]
    return levels[score]
  })()

  if (!password) return null
  return (
    <div className="mt-2.5 mb-1">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.35)" }}>Strength</span>
        <motion.span
          key={strength.text}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md"
          style={{ color: strength.color, background: `${strength.color}12`, border: `1px solid ${strength.color}20` }}
        >
          {strength.text}
        </motion.span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            className="h-[3px] flex-1 rounded-full"
            initial={false}
            animate={{
              backgroundColor: i <= strength.level ? strength.color : "rgba(255,255,255,0.05)",
              boxShadow: i <= strength.level ? `0 0 8px ${strength.color}40` : "none",
            }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          />
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   FORM FIELD - Floating label + icon + glow focus
   ═══════════════════════════════════════════════════════ */
const FormField = ({ label, type = "text", name, value, onChange, placeholder, required, minLength, maxLength, rows, showPasswordStrength, shake, autoComplete, icon: Icon }) => {
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState(false)
  const hasValue = !!value
  const isFloating = focused || hasValue
  const InputComponent = rows ? "textarea" : "input"

  return (
    <motion.div className="mb-4" animate={shake ? { x: [-10, 10, -8, 8, -5, 5, -2, 2, 0] } : {}} transition={{ duration: 0.5, ease: "easeInOut" }}>
      <div className="relative group">
        {Icon && (
          <motion.div
            className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none"
            animate={{ color: focused ? "#00F0FF" : "rgba(255,255,255,0.25)" }}
            transition={{ duration: 0.2 }}
          >
            <Icon className="w-[18px] h-[18px]" />
          </motion.div>
        )}

        <motion.label
          htmlFor={name}
          className="absolute font-mono uppercase tracking-[0.12em] pointer-events-none origin-left z-10"
          style={{ left: Icon ? 42 : 16 }}
          animate={{
            top: isFloating ? -7 : "50%",
            y: isFloating ? 0 : "-50%",
            fontSize: isFloating ? "9px" : "13px",
            color: shake ? "#FF4466" : focused ? "#00F0FF" : "rgba(255,255,255,0.4)",
            background: isFloating ? "linear-gradient(180deg, #131318 0%, #0f0f14 100%)" : "transparent",
            paddingLeft: isFloating ? 6 : 0,
            paddingRight: isFloating ? 6 : 0,
          }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          {label}{required && <span className="ml-0.5" style={{ color: "#FF4466" }}>*</span>}
        </motion.label>

        <InputComponent
          type={type === "password" ? (showPassword ? "text" : "password") : type}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={isFloating ? placeholder : ""}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          rows={rows}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full text-[14px] outline-none transition-all duration-300 rounded-[14px]"
          style={{
            height: rows ? "auto" : 52,
            paddingTop: rows ? "16px" : "14px",
            paddingBottom: rows ? "16px" : "14px",
            paddingLeft: Icon ? 44 : 16,
            paddingRight: type === "password" ? 44 : 16,
            background: "rgba(255,255,255,0.025)",
            color: "#fff",
            border: `1.5px solid ${shake ? "rgba(255,68,102,0.5)" : focused ? "rgba(0,240,255,0.4)" : "rgba(255,255,255,0.06)"}`,
            boxShadow: focused
              ? "0 0 0 3px rgba(0,240,255,0.08), 0 0 24px rgba(0,240,255,0.06), inset 0 1px 0 rgba(0,240,255,0.03)"
              : "none",
          }}
        />

        {type === "password" && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 cursor-pointer bg-transparent border-none p-1"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>
        )}
      </div>
      {showPasswordStrength && <PasswordStrength password={value} />}
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════
   STEP INDICATOR
   ═══════════════════════════════════════════════════════ */
const StepIndicator = ({ currentStep, totalSteps, labels }) => (
  <div className="flex items-center justify-center gap-2 mb-8">
    {Array.from({ length: totalSteps }).map((_, i) => {
      const stepNum = i + 1
      const isActive = stepNum === currentStep
      const isCompleted = stepNum < currentStep
      return (
        <div key={i} className="flex items-center">
          <motion.div
            className="relative flex items-center justify-center"
            animate={{
              scale: isActive ? 1.1 : 1,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300"
              style={{
                background: isActive
                  ? "linear-gradient(135deg, #00F0FF, #00C8D4)"
                  : isCompleted
                    ? "rgba(0,255,102,0.15)"
                    : "rgba(255,255,255,0.04)",
                border: `1.5px solid ${isActive ? "rgba(0,240,255,0.5)" : isCompleted ? "rgba(0,255,102,0.4)" : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive ? "0 0 16px rgba(0,240,255,0.3)" : "none",
                color: isActive ? "#000" : isCompleted ? "#00FF66" : "rgba(255,255,255,0.4)",
              }}
            >
              {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
            </div>
          </motion.div>
          <span
            className="hidden sm:block ml-2 text-[11px] font-mono uppercase tracking-wider transition-colors duration-300"
            style={{ color: isActive ? "#00F0FF" : isCompleted ? "rgba(0,255,102,0.7)" : "rgba(255,255,255,0.3)" }}
          >
            {labels[i]}
          </span>
          {i < totalSteps - 1 && (
            <div className="w-8 h-[1px] mx-2" style={{ background: stepNum < currentStep ? "rgba(0,255,102,0.3)" : "rgba(255,255,255,0.06)" }} />
          )}
        </div>
      )
    })}
  </div>
)

/* ═══════════════════════════════════════════════════════
   MAIN AUTH COMPONENT
   ═══════════════════════════════════════════════════════ */
const Auth = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const urlParams = new URLSearchParams(location.search)
  const shouldSignup = urlParams.get("signup") === "true"
  const [isLogin, setIsLogin] = useState(!shouldSignup)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState(createInitialFormData)
  const [formError, setFormError] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const { login, loginWithPasskey, register, isLoading, error, clearError } = useAuth()
  const authError = formError || error
  const [passkeySupported] = useState(() => passkeyService.isSupported())

  /* Passkey enrollment state */
  const [isEnrollingPasskey, setIsEnrollingPasskey] = useState(false)
  const [passkeyError, setPasskeyError] = useState("")

  /* Cropper state */
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isCropping, setIsCropping] = useState(false)

  useEffect(() => {
    setIsLogin(!shouldSignup)
    setStep(1)
    setFormError("")
    setPasskeyError("")
    setIsEnrollingPasskey(false)
    clearError()
  }, [shouldSignup, clearError])

  const onCropComplete = useCallback((_, px) => setCroppedAreaPixels(px), [])
  const readFile = (f) => new Promise((r) => { const rd = new FileReader(); rd.addEventListener("load", () => r(rd.result), false); rd.readAsDataURL(f) })
  const onFileChange = async (e) => { if (e.target.files?.[0]) { const d = await readFile(e.target.files[0]); setImageSrc(d); setIsCropping(true) } }
  const showCroppedImage = async () => {
    try { const c = await getCroppedImg(imageSrc, croppedAreaPixels); setFormData((p) => ({ ...p, avatar: c })); setIsCropping(false); setImageSrc(null) }
    catch { setFormError("Failed to crop image.") }
  }
  const cancelCrop = () => { setIsCropping(false); setImageSrc(null) }

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target
    setFormData((p) => ({ ...p, [name]: value }))
    if (error) clearError()
    if (formError) setFormError("")
  }, [clearError, error, formError])

  const handleAvatarSelect = (url) => setFormData((p) => ({ ...p, avatar: url }))

  const validateSignupStepOne = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) return "First name and last name are required."
    if (!formData.email.trim()) return "Email is required."
    if (!isValidEmail(formData.email.trim())) return "Please enter a valid email."
    if (!formData.phone.trim()) return "Phone number is required."
    const pv = validatePassword(formData.password)
    if (!pv.isValid) return pv.error
    return null
  }

  const validateSignupStepTwo = () => {
    const u = formData.username.trim()
    if (!u) return "Username is required."
    if (u.length < 3) return "Username must be at least 3 characters."
    if (u.length > 30) return "Username must be 30 characters or less."
    if (!USERNAME_REGEX.test(u)) return "Username can only contain letters, numbers, underscores, and hyphens."
    return null
  }

  const handleNextStep = (e) => {
    e.preventDefault()
    const v = validateSignupStepOne()
    if (v) { setFormError(v); return }
    setFormError("")
    setStep(2)
    clearError()
  }

  const handlePrevStep = () => { setStep(1); setFormError(""); setPasskeyError(""); clearError() }
  const handleBackToStep2 = () => { setStep(2); setPasskeyError(""); setIsEnrollingPasskey(false) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError("")
    try {
      let response
      if (isLogin) {
        if (!formData.username.trim() || !formData.password) { setFormError("Username/email and password are required."); return }
        response = await login({ identifier: formData.username.trim(), password: formData.password })
        setIsSuccess(true)
        await new Promise((r) => setTimeout(r, 1000))
        navigate(response?.user?.passkeyRequired ? "/passkey-setup" : "/chat")
      } else {
        const s1 = validateSignupStepOne()
        if (s1) { setStep(1); setFormError(s1); return }
        const s2 = validateSignupStepTwo()
        if (s2) { setFormError(s2); return }
        response = await register({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone.trim(),
          avatar: formData.avatar,
          bio: formData.bio.trim(),
        })
        // After successful registration, go to passkey setup step
        setIsSuccess(true)
        await new Promise((r) => setTimeout(r, 800))
        setIsSuccess(false)
        setStep(3)
      }
    } catch (err) {
      setFormError(err.message || "Authentication failed.")
    }
  }

  const handlePasskeySignIn = async () => {
    setFormError("")
    try {
      await loginWithPasskey(formData.username.trim())
      setIsSuccess(true)
      await new Promise((r) => setTimeout(r, 1200))
      navigate("/chat")
    } catch (err) {
      setFormError(err.message || "Passkey sign-in failed.")
    }
  }

  const handleRegisterPasskey = async () => {
    setPasskeyError("")
    setIsEnrollingPasskey(true)
    try {
      await passkeyService.register()
      setIsSuccess(true)
      await new Promise((r) => setTimeout(r, 1200))
      navigate("/chat")
    } catch (err) {
      setPasskeyError(err.message || "Failed to register passkey.")
      setIsEnrollingPasskey(false)
    }
  }

  const setAuthMode = useCallback((next) => {
    setIsLogin(next)
    navigate(next ? "/auth" : "/auth?signup=true")
    setStep(1)
    setFormData(createInitialFormData())
    setFormError("")
    setPasskeyError("")
    setIsEnrollingPasskey(false)
    clearError()
  }, [clearError, navigate])

  const toggleAuthMode = useCallback(() => setAuthMode(!isLogin), [isLogin, setAuthMode])

  const avatars = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Zack",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Molly",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Garfield",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  ]

  const stepLabels = isLogin ? ["Sign In"] : ["Personal", "Profile", "Passkey"]
  const totalSteps = isLogin ? 1 : 3

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "#000" }}>
      <AmbientBackground />

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Logo */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <div className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,240,255,0.1)", border: "1px solid rgba(0,240,255,0.25)", boxShadow: "0 0 20px rgba(0,240,255,0.15)" }}>
              <Zap className="w-5 h-5" style={{ color: "#00F0FF" }} />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{ color: "#fff" }}>VaaniArc</span>
          </div>
        </motion.div>

        <GlossyCard>
          <div className="p-8 md:p-10">
            {/* Header */}
            <motion.div className="text-center mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease: EASE }}>
              <motion.div
                className="inline-flex items-center justify-center w-[52px] h-[52px] rounded-2xl mb-4"
                style={{
                  background: "linear-gradient(135deg, rgba(0,240,255,0.12), rgba(0,240,255,0.04))",
                  border: "1px solid rgba(0,240,255,0.25)",
                  boxShadow: "0 0 30px rgba(0,240,255,0.12), inset 0 1px 0 rgba(0,240,255,0.1)",
                }}
                animate={{ boxShadow: ["0 0 20px rgba(0,240,255,0.08)", "0 0 40px rgba(0,240,255,0.2)", "0 0 20px rgba(0,240,255,0.08)"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Lock className="w-6 h-6" style={{ color: "#00F0FF" }} />
              </motion.div>
              <h1 className="text-[24px] font-bold tracking-[-0.03em] mb-1" style={{ color: "#fff" }}>
                {isLogin ? "Welcome Back" : step === 3 ? "Secure Your Account" : step === 2 ? "Create Profile" : "Get Started"}
              </h1>
              <p className="text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.35)" }}>
                {isLogin ? "Zero-Knowledge · Post-Quantum Secured" : step === 3 ? "Passkey Required for Maximum Security" : "Step " + step + " of 3"}
              </p>
            </motion.div>

            {/* Toggle (login only) */}
            {isLogin && (
              <motion.div
                className="flex mb-7 rounded-xl overflow-hidden p-1"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <button
                  type="button"
                  onClick={() => setAuthMode(true)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-all cursor-pointer rounded-lg border-none"
                  style={isLogin ? { background: "#00F0FF", color: "#000", boxShadow: "0 0 20px rgba(0,240,255,0.25)" } : { color: "rgba(255,255,255,0.4)" }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode(false)}
                  className="flex-1 py-2.5 text-xs font-semibold transition-all cursor-pointer rounded-lg border-none"
                  style={!isLogin ? { background: "#00F0FF", color: "#000", boxShadow: "0 0 20px rgba(0,240,255,0.25)" } : { color: "rgba(255,255,255,0.4)" }}
                >
                  Sign Up
                </button>
              </motion.div>
            )}

            {/* Step indicator for signup */}
            {!isLogin && (
              <StepIndicator
                currentStep={step}
                totalSteps={totalSteps}
                labels={stepLabels}
              />
            )}

            {/* Form */}
            <form onSubmit={isLogin ? handleSubmit : step === 3 ? (e) => e.preventDefault() : step === 2 ? handleSubmit : handleNextStep} noValidate>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isLogin ? "login" : `signup-${step}`}
                  initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {/* LOGIN */}
                  {isLogin && (
                    <div>
                      <FormField label="Username or Email" name="username" value={formData.username} onChange={handleInputChange} placeholder="Enter username or email" required shake={!!authError} autoComplete="username webauthn" icon={User} />
                      {passkeySupported && (
                        <motion.button
                          type="button"
                          onClick={handlePasskeySignIn}
                          disabled={isLoading}
                          className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-[14px] px-4 py-3.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 relative overflow-hidden border-none"
                          style={{
                            background: "linear-gradient(135deg, rgba(0,240,255,0.08), rgba(0,240,255,0.02))",
                            border: "1.5px solid rgba(0,240,255,0.15)",
                            color: "#00F0FF",
                            boxShadow: "0 0 20px rgba(0,240,255,0.06)",
                          }}
                          whileHover={{ scale: 1.02, borderColor: "rgba(0,240,255,0.35)", boxShadow: "0 0 30px rgba(0,240,255,0.12)" }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Fingerprint className="w-4 h-4" /> Sign in with Passkey
                        </motion.button>
                      )}
                      <FormField label="Password" type="password" name="password" value={formData.password} onChange={handleInputChange} placeholder="Enter password" required minLength={PASSWORD_POLICY.minLength} shake={!!authError} autoComplete="current-password" icon={KeyRound} />
                    </div>
                  )}

                  {/* SIGNUP STEP 1 - Personal */}
                  {!isLogin && step === 1 && (
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="First Name" name="firstName" value={formData.firstName} onChange={handleInputChange} placeholder="First Name" required icon={User} />
                        <FormField label="Last Name" name="lastName" value={formData.lastName} onChange={handleInputChange} placeholder="Last Name" required icon={User} />
                      </div>
                      <FormField label="Email" type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Email Address" required autoComplete="email" icon={Mail} />
                      <FormField label="Phone" type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="Phone Number" required icon={Phone} />
                      <FormField label="Password" type="password" name="password" value={formData.password} onChange={handleInputChange} placeholder="Create Password" required minLength={PASSWORD_POLICY.minLength} showPasswordStrength autoComplete="new-password" icon={KeyRound} />
                    </div>
                  )}

                  {/* SIGNUP STEP 2 - Profile */}
                  {!isLogin && step === 2 && (
                    <div>
                      <div className="mb-4">
                        <label className="text-[10px] font-mono font-medium mb-2.5 block uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.35)" }}>Avatar</label>
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <motion.div
                            className="cursor-pointer rounded-xl border transition-all flex items-center justify-center aspect-square"
                            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
                            onClick={() => document.getElementById("avatar-upload")?.click()}
                            whileHover={{ borderColor: "rgba(0,240,255,0.3)", background: "rgba(0,240,255,0.04)", scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <input type="file" id="avatar-upload" accept="image/*" onChange={onFileChange} className="hidden" />
                            <Upload className="w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
                          </motion.div>
                          {avatars.map((avatar, i) => (
                            <motion.div
                              key={i}
                              onClick={() => handleAvatarSelect(avatar)}
                              className="cursor-pointer rounded-xl border transition-all aspect-square relative overflow-hidden"
                              style={formData.avatar === avatar
                                ? { borderColor: "rgba(0,240,255,0.5)", background: "rgba(0,240,255,0.08)", boxShadow: "0 0 16px rgba(0,240,255,0.2)" }
                                : { borderColor: "rgba(255,255,255,0.06)" }
                              }
                              whileHover={{ scale: 1.08, borderColor: "rgba(0,240,255,0.3)" }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <img src={avatar} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" style={{ background: "#121212" }} />
                              {formData.avatar === avatar && (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,240,255,0.2)" }}>
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#00F0FF", boxShadow: "0 0 10px rgba(0,240,255,0.5)" }}>
                                    <Check className="w-3 h-3 text-black" />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                      <FormField label="Username" name="username" value={formData.username} onChange={handleInputChange} placeholder="Unique username" required minLength={3} maxLength={30} autoComplete="username" icon={Sparkles} />
                      <FormField label="Bio" type="textarea" name="bio" value={formData.bio} onChange={handleInputChange} placeholder="About yourself..." maxLength={150} rows={2} />
                    </div>
                  )}

                  {/* SIGNUP STEP 3 - Passkey (Mandatory) */}
                  {!isLogin && step === 3 && (
                    <div className="text-center py-2">
                      <motion.div
                        className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, rgba(0,240,255,0.1), rgba(0,255,102,0.05))",
                          border: "1.5px solid rgba(0,240,255,0.25)",
                          boxShadow: "0 0 40px rgba(0,240,255,0.15)",
                        }}
                        animate={{ boxShadow: ["0 0 20px rgba(0,240,255,0.1)", "0 0 50px rgba(0,240,255,0.25)", "0 0 20px rgba(0,240,255,0.1)"] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Shield className="w-9 h-9" style={{ color: "#00F0FF" }} />
                      </motion.div>

                      <h3 className="text-lg font-bold mb-2" style={{ color: "#fff" }}>Set Up Your Passkey</h3>
                      <p className="text-sm mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Passkeys replace passwords with biometric authentication.
                        <br />Your account requires this extra layer of security.
                      </p>

                      <div className="space-y-3 mb-6">
                        {[
                          { icon: Fingerprint, text: "No passwords to remember" },
                          { icon: ShieldCheck, text: "Phishing-resistant security" },
                          { icon: Zap, text: "One-touch sign in" },
                        ].map((item, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + i * 0.1, duration: 0.4, ease: EASE }}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,240,255,0.08)", border: "1px solid rgba(0,240,255,0.15)" }}>
                              <item.icon className="w-4 h-4" style={{ color: "#00F0FF" }} />
                            </div>
                            <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>{item.text}</span>
                          </motion.div>
                        ))}
                      </div>

                      {passkeyError && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 p-3 mb-4 rounded-xl text-xs"
                          style={{ background: "rgba(255,68,102,0.06)", border: "1px solid rgba(255,68,102,0.2)", color: "#FF4466" }}
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{passkeyError}</span>
                        </motion.div>
                      )}

                      <motion.button
                        type="button"
                        onClick={handleRegisterPasskey}
                        disabled={isEnrollingPasskey}
                        className="w-full flex items-center justify-center gap-2.5 h-[52px] text-sm font-semibold transition-all cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed rounded-[14px]"
                        style={{
                          background: "linear-gradient(135deg, #00F0FF, #00C8D4)",
                          color: "#000",
                          boxShadow: "0 0 30px rgba(0,240,255,0.3), 0 4px 20px rgba(0,240,255,0.15)",
                        }}
                        whileHover={{ scale: 1.03, boxShadow: "0 0 40px rgba(0,240,255,0.4), 0 4px 25px rgba(0,240,255,0.2)" }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {isEnrollingPasskey ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /><span>Setting up...</span></>
                        ) : isSuccess ? (
                          <><ShieldCheck className="w-5 h-5" /><span>Secured!</span></>
                        ) : (
                          <><Fingerprint className="w-5 h-5" /><span>Create Passkey</span></>
                        )}
                      </motion.button>

                      <button
                        type="button"
                        onClick={handleBackToStep2}
                        className="mt-4 text-xs font-medium cursor-pointer bg-transparent border-none transition-colors hover:text-white"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        Go back
                      </button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Error (not on passkey step) */}
              <AnimatePresence>
                {authError && step !== 3 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex items-center gap-2.5 p-3.5 mt-5 rounded-[14px] text-xs"
                    style={{ background: "rgba(255,68,102,0.05)", border: "1.5px solid rgba(255,68,102,0.2)", color: "#FF4466" }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions (not on passkey step) */}
              {step !== 3 && (
                <div className="flex gap-3 mt-7">
                  {!isLogin && step === 2 && (
                    <motion.button
                      type="button"
                      onClick={handlePrevStep}
                      className="flex items-center gap-1.5 px-5 py-3.5 rounded-[14px] text-xs font-semibold transition-all cursor-pointer bg-transparent border-none shrink-0"
                      style={{ border: "1.5px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                      whileHover={{ borderColor: "rgba(255,255,255,0.15)", scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Back
                    </motion.button>
                  )}
                  <motion.button
                    type="submit"
                    disabled={isLoading || isSuccess}
                    className="flex items-center justify-center gap-2 h-[50px] text-sm font-bold transition-all cursor-pointer border-none flex-1 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden rounded-[14px]"
                    style={{
                      background: isSuccess ? "linear-gradient(135deg, #00FF66, #00CC52)" : "linear-gradient(135deg, #00F0FF, #00C8D4)",
                      color: "#000",
                      boxShadow: isSuccess
                        ? "0 0 30px rgba(0,255,102,0.4), 0 4px 20px rgba(0,255,102,0.15)"
                        : "0 0 25px rgba(0,240,255,0.3), 0 4px 15px rgba(0,240,255,0.1)",
                    }}
                    whileHover={!isLoading && !isSuccess ? { scale: 1.03, boxShadow: "0 0 35px rgba(0,240,255,0.4), 0 4px 20px rgba(0,240,255,0.15)" } : {}}
                    whileTap={!isLoading && !isSuccess ? { scale: 0.97 } : {}}
                  >
                    {isSuccess ? (
                      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5" /><span>Unlocked</span>
                      </motion.div>
                    ) : isLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /><span>Authenticating...</span></>
                    ) : (
                      <>
                        <span>{isLogin ? "Unlock" : step === 1 ? "Continue" : "Create Account"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </div>
              )}
            </form>

            {/* Footer toggle */}
            {step !== 3 && (
              <motion.div className="mt-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {isLogin ? "No account?" : "Have an account?"}
                  <button
                    type="button"
                    onClick={toggleAuthMode}
                    className="ml-1.5 font-semibold transition-colors cursor-pointer bg-transparent border-none hover:brightness-125"
                    style={{ color: "#00F0FF" }}
                  >
                    {isLogin ? "Create one" : "Sign in"}
                  </button>
                </p>
              </motion.div>
            )}
          </div>
        </GlossyCard>

        {/* Footer tagline */}
        <motion.p
          className="text-center text-[10px] font-mono tracking-[0.25em] uppercase mt-6 pointer-events-none"
          style={{ color: "rgba(255,255,255,0.15)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Your keys never leave this device
        </motion.p>
      </div>

      {/* Cropper Modal */}
      {isCropping && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(24px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-[24px] overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #131318, #0c0c12)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,240,255,0.05)",
            }}
          >
            <div className="p-4 flex justify-between items-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-sm font-bold" style={{ color: "#fff" }}>Edit Photo</h3>
              <button onClick={cancelCrop} className="transition-all cursor-pointer bg-transparent border-none p-1 rounded-lg hover:bg-white/5" style={{ color: "rgba(255,255,255,0.4)" }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative w-full h-[350px]" style={{ background: "#000" }}>
              <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
            </div>
            <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>Zoom</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: "#00F0FF", background: "rgba(255,255,255,0.06)" }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={cancelCrop}
                  className="flex-1 py-3 px-4 rounded-[14px] text-xs font-semibold transition-all cursor-pointer bg-transparent border-none"
                  style={{ border: "1.5px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={showCroppedImage}
                  className="flex-1 py-3 px-4 rounded-[14px] text-xs font-bold text-black transition-all cursor-pointer border-none"
                  style={{ background: "linear-gradient(135deg, #00F0FF, #00C8D4)", boxShadow: "0 0 20px rgba(0,240,255,0.2)" }}
                >
                  Save Photo
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default Auth
