/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

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
