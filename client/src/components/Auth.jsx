import { useState, useCallback, useMemo } from "react"
import { useAuth } from "../context/AuthContext"

const PasswordStrengthIndicator = ({ password }) => {
  const strength = useMemo(() => {
    if (!password) return { level: 0, text: "", color: "" }

    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    const levels = [
      { level: 0, text: "", color: "" },
      { level: 1, text: "Very Weak", color: "hsl(var(--destructive))" },
      { level: 2, text: "Weak", color: "#f97316" },
      { level: 3, text: "Fair", color: "#eab308" },
      { level: 4, text: "Good", color: "#22c55e" },
      { level: 5, text: "Strong", color: "hsl(var(--primary))" },
    ]

    return levels[score]
  }, [password])

  if (!password) return null

  return (
    <div className="mt-2 mb-2.5">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] uppercase tracking-wider font-medium text-white/70">Password Strength</span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-md" 
          style={{ 
            color: strength.color,
            backgroundColor: `${strength.color}20`,
            border: `1px solid ${strength.color}40`
          }}>
          {strength.text}
        </span>
      </div>
      <div className="h-1.5 w-full bg-gray-800/50 rounded-full overflow-hidden backdrop-blur-sm">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${(strength.level / 5) * 100}%`,
            backgroundColor: strength.color,
            boxShadow: `0 0 8px ${strength.color}80`
          }}
        />
      </div>
    </div>
  )
}

const FormField = ({
  label,
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  maxLength,
  rows,
  showPasswordStrength = false,
  icon,
  compact = false,
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isPassword = type === "password"
  const isTextarea = type === "textarea"
  const inputType = isPassword ? (showPassword ? "text" : "password") : type

  const InputComponent = isTextarea ? "textarea" : "input"

  return (
    <div className={`form-field-modern ${compact ? "mb-3" : "mb-4"}`}>
      <label htmlFor={name} className={`text-sm font-medium ${compact ? "mb-1.5" : "mb-2"}`}>
        <span className="flex items-center gap-2">
          {icon && <span className="label-icon text-purple-300 text-base">{icon}</span>}
          <span className="text-white/90">{label}</span>
          {required && <span className="text-pink-400 ml-0.5">*</span>}
        </span>
      </label>

      <div className="input-wrapper">
        <InputComponent
          type={inputType}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          rows={rows}
          className={`form-input-enhanced w-full ${isTextarea ? "min-h-[5rem]" : ""} ${isFocused ? "focused" : ""}`}
        />

        {isPassword && (
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-indigo-500 transition-all focus:outline-none focus:ring-0 border-none bg-transparent p-1.5 rounded-full hover:bg-indigo-100/10"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showPassword ? (
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      {showPasswordStrength && <PasswordStrengthIndicator password={value} />}
    </div>
  )
}

const Auth = () => {
  // Check URL for signup parameter
  const urlParams = new URLSearchParams(window.location.search);
  const shouldSignup = urlParams.get('signup') === 'true';
  
  const [isLogin, setIsLogin] = useState(!shouldSignup)
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    bio: "",
  })

  const { login, register, isLoading, error, clearError } = useAuth()

  const handleInputChange = useCallback(
    (e) => {
      const { name, value } = e.target
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }))

      if (error) {
        clearError()
      }
    },
    [error, clearError],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      if (isLogin) {
        await login({
          identifier: formData.email || formData.username,
          password: formData.password,
        })
      } else {
        await register({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          bio: formData.bio,
        })
      }
      
      // Redirect to chat after successful authentication
      window.history.pushState({}, '', '/chat')
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (error) {
      console.error("Auth error:", error)
    }
  }

  const toggleAuthMode = useCallback(() => {
    setIsLogin(!isLogin)
    setFormData({
      username: "",
      email: "",
      password: "",
      bio: "",
    })
    clearError()
  }, [isLogin, clearError])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
      <div className="absolute inset-0 bg-slate-900/80"></div>

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-indigo-500/15 to-violet-500/15 rounded-full blur-2xl animate-pulse delay-500"></div>

        <div className="absolute top-20 left-20 w-2 h-2 bg-white/30 rounded-full animate-bounce delay-300"></div>
        <div className="absolute top-40 right-32 w-1 h-1 bg-indigo-400/40 rounded-full animate-bounce delay-700"></div>
        <div className="absolute bottom-32 left-40 w-1.5 h-1.5 bg-violet-400/35 rounded-full animate-bounce delay-1000"></div>
        <div className="absolute bottom-20 right-20 w-2 h-2 bg-indigo-400/30 rounded-full animate-bounce delay-200"></div>

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl mb-4 shadow-lg shadow-indigo-500/30 transform hover:scale-105 transition-transform duration-200">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
              <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">VaaniArc</h1>
          <p className="text-gray-300 text-sm font-medium">Connect • Collaborate • Create</p>
        </div>

        <div className="form-container animate-float-in">
          <div className="text-center mb-5">
            <h2 className="form-heading text-xl font-bold mb-1">{isLogin ? "Welcome Back" : "Join VaaniArc"}</h2>
            <p className="text-gray-300 text-sm">
              {isLogin ? "Sign in to continue your journey" : "Create your account to get started"}
            </p>
          </div>

          <div className="bg-black/40 rounded-xl p-1 flex mb-6 relative backdrop-blur-sm shadow-inner">
            <div
              className="absolute top-1 bottom-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg shadow-lg transition-all duration-300 ease-out"
              style={{
                width: "50%",
                transform: `translateX(${isLogin ? "0%" : "100%"})`,
              }}
            />
            <button
              className={`flex-1 py-3 px-3 rounded-lg z-10 relative transition-all duration-300 font-semibold text-sm focus:outline-none focus:ring-0 border-none bg-transparent ${
                isLogin ? "text-white" : "text-gray-400 hover:text-gray-300"
              }`}
              onClick={() => setIsLogin(true)}
              type="button"
            >
              <span className="relative z-10">Sign In</span>
            </button>
            <button
              className={`flex-1 py-3 px-3 rounded-lg z-10 relative transition-all duration-300 font-semibold text-sm focus:outline-none focus:ring-0 border-none bg-transparent ${
                !isLogin ? "text-white" : "text-gray-400 hover:text-gray-300"
              }`}
              onClick={() => setIsLogin(false)}
              type="button"
            >
              <span className="relative z-10">Sign Up</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="Username"
                    required
                    minLength={3}
                    maxLength={30}
                    icon="👤"
                    compact={true}
                  />
                  <FormField
                    label="Email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Email"
                    required
                    icon="✉️"
                    compact={true}
                  />
                </div>
              </>
            )}

            {isLogin && (
              <FormField
                label="Email or Username"
                type="text"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email or username"
                required
                icon="✉️"
                compact={true}
              />
            )}

            <FormField
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              required
              minLength={6}
              showPasswordStrength={!isLogin}
              icon="🔒"
              compact={true}
            />

            {!isLogin && (
              <FormField
                label="Bio (Optional)"
                type="textarea"
                name="bio"
                value={formData.bio}
                onChange={handleInputChange}
                placeholder="Tell us about yourself..."
                maxLength={150}
                rows={2}
                icon="✨"
                compact={true}
              />
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 animate-float-in shadow-sm">
                <svg
                  className="w-5 h-5 flex-shrink-0 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="form-submit-button w-full mt-4 animate-shimmer group"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>{isLogin ? "Sign In" : "Create Account"}</span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-1.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12,5 19,12 12,19" />
                  </svg>
                </div>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-gray-300 text-sm">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
              <button
                type="button"
                className="ml-1.5 text-indigo-400 hover:text-indigo-300 font-medium transition-colors focus:outline-none focus:ring-0 border-none bg-transparent p-0 pb-0.5 border-b border-indigo-400/30 hover:border-indigo-400"
                onClick={toggleAuthMode}
              >
                {isLogin ? "Sign up here" : "Sign in here"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Auth
