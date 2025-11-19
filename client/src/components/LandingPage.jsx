import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const LandingPage = () => {
  const { login, isAuthenticated, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Add state for mobile sidebar toggle

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-rotate through features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDemo = async () => {
    try {
      await login({
        identifier: "demo",
        password: "demopassword",
      });
      // Redirect will be handled by the useEffect in App.jsx after login success
    } catch (error) {
      console.error("Demo login failed:", error);
      // If demo login fails, redirect to auth page
      window.history.pushState({}, '', '/auth');
    }
  };

  const features = [
    {
      title: "Real-Time Messaging",
      description: "Connect instantly with team members. Send messages, reactions, and more with zero lag.",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 10.5H16M8 14.5H13M7 3.33782C8.47087 2.48697 10.1786 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 10.1786 2.48697 8.47087 3.33782 7" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: "Video Conferencing",
      description: "Face-to-face meetings with HD quality. Schedule or join instantly with a simple click.",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 10L19.5528 7.72361C19.8343 7.58281 20.1852 7.64566 20.4021 7.8626C20.619 8.07955 20.6819 8.43045 20.5411 8.71197L18 13.5L20.5411 18.288C20.6819 18.5696 20.619 18.9204 20.4021 19.1374C20.1852 19.3543 19.8343 19.4172 19.5528 19.2764L15 17M2 18C2 19.1046 2.89543 20 4 20H14C15.1046 20 16 19.1046 16 18V6C16 4.89543 15.1046 4 14 4H4C2.89543 4 2 4.89543 2 6V18Z" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: "Smart Organization",
      description: "Channels, threads, and AI-powered organization keeps your conversations structured.",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 11L6 7M6 7L10 11M6 7V17M14 17L18 21M18 21L22 17M18 21V11M14 3H17.2C17.6774 3 17.9162 3 18.1216 3.08376C18.3043 3.15751 18.4635 3.28676 18.5769 3.45657C18.7045 3.64748 18.7561 3.88949 18.8592 4.37351L19.1408 5.62649C19.2439 6.11051 19.2955 6.35252 19.4231 6.54343C19.5365 6.71324 19.6957 6.84249 19.8784 6.91624C20.0838 7 20.3226 7 20.8 7H22M14 21H17.2C17.6774 21 17.9162 21 18.1216 20.9162C18.3043 20.8425 18.4635 20.7132 18.5769 20.5434C18.7045 20.3525 18.7561 20.1105 18.8592 19.6265L19.1408 18.3735C19.2439 17.8895 19.2955 17.6475 19.4231 17.4566C19.5365 17.2868 19.6957 17.1575 19.8784 17.0838C20.0838 17 20.3226 17 20.8 17H22M2 17H6M2 7H6" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: "Secure Communications",
      description: "End-to-end encryption and advanced security measures keep your data private.",
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14.5V16.5M7 10.0288C7.47142 10 8.05259 10 8.8 10H15.2C15.9474 10 16.5286 10 17 10.0288M7 10.0288C6.41168 10.0647 5.99429 10.1455 5.63803 10.327C5.07354 10.6146 4.6146 11.0735 4.32698 11.638C4 12.2798 4 13.1198 4 14.8V16.2C4 17.8802 4 18.7202 4.32698 19.362C4.6146 19.9265 5.07354 20.3854 5.63803 20.673C6.27976 21 7.11984 21 8.8 21H15.2C16.8802 21 17.7202 21 18.362 20.673C18.9265 20.3854 19.3854 19.9265 19.673 19.362C20 18.7202 20 17.8802 20 16.2V14.8C20 13.1198 20 12.2798 19.673 11.638C19.3854 11.0735 18.9265 10.6146 18.362 10.327C18.0057 10.1455 17.5883 10.0647 17 10.0288M7 10.0288V8C7 5.23858 9.23858 3 12 3C14.7614 3 17 5.23858 17 8V10.0288" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  const testimonials = [
    {
      quote: "VaaniArc has revolutionized how our team communicates. It's intuitive, fast, and has all the features we need.",
      name: "Rudrashis Das",
      position: "Lead Developer",
    },
    {
      quote: "The seamless integration with our existing tools made adopting VaaniArc a no-brainer. Our productivity has increased by 35%.",
      name: "Jaya Mondal",
      position: "Frontend Developer",
    },
    {
      quote: "I've tried many communication platforms, but VaaniArc's user experience and reliability are unmatched in the industry.",
      name: "Bikram Debnath",
      position: "Backend Developer",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 text-white overflow-x-hidden">
      {/* Mobile Sidebar - Toggleable */}
      <div className={`fixed left-0 top-0 w-64 h-full bg-gradient-to-b from-slate-900/95 to-slate-900/80 backdrop-blur-md border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          {/* Logo */}
          <div className="flex items-center space-x-2 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center animate-shimmer">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <circle cx="9" cy="10" r="1" fill="currentColor" />
                <circle cx="15" cy="10" r="1" fill="currentColor" />
                <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">VaaniArc</span>
          </div>

          {/* Intro Badge */}
          <div className="inline-block mb-6 py-1 px-3 bg-indigo-500/10 backdrop-blur-sm rounded-full border border-indigo-500/20 animate-fade-in">
            <span className="text-xs font-semibold tracking-wider text-indigo-300">🚀 INTRODUCING VAANIARC 2.0</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 mb-8">
            <a 
              href="#features" 
              className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/20 transition-all duration-300 text-white/80 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Features</span>
            </a>
            <a 
              href="#testimonials" 
              className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-indigo-500/20 transition-all duration-300 text-white/80 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Testimonials</span>
            </a>
          </nav>

          {/* Auth Buttons - Side by side blue buttons */}
          <div className="flex gap-2 pt-4 border-t border-white/10">
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/auth');
                window.dispatchEvent(new PopStateEvent('popstate'));
                setMobileMenuOpen(false);
              }} 
              className="flex-1 px-3 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors border border-blue-500/30"
            >
              Log In
            </button>
            <button 
              onClick={() => {
                window.history.pushState({}, '', '/auth?signup=true');
                window.dispatchEvent(new PopStateEvent('popstate'));
                setMobileMenuOpen(false);
              }} 
              className="flex-1 px-3 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors border border-blue-500/30"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Overlay - Mobile only */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Desktop Header */}
      <header 
        className={`md:flex hidden fixed top-0 w-full z-50 transition-all duration-300 ${
          isScrolled ? "bg-slate-900/90 backdrop-blur-lg shadow-lg" : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center animate-shimmer">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <circle cx="9" cy="10" r="1" fill="currentColor" />
                  <circle cx="15" cy="10" r="1" fill="currentColor" />
                  <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">VaaniArc</span>
            </div>
            
            <nav className="flex items-center space-x-8">
              <a href="#features" className="text-white/80 hover:text-white transition-colors hover:scale-105 transform">Features</a>
              <a href="#testimonials" className="text-white/80 hover:text-white transition-colors hover:scale-105 transform">Testimonials</a>
            </nav>

            <div className="flex items-center space-x-4">
              <button 
                onClick={() => {
                  window.history.pushState({}, '', '/auth');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }} 
                className="px-4 py-2 text-sm font-medium text-white hover:text-white/90 transition-colors border border-transparent hover:border-indigo-500/30 rounded-lg hover:bg-indigo-600/10"
              >
                Log In
              </button>
              <button 
                onClick={() => {
                  window.history.pushState({}, '', '/auth?signup=true');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }} 
                className="px-4 py-2 text-sm font-medium bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all transform hover:-translate-y-0.5"
              >
                Sign Up
              </button>
              {isAuthenticated && (
                <>
                  <button 
                    onClick={() => {
                      window.history.pushState({}, '', '/chat');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }} 
                    className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all"
                  >
                    Go to Chats
                  </button>
                  <button 
                    onClick={logout} 
                    className="px-4 py-2 text-sm font-medium text-white hover:text-white/90 transition-colors"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-lg border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <button 
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center animate-shimmer">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <circle cx="9" cy="10" r="1" fill="currentColor" />
                <circle cx="15" cy="10" r="1" fill="currentColor" />
                <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">VaaniArc</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${mobileMenuOpen ? 'md:ml-0 ml-0' : 'ml-0'}`}>
        {/* Hero Section */}
        <section className="pt-24 md:pt-32 pb-20 px-4 sm:px-6 overflow-hidden relative">
          <div className="container mx-auto relative">
            {/* Background elements */}
            <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute top-20 right-10 w-20 h-20 bg-violet-400/20 rounded-full blur-xl animate-pulse"></div>
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl animate-pulse"></div>
            
            {/* Stars/particles animation */}
            <div className="absolute inset-0 overflow-hidden opacity-30">
              {[...Array(20)].map((_, i) => (
                <div 
                  key={i}
                  className="absolute w-1 h-1 bg-white rounded-full animate-ping"
                  style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 4}s`,
                    animationDuration: `${2 + Math.random() * 4}s`
                  }}
                ></div>
              ))}
            </div>

            <div className="max-w-4xl mx-auto text-center relative z-10">
              {/* Intro Badge - Desktop only or adjust */}
              <div className="hidden md:inline-block mb-4 py-1 px-3 bg-indigo-500/10 backdrop-blur-sm rounded-full border border-indigo-500/20 animate-fade-in">
                <span className="text-xs font-semibold tracking-wider text-indigo-300">🚀 INTRODUCING VAANIARC 2.0</span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-indigo-200 to-violet-100 bg-clip-text text-transparent animate-slide-up drop-shadow-lg">
                Welcome to VaaniArc!
              </h1>
              <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto animate-slide-up leading-relaxed" style={{ animationDelay: '0.2s' }}>
                Select a room to start chatting with the community and connect with others in real-time conversations.
              </p>
              <div className="flex flex-wrap justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
                <button 
                  onClick={() => {
                    window.history.pushState({}, '', '/auth?signup=true');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }} 
                  className="px-8 sm:px-10 py-4 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg font-medium hover:shadow-lg hover:shadow-violet-500/30 transition-all transform hover:-translate-y-1 relative group overflow-hidden"
                >
                  <span className="relative z-10 flex items-center">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Start Chatting
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-700 to-violet-800 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                </button>
                <button 
                  onClick={handleDemo}
                  className="px-8 sm:px-10 py-4 bg-white/10 backdrop-blur-sm border border-indigo-500/30 rounded-lg font-medium hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all relative group overflow-hidden"
                >
                  <span className="relative z-10 flex items-center">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 5.2C5 4.07989 5 3.51984 5.21799 3.09202C5.40973 2.71569 5.71569 2.40973 6.09202 2.21799C6.51984 2 7.07989 2 8.2 2H15.8C16.9201 2 17.4802 2 17.908 2.21799C18.2843 2.40973 18.5903 2.71569 18.782 3.09202C19 3.51984 19 4.07989 19 5.2V18.8C19 19.9201 19 20.4802 18.782 20.908C18.5903 21.2843 18.2843 21.5903 17.908 21.782C17.4802 22 16.9201 22 15.8 22H8.2C7.07989 22 6.51984 22 6.09202 21.782C5.71569 21.5903 5.40973 21.2843 5.21799 20.908C5 20.4802 5 19.9201 5 18.8V5.2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 18H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 11H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 11V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 7H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Try Demo
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-violet-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></span>
                </button>
              </div>
            </div>

            {/* Dashboard Preview */}
            <div className="max-w-6xl mx-auto mt-16 sm:mt-20 relative animate-float-in" style={{ animationDelay: '0.6s' }}>
              {/* Decorative elements */}
              <div className="absolute -top-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl animate-pulse"></div>
              
              {/* Dashboard Preview */}
              <div className="rounded-2xl shadow-2xl shadow-black/30 border border-white/10 overflow-hidden backdrop-blur-sm relative z-10 transform hover:scale-[1.01] transition-all duration-700 hover:shadow-purple-500/10">
                <div className="h-8 bg-slate-800/70 border-b border-white/10 flex items-center px-4 gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <div className="w-40 mx-auto h-5 rounded-md bg-slate-700/50"></div>
                </div>
                <div className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent z-10"></div>
                  <div className="bg-gradient-to-r from-indigo-900/30 to-violet-900/30 p-6 flex flex-col items-center justify-center min-h-[300px]">
                    <div className="flex items-center justify-center mb-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          <circle cx="9" cy="10" r="1" fill="currentColor" />
                          <circle cx="15" cy="10" r="1" fill="currentColor" />
                          <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">VaaniArc Dashboard</h3>
                    <p className="text-white/70 text-center max-w-md">Experience real-time messaging with a beautiful and intuitive interface.</p>
                    <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-lg">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-16 bg-white/10 rounded-lg animate-pulse" style={{animationDelay: `${i * 0.1}s`}}></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-900/0 via-slate-900 to-slate-900/0 overflow-hidden">
          <div className="container mx-auto relative">
            {/* Background decorative elements */}
            <div className="absolute top-40 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-10 -left-40 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl animate-pulse"></div>
            
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-block mb-3 py-1 px-3 bg-indigo-500/10 backdrop-blur-sm rounded-full border border-indigo-500/20">
                <span className="text-xs font-semibold tracking-wider text-indigo-300">POWERFUL TOOLS</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  Designed for Modern Teams
                </span>
              </h2>
              <p className="text-lg text-white/70">
                Powerful features that adapt to how your team works, not the other way around.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center max-w-full">
              {/* Feature Selector - Add responsive padding */}
              <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-white/10 shadow-xl relative overflow-hidden w-full mx-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-2xl"></div>
                <div className="relative z-10 space-y-3 sm:space-y-4">
                  {features.map((feature, index) => (
                    <div 
                      key={index}
                      onClick={() => setActiveFeature(index)}
                      className={`flex items-start space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-xl cursor-pointer transition-all duration-300 ${
                        activeFeature === index 
                          ? "bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-white/10 shadow-md" 
                          : "hover:bg-white/5 hover:border hover:border-white/5"
                      }`}
                    >
                      <div className={`p-2.5 sm:p-3 rounded-lg transition-all duration-300 ${
                        activeFeature === index 
                          ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30" 
                          : "bg-slate-700/70 text-white/70"
                      }`}>
                        {feature.icon}
                      </div>
                      <div>
                        <h3 className={`font-semibold text-base sm:text-lg mb-1 transition-colors duration-300 ${
                          activeFeature === index ? "text-white" : "text-white/80"
                        }`}>
                          {feature.title}
                        </h3>
                        <p className={`text-sm sm:text-base transition-colors duration-300 ${
                          activeFeature === index ? "text-white/80" : "text-white/60"
                        }`}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature Visual - Responsive aspect and padding */}
              <div className="bg-slate-800/30 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 shadow-xl flex items-center justify-center relative transform hover:scale-[1.02] transition-all duration-500 w-full max-w-full mx-auto p-6">
                {/* Fixed content for each feature with better visual appearance */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-violet-600/10"></div>
                
                <div className="relative z-10 text-center max-w-md mx-auto">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl mb-6 shadow-lg shadow-indigo-500/20">
                    <div className="w-10 h-10 text-white">
                      {features[activeFeature].icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{features[activeFeature].title}</h3>
                  <p className="text-white/80 max-w-md mx-auto text-base mb-8">
                    {features[activeFeature].description}
                  </p>
                  
                  {/* Feature-specific visualization - No SVG icons to avoid duplication */}
                  <div className="border-t border-white/10 pt-6 mt-6">
                    {activeFeature === 0 && (
                      <div className="flex items-center justify-center space-x-2">
                        <div className="px-3 py-2 bg-indigo-500/20 rounded-full text-white/80 text-sm animate-pulse">
                          Hello! 👋
                        </div>
                        <div className="px-3 py-2 bg-violet-500/20 rounded-full text-white/80 text-sm animate-pulse" style={{animationDelay: '0.5s'}}>
                          Hi there!
                        </div>
                      </div>
                    )}
                    {activeFeature === 1 && (
                      <div className="w-40 h-24 mx-auto rounded-lg bg-gradient-to-r from-indigo-600/20 to-violet-600/20 flex items-center justify-center border border-white/10">
                        <div className="text-white/60 text-xs">Video call preview</div>
                      </div>
                    )}
                    {activeFeature === 2 && (
                      <div className="flex flex-col items-center space-y-2">
                        <div className="w-48 h-6 bg-indigo-500/20 rounded-md border border-indigo-500/40 mb-1"></div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-4 w-20 bg-white/10 rounded-md"></div>
                          <div className="h-4 w-20 bg-white/10 rounded-md"></div>
                        </div>
                      </div>
                    )}
                    {activeFeature === 3 && (
                      <div className="flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                          <div className="w-5 h-5 bg-indigo-500/40 rounded-full"></div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6 inline-block">
                    <button className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors flex items-center">
                      <span>Learn more</span>
                      <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section id="testimonials" className="py-20 px-6">
          <div className="container mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  Loved by Teams Everywhere
                </span>
              </h2>
              <p className="text-lg text-white/70">
                Discover why organizations choose VaaniArc for their communication needs.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-b from-white/5 to-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl"
                >
                  <svg className="w-12 h-12 text-indigo-400 mb-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                  <p className="text-white/80 mb-6">{testimonial.quote}</p>
                  <div className="flex items-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 mr-4"></div>
                    <div>
                      <h4 className="font-semibold">{testimonial.name}</h4>
                      <p className="text-sm text-white/60">{testimonial.position}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 px-4 border-t border-white/10">
          <div className="container mx-auto">          
            <div className="flex flex-row justify-between items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <circle cx="9" cy="10" r="1" fill="currentColor" />
                    <circle cx="15" cy="10" r="1" fill="currentColor" />
                    <path d="M9 14s1.5 2 3 2 3-2 3-2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="font-bold tracking-tight">VaaniArc</span>
              </div>
              
              <div className="flex items-center space-x-3">
                <a href="https://github.com" className="text-white/60 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
                <p className="text-white/80 text-xs">&copy; 2025 VaaniArc. Made by <a href="https://abhra.me" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">Abhra</a></p>
              </div>
            </div>
          </div>
        </footer>

        {/* Demo Modal */}
        {showDemoModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-white/10 relative">
              <button 
                onClick={() => setShowDemoModal(false)}
                className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
              <h3 className="text-2xl font-bold mb-4">Access Demo Account</h3>
              <p className="mb-6">Try out VaaniArc with our demo account to experience all premium features.</p>
              <button 
                onClick={handleDemo}
                className="w-full py-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg hover:shadow-lg hover:shadow-violet-500/30 transition-all"
              >
                Log in to Demo
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LandingPage;
