/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const PrivateMessage = require('../models/PrivateMessage');
const Message = require('../models/Message');

const normalizeTempId = (tempId) => {
  if (typeof tempId !== 'string') {
    return null;
  }

  const trimmedTempId = tempId.trim();
  return trimmedTempId.length > 0 ? trimmedTempId : null;
};

const findExistingPrivateMessage = async ({ chatId, senderId, tempId }) => {
  const normalizedTempId = normalizeTempId(tempId);

  if (!chatId || !senderId || !normalizedTempId) {
    return null;
  }

  return PrivateMessage.findOne({
    chatId,
    sender: senderId,
    tempId: normalizedTempId
  });
};

const findExistingRoomMessage = async ({ roomId, senderId, tempId }) => {
  const normalizedTempId = normalizeTempId(tempId);

  if (!roomId || !senderId || !normalizedTempId) {
    return null;
  }

  return Message.findOne({
    room: roomId,
    sender: senderId,
    tempId: normalizedTempId
  });
};

module.exports = {
  findExistingPrivateMessage,
  findExistingRoomMessage,
  normalizeTempId
};
