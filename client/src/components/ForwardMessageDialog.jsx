import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Users, X } from 'lucide-react';
import api from '../services/api';
import { idsEqual } from '../utils/identity';

const matchesSearch = (value, query) => String(value || '').toLowerCase().includes(query);

const ForwardMessageDialog = ({
  isOpen,
  excludeRoomId = null,
  excludeUserId = null,
  messagePreview = '',
  onClose,
  onForward
}) => {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittingKey, setSubmittingKey] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setError('');
      setSubmittingKey(null);
      return;
    }

    let isCancelled = false;

    const loadTargets = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [nextUsers, nextRooms] = await Promise.all([
          api.getUsers(),
          api.getRooms()
        ]);

        if (isCancelled) {
          return;
        }

        setUsers(Array.isArray(nextUsers) ? nextUsers : []);
        setRooms(Array.isArray(nextRooms) ? nextRooms : []);
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError.message || 'Failed to load forwarding targets.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadTargets();

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredUsers = useMemo(() => users.filter((user) => {
    if (excludeUserId && idsEqual(user?._id, excludeUserId)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return matchesSearch(user?.username, normalizedQuery) || matchesSearch(user?.bio, normalizedQuery);
  }), [excludeUserId, normalizedQuery, users]);

  const filteredRooms = useMemo(() => rooms.filter((room) => {
    if (excludeRoomId && idsEqual(room?._id, excludeRoomId)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return matchesSearch(room?.name, normalizedQuery) || matchesSearch(room?.description, normalizedQuery);
  }), [excludeRoomId, normalizedQuery, rooms]);

  const handleForward = async (target) => {
    const targetKey = `${target.type}:${target.item?._id || target.item?.id || 'unknown'}`;
    setSubmittingKey(targetKey);
    setError('');

    try {
      await onForward(target);
      onClose();
    } catch (forwardError) {
      setError(forwardError.message || 'Failed to forward the message.');
    } finally {
      setSubmittingKey(null);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#0f1722] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Forward Message</h3>
            <p className="mt-1 max-w-xl text-sm text-white/55">
              {messagePreview}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-white/5 px-5 py-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search people and groups"
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
            />
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        <div className="grid max-h-[65vh] gap-6 overflow-y-auto px-5 py-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
              <MessageCircle className="h-4 w-4" />
              Direct Chats
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                Loading people...
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user) => {
                const targetKey = `user:${user._id}`;

                return (
                  <button
                    key={targetKey}
                    type="button"
                    onClick={() => handleForward({ type: 'user', item: user })}
                    disabled={submittingKey === targetKey}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600">
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.username || 'User'} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-white">
                          {user?.username?.[0]?.toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{user?.username || 'User'}</p>
                      <p className="truncate text-xs text-white/45">{user?.bio || 'Direct message'}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-200">
                      {submittingKey === targetKey ? 'Sending...' : 'Send'}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No people match this search.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
              <Users className="h-4 w-4" />
              Groups
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                Loading groups...
              </div>
            ) : filteredRooms.length > 0 ? (
              filteredRooms.map((room) => {
                const targetKey = `room:${room._id}`;

                return (
                  <button
                    key={targetKey}
                    type="button"
                    onClick={() => handleForward({ type: 'room', item: room })}
                    disabled={submittingKey === targetKey}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{room?.name || 'Room'}</p>
                      <p className="truncate text-xs text-white/45">
                        {room?.description || `${room?.members?.length || 0} members`}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-200">
                      {submittingKey === targetKey ? 'Sending...' : 'Send'}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No joined groups match this search.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForwardMessageDialog;
