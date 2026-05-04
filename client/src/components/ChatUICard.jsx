import { useState, useEffect, useMemo, memo } from "react"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"

/* ═══════════════════════════════════════
   DATA (duplicated here to avoid main bundle bloat)
   ═══════════════════════════════════════ */
const MOCK_USERS = [
  { id: '1', name: 'Abhra', status: 'online', image: null, color: '#00F0FF' },
  { id: '2', name: 'Rudra', status: 'offline', image: null, color: '#00FF66' },
  { id: '3', name: 'Jaya', status: 'online', image: null, color: '#00F0FF' },
  { id: '4', name: 'Ankur', status: 'busy', image: null, color: '#FFB020' },
  { id: '5', name: 'Sayan', status: 'online', image: '/avatars/sayan.jpg', color: '#00F0FF' },
]

const MOCK_CHATS = [
  {
    chatId: 'c1', user: MOCK_USERS[1], unread: 2, lastMessage: 'Let us finalize the architecture.',
    messages: [
      { id: 'c1m1', from: 'Abhra', text: 'Hey Rudra, I pushed the encryption module.', time: '10:42 AM', self: true },
      { id: 'c1m2', from: 'Rudra', text: 'Nice! I will review the PR after lunch.', time: '10:44 AM', self: false },
      { id: 'c1m3', from: 'Abhra', text: 'Sounds good. Also check the key exchange flow.', time: '10:45 AM', self: true },
      { id: 'c1m4', from: 'Rudra', text: 'Let us finalize the architecture.', time: '10:48 AM', self: false },
    ],
  },
  {
    chatId: 'c2', user: MOCK_USERS[2], unread: 0, lastMessage: 'The new design looks great!',
    messages: [
      { id: 'c2m1', from: 'Jaya', text: 'Just pushed the new glassmorphism tokens to staging.', time: '2:10 PM', self: false },
      { id: 'c2m2', from: 'Abhra', text: 'Blur values are looking good. Can we bump saturation to 200%?', time: '2:12 PM', self: true },
      { id: 'c2m3', from: 'Jaya', text: 'Done! Also added the mesh gradient keyframes.', time: '2:14 PM', self: false },
      { id: 'c2m4', from: 'Abhra', text: 'The new design looks great!', time: '2:15 PM', self: true },
    ],
  },
  {
    chatId: 'c3', user: MOCK_USERS[3], unread: 1, lastMessage: 'Are we deploying today?',
    messages: [
      { id: 'c3m1', from: 'Ankur', text: 'All tests passed on the CI pipeline.', time: '4:30 PM', self: false },
      { id: 'c3m2', from: 'Abhra', text: 'Perfect. Let me merge the release branch.', time: '4:32 PM', self: true },
      { id: 'c3m3', from: 'Ankur', text: 'Are we deploying today?', time: '4:33 PM', self: false },
    ],
  },
  {
    chatId: 'c4', user: MOCK_USERS[4], unread: 0, lastMessage: 'Sad, Better luck next time',
    messages: [
      { id: 'c4m1', from: 'Sayan', text: 'Hi Abhra', time: '3:00 PM', self: false },
      { id: 'c4m2', from: 'Abhra', text: 'Hello! Buddy', time: '3:02 PM', self: true },
      { id: 'c4m3', from: 'Sayan', text: 'Ami take pelam na re onno jon niye gelo', time: '3:05 PM', self: false },
      { id: 'c4m4', from: 'Abhra', text: 'Sad, Better luck next time', time: '3:07 PM', self: true },
    ],
  }
]

