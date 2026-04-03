const normalizePrivateParticipantIds = (userIds = []) => (
  [...new Set(
    userIds
      .map((userId) => String(userId || '').trim())
      .filter(Boolean)
  )].sort()
);

const buildPrivateParticipantHash = (userIds = []) => {
  const normalizedParticipantIds = normalizePrivateParticipantIds(userIds);
  return normalizedParticipantIds.length ? normalizedParticipantIds.join(':') : null;
};

module.exports = {
  normalizePrivateParticipantIds,
  buildPrivateParticipantHash
};
