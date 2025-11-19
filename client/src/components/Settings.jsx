function App() {
  const { useState, useRef } = React;
  const [activeSection, setActiveSection] = useState("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Separate state for original data and form data
  const [savedData, setSavedData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    email: 'john.doe@example.com',
    bio: 'Software developer passionate about building great user experiences.',
    phone: '+1 234 567 8900',
    location: 'San Francisco, CA'
  });

  const [formData, setFormData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    email: 'john.doe@example.com',
    bio: 'Software developer passionate about building great user experiences.',
    phone: '+1 234 567 8900',
    location: 'San Francisco, CA'
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notifications, setNotifications] = useState({
    push: true,
    email: true,
    messages: true,
    meetings: false
  });
  const [theme, setTheme] = useState('system');
  const [fontType, setFontType] = useState('inter');
  const [fontSize, setFontSize] = useState(16);
  const fileInputRef = useRef(null);

  // Privacy & Security States
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSessionsExpanded, setShowSessionsExpanded] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Mock active sessions data
  const [activeSessions, setActiveSessions] = useState([
    { id: 1, device: 'Chrome on Windows', location: 'San Francisco, CA', lastActive: '2 minutes ago', current: true },
    { id: 2, device: 'Safari on iPhone', location: 'San Francisco, CA', lastActive: '1 hour ago', current: false },
    { id: 3, device: 'Firefox on MacBook', location: 'New York, NY', lastActive: '2 days ago', current: false }
  ]);

  // Cartoonish avatar options
  const avatarOptions = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack'
  ];

  const getFontFamily = () => {
    switch(fontType) {
      case 'roboto':
        return 'Roboto, system-ui, sans-serif';
      case 'poppins':
        return 'Poppins, system-ui, sans-serif';
      case 'inter':
      default:
        return 'Inter, system-ui, sans-serif';
    }
  };

  const getInitials = (firstName, lastName) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    return "U";
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result);
        setShowAvatarModal(false);
        setSuccess('Avatar uploaded successfully!');
        setTimeout(() => setSuccess(''), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectAvatar = (url) => {
    setAvatarUrl(url);
    setShowAvatarModal(false);
    setSuccess('Avatar selected successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    setShowAvatarModal(false);
    setSuccess('Avatar removed successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSaveProfile = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required!');
      return;
    }
    if (!formData.username.trim()) {
      setError('Username is required!');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Valid email is required!');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    setTimeout(() => {
      setSavedData({...formData});
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      setSaving(false);
    }, 1000);
  };

  const handleCancelEdit = () => {
    setFormData({...savedData});
    setIsEditing(false);
    setError('');
  };

  const handleEditClick = () => {
    setFormData({...savedData});
    setIsEditing(true);
  };

  const toggleNotification = (key) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleToggle2FA = () => {
    setTwoFactorEnabled(!twoFactorEnabled);
    setSuccess(twoFactorEnabled ? 'Two-Factor Authentication disabled!' : 'Two-Factor Authentication enabled!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleChangePassword = () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setError('All password fields are required!');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match!');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setError('Password must be at least 8 characters!');
      return;
    }

    setError('');
    setTimeout(() => {
      setSuccess('Password changed successfully!');
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(''), 3000);
    }, 1000);
  };

  const handleRevokeSession = (sessionId) => {
    setActiveSessions(activeSessions.filter(s => s.id !== sessionId));
    setSuccess('Session revoked successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const renderProfileSection = () => (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-20 rounded-xl p-4 flex items-center justify-between animate-pulse">
          <p className="text-red-400 text-sm font-bold">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-500 bg-opacity-10 border border-green-500 border-opacity-20 rounded-xl p-4 flex items-center justify-between animate-pulse">
          <p className="text-green-400 text-sm font-bold">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 border-opacity-50">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-2xl object-cover shadow-xl" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl">
                {getInitials(savedData.firstName, savedData.lastName)}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-3 border-slate-800 bg-green-400 shadow-lg"></div>
            <button 
              onClick={() => setShowAvatarModal(true)}
              className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-110"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{savedData.firstName} {savedData.lastName}</h2>
            <p className="text-sm font-semibold text-slate-400">@{savedData.username}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400"></span>
              <span className="text-xs text-green-400 font-bold">Active now</span>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-slate-300 block mb-2">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="Enter first name"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-300 block mb-2">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="Enter last name"
                  style={{ color: '#000000' }}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-slate-300 block mb-2">
                Username <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 font-bold">@</span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s/g, '')})}
                  className="w-full pl-8 pr-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  placeholder="username"
                  style={{ color: '#000000' }}
                />
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-1">Username must be unique and contain no spaces</p>
            </div>
            <div>
              <label className="text-sm font-bold text-slate-300 block mb-2">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="your.email@example.com"
                style={{ color: '#000000' }}
              />
              <p className="text-xs text-slate-400 font-semibold mt-1">Email must be unique</p>
            </div>
            <div>
              <label className="text-sm font-bold text-slate-300 block mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="+1 234 567 8900"
                style={{ color: '#000000' }}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-300 block mb-2">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="City, Country"
                style={{ color: '#000000' }}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-300 block mb-2">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
                rows={4}
                maxLength={200}
                className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-all"
                placeholder="Tell us about yourself..."
                style={{ color: '#000000' }}
              />
              <p className="text-xs text-slate-400 font-semibold mt-1 text-right">{formData.bio.length}/200 characters</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg shadow-indigo-500 shadow-opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-slate-700 bg-opacity-30 border border-slate-600 border-opacity-30">
                <div className="text-xs text-slate-400 mb-1 font-bold">Email</div>
                <div className="text-sm text-white font-semibold break-all">{savedData.email}</div>
              </div>
              <div className="p-4 rounded-lg bg-slate-700 bg-opacity-30 border border-slate-600 border-opacity-30">
                <div className="text-xs text-slate-400 mb-1 font-bold">Phone</div>
                <div className="text-sm text-white font-semibold">{savedData.phone || 'Not set'}</div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-700 bg-opacity-30 border border-slate-600 border-opacity-30">
              <div className="text-xs text-slate-400 mb-1 font-bold">Location</div>
              <div className="text-sm text-white font-semibold">{savedData.location || 'Not set'}</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-700 bg-opacity-30 border border-slate-600 border-opacity-30">
              <div className="text-xs text-slate-400 mb-1 font-bold">Bio</div>
              <div className="text-sm text-white font-semibold">{savedData.bio || 'No bio added yet'}</div>
            </div>
            <button 
              onClick={handleEditClick}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-slate-200 hover:bg-slate-700 hover:bg-opacity-50 rounded-xl transition-all duration-200 group border border-slate-700 border-opacity-50 hover:border-indigo-500 hover:border-opacity-50"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500 bg-opacity-20 text-indigo-400 group-hover:bg-opacity-30 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white">Edit Profile</div>
                <div className="text-xs text-slate-400 font-semibold">Update your profile information</div>
              </div>
              <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderPrivacySection = () => (
    <div className="space-y-6">
      <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 border-opacity-50">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Privacy & Security
        </h3>
        <div className="space-y-4">
          {/* Two-Factor Authentication Toggle */}
          <div className="flex items-center justify-between p-5 rounded-xl bg-gradient-to-r from-emerald-500 from-opacity-10 to-transparent border-2 border-emerald-500 border-opacity-30 hover:border-opacity-50 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 bg-opacity-20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <div className="text-base font-bold text-white">Two-Factor Authentication</div>
                <div className="text-sm text-slate-400 font-semibold">
                  {twoFactorEnabled ? 'Enabled - Your account is protected' : 'Add an extra layer of security'}
                </div>
              </div>
            </div>
            <button 
              onClick={handleToggle2FA}
              className={`w-16 h-8 rounded-full relative transition-all ${
                twoFactorEnabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <div className={`w-7 h-7 rounded-full absolute top-0.5 transition-transform shadow-lg ${
                twoFactorEnabled ? 'bg-blue-400 right-0.5' : 'bg-white left-0.5'
              }`}></div>
            </button>
          </div>

          {/* Change Password */}
          <div className="flex items-center justify-between p-5 rounded-xl bg-gradient-to-r from-indigo-500 from-opacity-10 to-transparent border-2 border-indigo-500 border-opacity-30 hover:border-opacity-50 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500 bg-opacity-20 flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <div className="text-base font-bold text-white">Change Password</div>
                <div className="text-sm text-slate-400 font-semibold">Update your password regularly for security</div>
              </div>
            </div>
            <button 
              onClick={() => setShowPasswordModal(true)}
              className="px-6 py-2.5 text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all shadow-lg"
            >
              Change
            </button>
          </div>

          {/* Active Sessions - Expandable */}
          <div className="rounded-xl bg-gradient-to-r from-violet-500 from-opacity-10 to-transparent border-2 border-violet-500 border-opacity-30 hover:border-opacity-50 transition-all overflow-hidden">
            <button 
              onClick={() => setShowSessionsExpanded(!showSessionsExpanded)}
              className="w-full flex items-center justify-between p-5 transition-all hover:bg-violet-500 hover:bg-opacity-5"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-base font-bold text-white">Active Sessions</div>
                  <div className="text-sm text-slate-400 font-semibold">{activeSessions.length} active devices connected</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-4 py-2 text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all shadow-lg">
                  Show
                </span>
                <svg 
                  className={`w-5 h-5 text-violet-400 transition-transform duration-300 ${showSessionsExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded Sessions List */}
            <div className={`transition-all duration-300 ease-in-out ${showSessionsExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
              <div className="px-5 pb-5 space-y-3 border-t border-violet-500 border-opacity-20 pt-4">
                {activeSessions.map((session) => (
                  <div key={session.id} className="p-4 rounded-xl bg-slate-700 bg-opacity-50 border border-slate-600 border-opacity-50 hover:border-violet-500 hover:border-opacity-50 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-500 bg-opacity-20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            {session.device}
                            {session.current && (
                              <span className="px-2 py-0.5 text-xs font-bold bg-green-500 bg-opacity-20 text-green-400 rounded-full border border-green-500 border-opacity-30">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-semibold mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {session.location}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold mt-0.5 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Last active: {session.lastActive}
                          </div>
                        </div>
                      </div>
                      {!session.current && (
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          className="px-3 py-1.5 text-xs font-bold bg-red-500 bg-opacity-20 hover:bg-opacity-30 text-red-400 rounded-lg transition-all border border-red-500 border-opacity-30 hover:border-opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Change Password</h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setError('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-300 block mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter current password"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-300 block mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter new password"
                  style={{ color: '#000000' }}
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-300 block mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  className="w-full px-4 py-2.5 bg-white border-2 border-slate-600 rounded-lg text-black font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Confirm new password"
                  style={{ color: '#000000' }}
                />
              </div>
              <button
                onClick={handleChangePassword}
                className="w-full px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all font-bold shadow-lg"
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderAppearanceSection = () => (
    <div className="space-y-6">
      <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 border-opacity-50">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
            />
          </svg>
          Appearance
        </h3>

        <div className="space-y-6">
          {/* Theme Selector */}
          <div>
            <label className="text-sm font-bold text-slate-300 block mb-3">Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {/* System Default */}
              <button
                onClick={() => setTheme('system')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-3 group hover:scale-105 ${
                  theme === 'system'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="w-full h-20 rounded-lg overflow-hidden border border-slate-600 shadow-inner relative">
                  <div className="h-full flex relative overflow-hidden">
                    <div className="w-1/2 bg-slate-900 flex items-center justify-center relative">
                      <svg className="w-8 h-8 text-slate-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <div className="absolute top-1 left-1 w-1 h-1 bg-indigo-400 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                    </div>
                    <div className="w-1/2 bg-slate-100 flex items-center justify-center relative">
                      <svg className="w-8 h-8 text-amber-500 group-hover:scale-110 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <div className="absolute top-1 right-1 w-1 h-1 bg-amber-400 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-1 left-1 w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20 group-hover:animate-shimmer"></div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">System Default</div>
                  <div className="text-xs text-slate-400 font-bold mt-1">
                    Follows device theme
                  </div>
                </div>
              </button>

              {/* Light */}
              <button
                onClick={() => setTheme('light')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-3 group hover:scale-105 ${
                  theme === 'light'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="w-full h-20 rounded-lg overflow-hidden border border-slate-300 shadow-inner bg-white p-2.5 flex flex-col gap-1.5 relative">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 group-hover:scale-110 transition-transform"></div>
                    <div className="h-1.5 bg-slate-200 rounded flex-1 group-hover:bg-slate-300 transition-colors"></div>
                  </div>
                  <div className="h-2 bg-slate-200 rounded w-3/4 group-hover:bg-indigo-200 transition-colors"></div>
                  <div className="h-2 bg-slate-300 rounded w-full group-hover:bg-indigo-100 transition-colors"></div>
                  <div className="h-2 bg-slate-200 rounded w-2/3 group-hover:bg-indigo-200 transition-colors"></div>
                  <div className="flex gap-1 mt-auto">
                    <div className="h-2 w-2 bg-indigo-400 rounded group-hover:scale-125 transition-transform"></div>
                    <div className="h-2 w-2 bg-slate-300 rounded group-hover:bg-indigo-300 transition-colors"></div>
                    <div className="h-2 w-2 bg-slate-300 rounded group-hover:bg-indigo-200 transition-colors"></div>
                  </div>
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Light</div>
                  <div className="text-xs text-slate-400 font-bold mt-1">
                    Bright and clean
                  </div>
                </div>
              </button>

              {/* Dark */}
              <button
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-3 group hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="w-full h-20 rounded-lg overflow-hidden border border-slate-700 shadow-inner bg-slate-900 p-2.5 flex flex-col gap-1.5 relative">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/50"></div>
                    <div className="h-1.5 bg-slate-700 rounded flex-1 group-hover:bg-slate-600 transition-colors"></div>
                  </div>
                  <div className="h-2 bg-slate-700 rounded w-3/4 group-hover:bg-indigo-900 transition-colors"></div>
                  <div className="h-2 bg-slate-600 rounded w-full group-hover:bg-indigo-800 transition-colors"></div>
                  <div className="h-2 bg-slate-700 rounded w-2/3 group-hover:bg-indigo-900 transition-colors"></div>
                  <div className="flex gap-1 mt-auto">
                    <div className="h-2 w-2 bg-indigo-500 rounded group-hover:scale-125 transition-transform shadow-lg shadow-indigo-500/50"></div>
                    <div className="h-2 w-2 bg-slate-700 rounded group-hover:bg-indigo-700 transition-colors"></div>
                    <div className="h-2 w-2 bg-slate-700 rounded group-hover:bg-indigo-800 transition-colors"></div>
                  </div>
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse"></div>
                  <div className="absolute bottom-1 left-1 w-1 h-1 bg-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Dark</div>
                  <div className="text-xs text-slate-400 font-bold mt-1">
                    Easy on the eyes
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Font Type Selector */}
          <div className="pt-4 border-t border-slate-700 border-opacity-50">
            <label className="text-sm font-bold text-slate-300 block mb-3">Font Type</label>
            <div className="grid grid-cols-3 gap-3">
              {/* Inter */}
              <button
                onClick={() => setFontType('inter')}
                className={`p-4 rounded-xl border-2 transition-all text-left group hover:scale-105 ${
                  fontType === 'inter'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="mb-3 p-3 bg-slate-800 rounded-lg border border-slate-600 group-hover:border-indigo-500 group-hover:border-opacity-30 transition-all">
                  <p className="text-xs text-slate-300 font-bold leading-relaxed" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-2 flex gap-1">
                    <div className="h-1 w-8 bg-indigo-500 rounded"></div>
                    <div className="h-1 w-4 bg-indigo-400 rounded"></div>
                    <div className="h-1 w-6 bg-indigo-300 rounded"></div>
                  </div>
                </div>
                <div className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Inter
                </div>
                <div
                  className="text-xs text-slate-400 font-bold"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  Clean & modern
                </div>
              </button>

              {/* Roboto */}
              <button
                onClick={() => setFontType('roboto')}
                className={`p-4 rounded-xl border-2 transition-all text-left group hover:scale-105 ${
                  fontType === 'roboto'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="mb-3 p-3 bg-slate-800 rounded-lg border border-slate-600 group-hover:border-indigo-500 group-hover:border-opacity-30 transition-all">
                  <p className="text-xs text-slate-300 font-bold leading-relaxed" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-2 flex gap-1">
                    <div className="h-1 w-8 bg-emerald-500 rounded"></div>
                    <div className="h-1 w-4 bg-emerald-400 rounded"></div>
                    <div className="h-1 w-6 bg-emerald-300 rounded"></div>
                  </div>
                </div>
                <div className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
                  Roboto
                </div>
                <div
                  className="text-xs text-slate-400 font-bold"
                  style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                >
                  Friendly & readable
                </div>
              </button>

              {/* Poppins */}
              <button
                onClick={() => setFontType('poppins')}
                className={`p-4 rounded-xl border-2 transition-all text-left group hover:scale-105 ${
                  fontType === 'poppins'
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-700 bg-opacity-50 border-slate-600 border-opacity-50 hover:border-indigo-400 hover:border-opacity-50'
                }`}
              >
                <div className="mb-3 p-3 bg-slate-800 rounded-lg border border-slate-600 group-hover:border-indigo-500 group-hover:border-opacity-30 transition-all">
                  <p className="text-xs text-slate-300 font-bold leading-relaxed" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-2 flex gap-1">
                    <div className="h-1 w-8 bg-violet-500 rounded"></div>
                    <div className="h-1 w-4 bg-violet-400 rounded"></div>
                    <div className="h-1 w-6 bg-violet-300 rounded"></div>
                  </div>
                </div>
                <div className="text-sm font-bold text-white mb-1" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
                  Poppins
                </div>
                <div
                  className="text-xs text-slate-400 font-bold"
                  style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
                >
                  Rounded & playful
                </div>
              </button>
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="pt-4 border-t border-slate-700 border-opacity-50">
            <label className="text-sm font-bold text-slate-300 block mb-3">Font Size</label>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 font-bold">A</span>
              <div className="flex-1 relative">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-black rounded-full -translate-y-1/2"></div>
                <input 
                  type="range" 
                  min="12" 
                  max="20" 
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="relative w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer z-10"
                  style={{
                    background: 'transparent'
                  }}
                />
                <style>{`
                  input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #6366f1;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
                    border: 3px solid white;
                  }
                  input[type="range"]::-moz-range-thumb {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #6366f1;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
                    border: 3px solid white;
                  }
                  @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                  }
                  .group-hover\\:animate-shimmer {
                    animation: shimmer 1.5s infinite;
                  }
                `}</style>
              </div>
              <span className="text-lg text-slate-400 font-bold">A</span>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-slate-700 bg-opacity-30 border border-slate-600 border-opacity-30">
              <p className="text-slate-300 font-semibold" style={{ fontSize: `${fontSize}px`, fontFamily: getFontFamily() }}>
                Preview text at {fontSize}px using {fontType.charAt(0).toUpperCase() + fontType.slice(1)} font
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationsSection = () => {
    const enabledCount = Object.values(notifications).filter(Boolean).length;

    return (
      <div className="space-y-6">
        <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 border-opacity-50">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            Notifications
          </h3>

          {/* Top hint */}
          <div className="mb-4 px-4 py-3 rounded-xl bg-slate-700 bg-opacity-40 border border-slate-600 border-opacity-60 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-indigo-500 bg-opacity-30 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 11-10 10A10.011 10.011 0 0112 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-300 font-bold">
                Tune how often we notify you. You can turn channels on or off anytime.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Push Notifications */}
            <button
              type="button"
              onClick={() => toggleNotification('push')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 transform hover:scale-[1.01] ${
                notifications.push
                  ? 'bg-indigo-500 bg-opacity-15 border-indigo-500 border-opacity-50 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-700 bg-opacity-40 border-slate-600 border-opacity-60 hover:border-indigo-400 hover:border-opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 w-9 h-9 rounded-lg bg-indigo-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`text-sm font-bold ${notifications.push ? 'text-white' : 'text-black'}`}>
                      Push Notifications
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-700 bg-opacity-80 text-slate-200 border border-slate-500">
                      Real-time
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-bold">
                    {notifications.push
                      ? 'You will receive instant push alerts for important activity.'
                      : 'Push alerts are currently disabled.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                    notifications.push ? 'bg-emerald-500 bg-opacity-20 text-emerald-300' : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {notifications.push ? 'On' : 'Off'}
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors ${
                    notifications.push ? 'bg-indigo-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications.push ? 'right-0.5' : 'left-0.5'
                    }`}
                  ></div>
                </div>
              </div>
            </button>

            {/* Email Notifications */}
            <button
              type="button"
              onClick={() => toggleNotification('email')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 transform hover:scale-[1.01] ${
                notifications.email
                  ? 'bg-indigo-500 bg-opacity-15 border-indigo-500 border-opacity-50 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-700 bg-opacity-40 border-slate-600 border-opacity-60 hover:border-indigo-400 hover:border-opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 w-9 h-9 rounded-lg bg-sky-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`text-sm font-bold ${notifications.email ? 'text-white' : 'text-black'}`}>
                      Email Notifications
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-700 bg-opacity-80 text-slate-200 border border-slate-500">
                      Email
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-bold">
                    {notifications.email
                      ? 'We will send summaries and important updates to your email.'
                      : 'You will not receive emails from us.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                    notifications.email ? 'bg-emerald-500 bg-opacity-20 text-emerald-300' : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {notifications.email ? 'On' : 'Off'}
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors ${
                    notifications.email ? 'bg-indigo-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications.email ? 'right-0.5' : 'left-0.5'
                    }`}
                  ></div>
                </div>
              </div>
            </button>

            {/* Message Notifications */}
            <button
              type="button"
              onClick={() => toggleNotification('messages')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 transform hover:scale-[1.01] ${
                notifications.messages
                  ? 'bg-indigo-500 bg-opacity-15 border-indigo-500 border-opacity-50 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-700 bg-opacity-40 border-slate-600 border-opacity-60 hover:border-indigo-400 hover:border-opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 w-9 h-9 rounded-lg bg-emerald-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.8L3 20l1.3-3.9A7.42 7.42 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`text-sm font-bold ${notifications.messages ? 'text-white' : 'text-black'}`}>
                      Message Notifications
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-700 bg-opacity-80 text-slate-200 border border-slate-500">
                      Chats
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-bold">
                    {notifications.messages
                      ? 'You will be alerted when you receive new messages.'
                      : 'Chat notifications are muted.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                    notifications.messages ? 'bg-emerald-500 bg-opacity-20 text-emerald-300' : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {notifications.messages ? 'On' : 'Off'}
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors ${
                    notifications.messages ? 'bg-indigo-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications.messages ? 'right-0.5' : 'left-0.5'
                    }`}
                  ></div>
                </div>
              </div>
            </button>

            {/* Meeting Reminders */}
            <button
              type="button"
              onClick={() => toggleNotification('meetings')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200 transform hover:scale-[1.01] ${
                notifications.meetings
                  ? 'bg-indigo-500 bg-opacity-15 border-indigo-500 border-opacity-50 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-700 bg-opacity-40 border-slate-600 border-opacity-60 hover:border-indigo-400 hover:border-opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 w-9 h-9 rounded-lg bg-amber-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 19h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`text-sm font-bold ${notifications.meetings ? 'text-white' : 'text-black'}`}>
                      Meeting Reminders
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-700 bg-opacity-80 text-slate-200 border border-slate-500">
                      Calendar
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-bold">
                    {notifications.meetings
                      ? 'We will remind you before your scheduled meetings.'
                      : 'Meeting reminders are turned off.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                    notifications.meetings ? 'bg-emerald-500 bg-opacity-20 text-emerald-300' : 'bg-slate-600 text-slate-300'
                  }`}
                >
                  {notifications.meetings ? 'On' : 'Off'}
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-colors ${
                    notifications.meetings ? 'bg-indigo-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      notifications.meetings ? 'right-0.5' : 'left-0.5'
                    }`}
                  ></div>
                </div>
              </div>
            </button>
          </div>

          {/* Notification Summary Panel */}
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-indigo-500 from-opacity-10 to-violet-500 to-opacity-10 border border-indigo-500 border-opacity-30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500 bg-opacity-20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Notification Summary</div>
                  <div className="text-xs text-slate-400 font-bold">
                    {enabledCount} of 4 channels enabled
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-300">{enabledCount}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Active</div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {notifications.push && (
                <span className="px-2 py-1 text-[10px] font-bold bg-indigo-500 bg-opacity-20 text-indigo-300 rounded-full border border-indigo-500 border-opacity-30">
                  Push
                </span>
              )}
              {notifications.email && (
                <span className="px-2 py-1 text-[10px] font-bold bg-sky-500 bg-opacity-20 text-sky-300 rounded-full border border-sky-500 border-opacity-30">
                  Email
                </span>
              )}
              {notifications.messages && (
                <span className="px-2 py-1 text-[10px] font-bold bg-emerald-500 bg-opacity-20 text-emerald-300 rounded-full border border-emerald-500 border-opacity-30">
                  Messages
                </span>
              )}
              {notifications.meetings && (
                <span className="px-2 py-1 text-[10px] font-bold bg-amber-500 bg-opacity-20 text-amber-300 rounded-full border border-amber-500 border-opacity-30">
                  Meetings
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const sections = [
    { id: "profile", name: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "privacy", name: "Privacy", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
    { id: "appearance", name: "Appearance", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" },
    { id: "notifications", name: "Notifications", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return renderProfileSection();
      case "privacy":
        return renderPrivacySection();
      case "appearance":
        return renderAppearanceSection();
      case "notifications":
        return renderNotificationsSection();
      default:
        return renderProfileSection();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-gray-800 to-black" style={{ fontFamily: getFontFamily() }}>
      {/* Avatar Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-screen overflow-y-auto border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Avatar</h2>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-300 mb-3">Choose an avatar</h3>
              <div className="grid grid-cols-4 gap-3">
                {avatarOptions.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectAvatar(avatar)}
                    className="aspect-square rounded-xl overflow-hidden border-2 border-slate-700 hover:border-indigo-500 transition-all hover:scale-105"
                  >
                    <img src={avatar} alt={`Avatar ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-all mb-3 font-bold"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-bold">Add Picture</span>
            </button>

            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-red-500 bg-opacity-20 hover:bg-opacity-30 text-red-400 rounded-xl transition-all border border-red-500 border-opacity-30 font-bold"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="font-bold">Remove Picture</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-shrink-0 bg-slate-800 bg-opacity-50 backdrop-blur-sm border-b border-slate-700 border-opacity-50">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-sm text-slate-400 font-bold">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 bg-slate-800 bg-opacity-30 backdrop-blur-sm border-r border-slate-700 border-opacity-50 p-4">
          <nav className="space-y-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-all duration-200 ${
                  activeSection === section.id
                    ? "bg-indigo-500 bg-opacity-20 text-indigo-400 border border-indigo-500 border-opacity-30"
                    : "text-slate-300 hover:bg-slate-700 hover:bg-opacity-50 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                </svg>
                <span className="font-bold">{section.name}</span>
              </button>
            ))}

            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-all duration-200 text-rose-400 hover:bg-rose-500 hover:bg-opacity-10 border border-transparent hover:border-rose-500 hover:border-opacity-30 mt-6"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="font-bold">Sign Out</span>
            </button>
          </nav>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}