const getInitials = (name) => {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
const statusColor = (s) => s === 'online' ? '#00FF66' : s === 'busy' ? '#FFB020' : '#55555E'

/* ═══════════════════════════════════════
   AVATAR (memoized)
   ═══════════════════════════════════════ */
const Avatar = memo(function Avatar({ user, isActive, size = 44 }) {
  const [err, setErr] = useState(false)
  const initials = getInitials(user.name)
  const uc = user.color
  const style = {
    width: size, height: size, minWidth: size, minHeight: size,
    borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    border: isActive ? `2.5px solid ${uc}` : '2px solid rgba(255,255,255,0.12)',
    boxShadow: isActive ? `0 0 16px ${uc}50` : '0 2px 8px rgba(0,0,0,0.3)',
    background: isActive ? `${uc}18` : 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  if (!user.image || err) return (
    <div style={style}><span className="font-bold select-none" style={{ fontSize: size * 0.42, color: isActive ? uc : 'rgba(255,255,255,0.7)', letterSpacing: '0.5px' }}>{initials}</span></div>
  )
  return (
    <div style={style}>
      <img src={user.image} alt={user.name} className="w-full h-full object-cover" loading="lazy" onError={() => setErr(true)} draggable={false} />
    </div>
  )
})

/* ═══════════════════════════════════════
   CHAT UI CARD
   ═══════════════════════════════════════ */
const ChatUICard = memo(function ChatUICard() {
  const [activeChat, setActiveChat] = useState('c2')
  
  useEffect(() => {
    const iv = setInterval(() => setActiveChat(p => {
      const idx = MOCK_CHATS.findIndex(c => c.chatId === p)
      return MOCK_CHATS[(idx + 1) % MOCK_CHATS.length].chatId
    }), 3500)
    return () => clearInterval(iv)
  }, [])
  
  const currentChat = useMemo(() => MOCK_CHATS.find(c => c.chatId === activeChat), [activeChat])

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, rotateX: 15 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-5xl mx-auto will-change-transform"
      style={{ perspective: 1200, transformStyle: 'preserve-3d' }}
    >
      <div className="rounded-[24px] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a1a1e 0%, #111114 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 0 0 1px rgba(0,240,255,0.06), 0 0 60px rgba(0, 240, 255, 0.08), 0 40px 80px -20px rgba(0, 0, 0, 0.8)',
        }}>
        {/* Title bar */}
        <div className="h-12 flex items-center px-5 gap-2.5 border-b" style={{ background: '#131316', borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#FF5F57' }} />
          <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#FFBD2E' }} />
          <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#28CA41' }} />
          <div className="flex-1 flex justify-center"><div className="w-56 h-5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }} /></div>
        </div>

        <div className="p-5 md:p-7" style={{ WebkitFontSmoothing: 'antialiased' }}>
          <div className="grid grid-cols-12 gap-4">
            {/* Sidebar */}
            <div className="col-span-4 space-y-1">
              <div className="h-8 rounded-xl mb-3 flex items-center px-4" style={{ background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.1)' }}>
                <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: '#00F0FF', letterSpacing: '0.12em' }}>Chats</span>
              </div>
              {MOCK_CHATS.map((chat) => {
                const isActive = activeChat === chat.chatId
                const uc = chat.user.color
                return (
                  <motion.div key={chat.chatId} onClick={() => setActiveChat(chat.chatId)}
                    className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer will-change-transform"
                    style={{ background: isActive ? `linear-gradient(90deg, ${uc}10 0%, transparent 100%)` : 'transparent', border: isActive ? `1px solid ${uc}25` : '1px solid transparent', transition: 'all 0.25s ease' }}
                    whileHover={{ backgroundColor: isActive ? `${uc}08` : 'rgba(255,255,255,0.03)' }} whileTap={{ scale: 0.98 }}>
                    {isActive && (
                      <motion.div layoutId="activeChatIndicator" className="absolute left-0 top-2 bottom-2 w-[4px] rounded-full"
                        style={{ background: `linear-gradient(180deg, ${uc} 0%, ${uc}80 100%)`, boxShadow: `0 0 12px ${uc}60, 0 0 4px ${uc}` }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                    )}
                    <div className="relative shrink-0">
                      <Avatar user={chat.user} isActive={isActive} size={48} />
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-[2.5px] border-[#111114]"
                        style={{ background: statusColor(chat.user.status), boxShadow: `0 0 8px ${statusColor(chat.user.status)}80` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-bold truncate" style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.85)' }}>{chat.user.name}</span>
                        <div className="flex items-center gap-1.5">
                          {chat.unread > 0 && (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold text-black shrink-0"
                              style={{ background: uc, boxShadow: `0 0 8px ${uc}50` }}>{chat.unread}</span>
                          )}
                          <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {chat.chatId === 'c1' ? '10:48' : chat.chatId === 'c2' ? '2:15p' : '4:33p'}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] truncate leading-tight" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)' }}>{chat.lastMessage}</p>
                    </div>
                  </motion.div>
                )
              })}
              {[1, 2].map((i) => (
                <div key={`skel-${i}`} className="flex items-center gap-3 px-3 py-2.5 opacity-40">
                  <div className="w-9 h-9 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', width: `${50 + i * 15}%` }} />
                    <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.025)', width: `${70 - i * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Chat area */}
            <div className="col-span-8 flex flex-col">
              {currentChat && (<>
                <div className="flex items-center gap-3 pb-3 mb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <Avatar user={currentChat.user} isActive={false} size={36} />
                  <span className="text-sm font-bold" style={{ color: '#fff' }}>{currentChat.user.name}</span>
                  <div className="w-2 h-2 rounded-full" style={{ background: statusColor(currentChat.user.status), boxShadow: `0 0 6px ${statusColor(currentChat.user.status)}` }} />
                  <span className="ml-auto text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{currentChat.messages.length} messages</span>
                </div>

                <div className="flex-1 space-y-2.5 overflow-hidden min-h-[200px]">
                  {currentChat.messages.map((msg, i) => (
                    <motion.div key={msg.id} className={`flex ${msg.self ? 'justify-end' : 'justify-start'}`}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}>
                      <div className="max-w-[82%] rounded-2xl px-4 py-2.5"
                        style={msg.self
                          ? { background: `${currentChat.user.color}10`, border: `1px solid ${currentChat.user.color}18` }
                          : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }
                        }>
                        <p className="text-[13px] font-medium leading-snug" style={{ color: msg.self ? '#fff' : 'rgba(255,255,255,0.85)' }}>{msg.text}</p>
                        <p className="text-[10px] mt-1.5 font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{msg.time}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex-1 h-3.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', width: '55%' }} />
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #00F0FF 0%, #00C8D4 100%)', boxShadow: '0 0 16px rgba(0, 240, 255, 0.35)' }}>
                    <ArrowRight className="w-4 h-4 text-black" />
                  </div>
                </div>
              </>)}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
})

export default ChatUICard
