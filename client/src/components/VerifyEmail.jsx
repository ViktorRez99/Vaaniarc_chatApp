import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import api from "../services/api"

const VerifyEmail = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState("Verifying your email...")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setFailed(true)
      setStatus("Verification link is missing a token.")
      return
    }

    let cancelled = false
    api.get(`/auth/email-verification/verify?token=${encodeURIComponent(token)}`)
      .then(() => {
        if (cancelled) return
        setStatus("Email verified.")
        window.setTimeout(() => navigate("/chat", { replace: true }), 900)
      })
      .catch((error) => {
        if (cancelled) return
        setFailed(true)
        setStatus(error.message || "Verification link is invalid or expired.")
      })

    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  return (
    <div className="min-h-screen bg-black text-white grid place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <div className={`mx-auto mb-5 h-12 w-12 rounded-2xl border ${failed ? "border-red-400/30 bg-red-400/10" : "border-cyan-300/30 bg-cyan-300/10"}`} />
        <h1 className="text-xl font-semibold">Email Verification</h1>
        <p className="mt-3 text-sm text-white/60">{status}</p>
        {failed && (
          <button
            type="button"
            onClick={() => navigate("/auth", { replace: true })}
            className="mt-6 rounded-xl border border-white/10 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}

export default VerifyEmail
