import { useState, useCallback, useMemo } from "react"
import Cropper from 'react-easy-crop'
import getCroppedImg from '../utils/cropImage'
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
    <div className="mt-2 mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] uppercase tracking-wider font-medium text-white/70">Strength</span>
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
      <label htmlFor={name} className={`text-sm font-medium ${compact ? "mb-1.5" : "mb-2"} block`}>
        <span className="flex items-center gap-2">
          {icon && <span className="label-icon text-purple-300 text-base">{icon}</span>}
          <span className="text-white/90">{label}</span>
          {required && <span className="text-pink-400 ml-0.5">*</span>}
        </span>
      </label>

      <div className="input-wrapper relative">
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
          className={`form-input-enhanced w-full !text-base !py-2.5 !px-4 bg-black/20 border border-white/10 rounded-xl focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all outline-none text-white placeholder-gray-500 ${isTextarea ? "min-h-[4rem]" : "h-11"} ${isFocused ? "focused" : ""}`}
        />

        {isPassword && (
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-indigo-500 transition-all focus:outline-none focus:ring-0 border-none bg-transparent p-1.5 rounded-full hover:bg-indigo-100/10"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
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
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    avatar: "",
    bio: "",
  })

  const { login, register, isLoading, error, clearError } = useAuth()

  // Image cropping state
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isCropping, setIsCropping] = useState(false)

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const readFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(reader.result), false)
      reader.readAsDataURL(file)
    })
  }

  const onFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      let imageDataUrl = await readFile(file)
      setImageSrc(imageDataUrl)
      setIsCropping(true)
    }
  }

  const showCroppedImage = async () => {
    try {
      const croppedImage = await getCroppedImg(
        imageSrc,
        croppedAreaPixels
      )
      setFormData(prev => ({ ...prev, avatar: croppedImage }))
      setIsCropping(false)
      setImageSrc(null)
    } catch (e) {
      console.error(e)
    }
  }

  const cancelCrop = () => {
    setIsCropping(false)
    setImageSrc(null)
  }

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

  const handleAvatarSelect = (avatarUrl) => {
    setFormData(prev => ({ ...prev, avatar: avatarUrl }))
  }

  const handleNextStep = (e) => {
    e.preventDefault()
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || !formData.password) {
        return;
    }
    setStep(2)
    clearError()
  }

  const handlePrevStep = () => {
    setStep(1)
    clearError()
  }

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
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          avatar: formData.avatar,
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
    setStep(1)
    setFormData({
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      avatar: "",
      bio: "",
    })
    clearError()
  }, [isLogin, clearError])

  const avatars = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Zack",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Molly",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Garfield",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  ]

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

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl mb-3 shadow-lg shadow-indigo-500/30 transform hover:scale-105 transition-transform duration-200">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
              <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">VaaniArc</h1>
          <p className="text-gray-300 text-sm font-medium">Connect • Collaborate • Create</p>
        </div>

        <div className="form-container animate-float-in p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl">
          <div className="text-center mb-5">
            <h2 className="form-heading text-xl font-bold mb-1 text-white">{isLogin ? "Welcome Back" : "Join VaaniArc"}</h2>
            <p className="text-gray-400 text-sm">
              {isLogin ? "Sign in to continue" : (step === 1 ? "Step 1: Personal Details" : "Step 2: Profile Setup")}
            </p>
          </div>

          <div className="bg-black/40 rounded-xl p-1 flex mb-5 relative backdrop-blur-sm shadow-inner">
            <div
              className="absolute top-1 bottom-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg shadow-lg transition-all duration-300 ease-out"
              style={{
                width: "50%",
                transform: `translateX(${isLogin ? "0%" : "100%"})`,
              }}
            />
            <button
              className={`flex-1 py-2.5 px-3 rounded-lg z-10 relative transition-all duration-300 font-semibold text-sm focus:outline-none focus:ring-0 border-none bg-transparent ${
                isLogin ? "text-white" : "text-gray-400 hover:text-gray-300"
              }`}
              onClick={() => setIsLogin(true)}
              type="button"
            >
              <span className="relative z-10">Sign In</span>
            </button>
            <button
              className={`flex-1 py-2.5 px-3 rounded-lg z-10 relative transition-all duration-300 font-semibold text-sm focus:outline-none focus:ring-0 border-none bg-transparent ${
                !isLogin ? "text-white" : "text-gray-400 hover:text-gray-300"
              }`}
              onClick={() => setIsLogin(false)}
              type="button"
            >
              <span className="relative z-10">Sign Up</span>
            </button>
          </div>

          <form onSubmit={isLogin ? handleSubmit : (step === 1 ? handleNextStep : handleSubmit)} className="space-y-3">
            
            {/* Login Form */}
            {isLogin && (
              <>
                <FormField
                  label="Email or Username"
                  type="text"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Email or username"
                  required
                  icon="✉️"
                  compact={true}
                />
                <FormField
                  label="Password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Password"
                  required
                  minLength={6}
                  showPasswordStrength={false}
                  icon="🔒"
                  compact={true}
                />
              </>
            )}

            {/* Signup Step 1 */}
            {!isLogin && step === 1 && (
              <div className="animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="First Name"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="First Name"
                    required
                    icon="👤"
                    compact={true}
                  />
                  <FormField
                    label="Last Name"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Last Name"
                    required
                    icon="👤"
                    compact={true}
                  />
                </div>
                <FormField
                  label="Email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Email Address"
                  required
                  icon="✉️"
                  compact={true}
                />
                <FormField
                  label="Phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="Phone Number"
                  required
                  icon="📱"
                  compact={true}
                />
                <FormField
                  label="Password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Create Password"
                  required
                  minLength={6}
                  showPasswordStrength={true}
                  icon="🔒"
                  compact={true}
                />
              </div>
            )}

            {/* Signup Step 2 */}
            {!isLogin && step === 2 && (
              <div className="animate-fade-in">
                <div className="mb-4">
                  <label className="text-sm font-medium text-white/90 mb-2 block flex items-center gap-2">
                    <span className="text-purple-300 text-base">🎨</span>
                    Choose an Avatar
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div 
                      className="cursor-pointer rounded-xl p-1 border border-white/10 hover:border-indigo-300/50 hover:bg-white/5 transition-all duration-200 flex flex-col items-center justify-center gap-1 group relative overflow-hidden aspect-square"
                      onClick={() => document.getElementById('avatar-upload').click()}
                    >
                      <input
                        type="file"
                        id="avatar-upload"
                        accept="image/*"
                        onChange={onFileChange}
                        className="hidden"
                      />
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                        <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">Upload</span>
                    </div>
                    {avatars.map((avatar, index) => (
                      <div 
                        key={index}
                        onClick={() => handleAvatarSelect(avatar)}
                        className={`cursor-pointer rounded-xl p-1 border-2 transition-all duration-200 relative overflow-hidden group aspect-square ${
                          formData.avatar === avatar 
                            ? 'border-indigo-500 bg-indigo-500/20 scale-105 shadow-lg shadow-indigo-500/20' 
                            : 'border-white/10 hover:border-indigo-300/50 hover:bg-white/5'
                        }`}
                      >
                        <img 
                          src={avatar} 
                          alt={`Avatar ${index + 1}`} 
                          className="w-full h-full rounded-lg bg-slate-800/50 object-cover" 
                        />
                        {formData.avatar === avatar && (
                          <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/20 backdrop-blur-[1px] rounded-lg">
                            <div className="bg-indigo-500 rounded-full p-1">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <FormField
                  label="Username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Unique username"
                  required
                  minLength={3}
                  maxLength={30}
                  icon="🏷️"
                  compact={true}
                />
                
                <FormField
                  label="Bio (Optional)"
                  type="textarea"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="About yourself..."
                  maxLength={150}
                  rows={2}
                  icon="✨"
                  compact={true}
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 animate-float-in shadow-sm mt-3">
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

            <div className="flex gap-3 mt-5">
              {!isLogin && step === 2 && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="w-1/3 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  Back
                </button>
              )}
              
              <button
                type="submit"
                className={`form-submit-button flex-1 !py-3 !mt-0 animate-shimmer group rounded-xl text-sm font-semibold ${!isLogin && step === 2 ? 'w-2/3' : 'w-full'}`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>{isLogin ? "Sign In" : (step === 1 ? "Next Step" : "Create Account")}</span>
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
            </div>
          </form>

          <div className="mt-5 text-center">
            <p className="text-gray-400 text-sm">
              {isLogin ? "No account?" : "Have an account?"}
              <button
                type="button"
                className="ml-1.5 text-indigo-400 hover:text-indigo-300 font-medium transition-colors focus:outline-none focus:ring-0 border-none bg-transparent p-0 pb-0.5 border-b border-indigo-400/30 hover:border-indigo-400"
                onClick={toggleAuthMode}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>

      {isCropping && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900 z-10">
              <h3 className="text-white font-semibold">Edit Photo</h3>
              <button
                onClick={cancelCrop}
                className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative w-full h-[350px] bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900 z-10">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-xs text-gray-400 font-medium min-w-[30px]">Zoom</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(e.target.value)}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={cancelCrop}
                  className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={showCroppedImage}
                  className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
                >
                  Save Photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Auth
