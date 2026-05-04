import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import apiService from '../services/api';
import recoveryKitService from '../services/recoveryKitService';

const buildShareKey = (share) => `${share.kitId}:${share.shareIndex}`;

const RecoveryKitPanel = () => {
  const { user } = useAuth();
  const [kits, setKits] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [revealedShares, setRevealedShares] = useState({});
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('Trusted Circle Recovery');
  const [threshold, setThreshold] = useState(2);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeKit = useMemo(
    () => kits.find((kit) => kit.status === 'active') || null,
    [kits]
  );

  const refreshRecoveryState = useCallback(async () => {
    try {
      setLoading(true);
      const [nextKits, nextReceivedShares] = await Promise.all([
        recoveryKitService.listRecoveryKits(),
        recoveryKitService.getReceivedShares()
      ]);
      setKits(nextKits);
      setReceivedShares(nextReceivedShares);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load recovery kits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRecoveryState();
  }, [refreshRecoveryState]);

  useEffect(() => {
    if (selectedContacts.length < 2) {
      setThreshold(2);
      return;
    }

    if (threshold > selectedContacts.length) {
      setThreshold(selectedContacts.length);
    }
  }, [selectedContacts.length, threshold]);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const response = await apiService.searchUsers(searchQuery.trim());
      const availableUsers = (response.users || []).filter(
        (result) => !selectedContacts.some((contact) => contact._id === result._id)
      );
      setSearchResults(availableUsers);
    } catch (searchError) {
      setError(searchError.message || 'Failed to search for trusted contacts.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddContact = (contact) => {
    if (selectedContacts.some((selectedContact) => selectedContact._id === contact._id)) {
      return;
    }

    const nextContacts = [...selectedContacts, contact];
    setSelectedContacts(nextContacts);
    if (nextContacts.length > 1 && threshold > nextContacts.length) {
      setThreshold(nextContacts.length);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveContact = (contactId) => {
    setSelectedContacts((currentContacts) => currentContacts.filter((contact) => contact._id !== contactId));
  };

  const handleCreateOrRotate = async (mode = 'create') => {
    if (!user) {
      setError('Sign in again before managing recovery kits.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'rotate' && activeKit) {
        await recoveryKitService.rotateRecoveryKit(activeKit.id, {
          ownerUser: user,
          label: label.trim() || activeKit.label,
          threshold,
          contacts: selectedContacts
        });
        setSuccess('Recovery kit rotated successfully.');
      } else {
        await recoveryKitService.createRecoveryKit({
          ownerUser: user,
          label: label.trim() || 'Trusted Circle Recovery',
          threshold,
          contacts: selectedContacts
        });
        setSuccess('Recovery kit created successfully.');
      }

      await refreshRecoveryState();
    } catch (createError) {
      setError(createError.message || 'Failed to save the recovery kit.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeKit = async (kitId) => {
    if (!window.confirm('Revoke this recovery kit? Trusted contacts will no longer use it for future recovery.')) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await recoveryKitService.revokeRecoveryKit(kitId);
      await refreshRecoveryState();
      setSuccess('Recovery kit revoked.');
    } catch (revokeError) {
      setError(revokeError.message || 'Failed to revoke the recovery kit.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevealShare = async (share) => {
    const shareKey = buildShareKey(share);

    if (revealedShares[shareKey]) {
      setRevealedShares((currentShares) => {
        const nextShares = { ...currentShares };
        delete nextShares[shareKey];
        return nextShares;
      });
      return;
    }

    setError('');

    try {
      const decryptedShare = await recoveryKitService.decryptReceivedShare(share.encryptedEnvelope);
      setRevealedShares((currentShares) => ({
        ...currentShares,
        [shareKey]: decryptedShare
      }));
    } catch (decryptError) {
      setError(decryptError.message || 'Failed to decrypt this recovery share.');
    }
  };

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 backdrop-blur-xl">
      <div className="flex items-start gap-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
          <svg className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V4H2v16h5m10 0v-4a3 3 0 10-6 0v4m6 0H7" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-lg font-bold text-white">Social Recovery</div>
          <div className="text-sm font-medium text-slate-300">
            Split a recovery secret into encrypted shards for trusted contacts. The server stores only encrypted envelopes.
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_140px]">
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Recovery kit label"
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/40"
            />
            <input
              type="number"
              min={2}
              max={Math.max(2, selectedContacts.length)}
              value={threshold}
              onChange={(event) => setThreshold(Number.parseInt(event.target.value, 10) || 2)}
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/40"
            />
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search usernames to add trusted contacts"
              className="h-11 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/40"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searchLoading}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              {searchResults.map((result) => (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => handleAddContact(result)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-left transition hover:border-violet-400/30 hover:bg-white/10"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{result.username}</div>
                    <div className="text-xs text-slate-400">{result.status || 'Available'}</div>
                  </div>
                  <span className="text-xs font-semibold text-violet-300">Add</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Trusted contacts</div>
            {selectedContacts.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Add at least two trusted contacts before creating a recovery kit.
              </div>
            )}
            {selectedContacts.map((contact) => (
              <div key={contact._id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">{contact.username}</div>
                  <div className="text-xs text-slate-500">Encrypted shard recipient</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveContact(contact._id)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleCreateOrRotate('create')}
              disabled={saving || selectedContacts.length < 2}
              className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Create Recovery Kit'}
            </button>
            {activeKit && (
              <button
                type="button"
                onClick={() => void handleCreateOrRotate('rotate')}
                disabled={saving || selectedContacts.length < 2}
                className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Rotate Active Kit
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/40">Your recovery kits</div>
            {loading && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Loading recovery kits...
              </div>
            )}
            {!loading && kits.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                No recovery kits saved yet.
              </div>
            )}
            {!loading && kits.map((kit) => (
              <div key={kit.id} className="mb-3 rounded-xl border border-white/10 bg-black/20 px-4 py-4 last:mb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{kit.label}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                        {kit.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {kit.threshold} of {kit.shardCount} trusted contacts required
                    </div>
                  </div>
                  {kit.status !== 'revoked' && (
                    <button
                      type="button"
                      onClick={() => void handleRevokeKit(kit.id)}
                      disabled={saving}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/40">Recovery shares entrusted to you</div>
            {loading && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                Loading encrypted recovery shares...
              </div>
            )}
            {!loading && receivedShares.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                No encrypted recovery shares are currently addressed to this account.
              </div>
            )}
            {!loading && receivedShares.map((share) => {
              const shareKey = buildShareKey(share);
              const revealedShare = revealedShares[shareKey] || null;

              return (
                <div key={shareKey} className="mb-3 rounded-xl border border-white/10 bg-black/20 px-4 py-4 last:mb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{share.label}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Shared by {share.owner.username || 'Unknown user'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevealShare(share)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      {revealedShare ? 'Hide Share' : 'Reveal Share'}
                    </button>
                  </div>

                  {revealedShare && (
                    <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/10 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200/70">Recovery share</div>
                      <div className="mt-2 break-all font-mono text-xs text-violet-100">{revealedShare.share}</div>
                      <div className="mt-2 text-xs text-slate-300">
                        Keep this share private. It is intended for social recovery, not daily sign-in.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryKitPanel;
