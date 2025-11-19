import { useState } from "react"
import { useSocket } from "../context/SocketContext"

const NotificationCenter = () => {
  const { notifications, unreadCounts } = useSocket()
  const [showNotifications, setShowNotifications] = useState(false)

  const totalUnread = Array.from(unreadCounts.values()).reduce((sum, count) => sum + count, 0)

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) {
      return "just now"
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const clearAllNotifications = () => {
    setShowNotifications(false)
  }

  return (
    <div className="relative">
      <button
        className={`relative p-3 rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/10 shadow-lg ${
          totalUnread > 0
            ? "bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-400 hover:from-indigo-500/30 hover:to-violet-500/30 hover:text-indigo-300 border-indigo-400/30"
            : "bg-slate-800/70 text-gray-400 hover:bg-slate-700/80 hover:text-gray-300"
        }`}
        onClick={() => setShowNotifications(!showNotifications)}
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-5 5v-5zM11 19H7a2 2 0 01-2-2V7a2 2 0 012-2h4m0 14v-5a2 2 0 012-2h5V7a2 2 0 00-2-2h-5m0 0V3a2 2 0 00-2-2H7a2 2 0 00-2 2v2"
          />
        </svg>

        {totalUnread > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[20px] h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 shadow-lg animate-pulse">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {showNotifications && (
        <div
          className="absolute right-0 top-full mt-3 w-80 bg-gradient-to-br from-slate-900/98 via-slate-800/96 to-slate-900/98 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-2xl z-50 animate-fade-in-scale overflow-hidden"
          style={{ backdropFilter: "blur(32px)" }}
        >
          {/* Enhanced gradient accent */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/8 via-violet-500/5 to-indigo-600/8 pointer-events-none rounded-2xl"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent"></div>

          <div className="relative z-10">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white">Notifications</h3>
                {totalUnread > 0 && (
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-400/30">
                    {totalUnread} new
                  </span>
                )}
              </div>

              <button
                className="w-8 h-8 rounded-xl bg-slate-800/70 hover:bg-red-500/20 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all duration-200 border border-white/10"
                onClick={clearAllNotifications}
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-700/50 to-slate-600/50 rounded-2xl flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                  </div>
                  <h4 className="text-white font-semibold mb-2">All caught up!</h4>
                  <p className="text-gray-400 text-sm">No new notifications to show</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-4 mb-2 bg-gradient-to-r from-slate-800/50 to-slate-700/50 hover:from-slate-800/70 hover:to-slate-700/70 rounded-xl border border-white/10 hover:border-indigo-400/30 transition-all duration-200 group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                            />
                          </svg>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white text-sm mb-1 group-hover:text-indigo-200 transition-colors">
                            {notification.title}
                          </div>
                          <div className="text-gray-300 text-sm mb-2 line-clamp-2">{notification.body}</div>
                          <div className="text-xs text-gray-400 font-medium">{formatTime(notification.timestamp)}</div>
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-4 border-t border-white/10 bg-gradient-to-r from-slate-800/30 to-slate-700/30">
                <div className="flex items-center justify-between">
                  <small className="text-gray-400 font-medium">
                    {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                  </small>
                  <button className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                    Mark all as read
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationCenter
