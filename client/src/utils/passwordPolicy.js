export const PASSWORD_POLICY = {
  minLength: 10,
  maxLength: 128
}

const COMMON_PASSWORDS = new Set([
  "123456",
  "12345678",
  "123456789",
  "admin123",
  "changeme",
  "letmein",
  "password",
  "password1",
  "qwerty123",
  "welcome1",
])
const COMMON_PASSWORD_PATTERNS = ["password", "qwerty", "123456", "letmein", "changeme", "welcome"]

export const validatePassword = (password) => {
  if (!password || typeof password !== "string") {
    return { isValid: false, error: "Password is required" }
  }

  if (password.length < PASSWORD_POLICY.minLength) {
    return {
      isValid: false,
      error: `Password must be at least ${PASSWORD_POLICY.minLength} characters long`,
    }
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    return {
      isValid: false,
      error: `Password must be ${PASSWORD_POLICY.maxLength} characters or less`,
    }
  }

  const loweredPassword = password.toLowerCase()

  if (COMMON_PASSWORDS.has(loweredPassword) || COMMON_PASSWORD_PATTERNS.some((pattern) => loweredPassword.includes(pattern))) {
    return {
      isValid: false,
      error: "Password is too common. Choose a more unique password.",
    }
  }

  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: "Password must include at least one uppercase letter" }
  }

  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: "Password must include at least one lowercase letter" }
  }

  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: "Password must include at least one number" }
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return { isValid: false, error: "Password must include at least one symbol" }
  }

  return { isValid: true, error: null }
}
