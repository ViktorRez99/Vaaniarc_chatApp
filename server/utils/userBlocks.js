const BlockedUser = require('../models/BlockedUser');
const { normalizeId } = require('./idHelpers');

const isBlockedBetween = async (leftUserId, rightUserId) => {
  const left = normalizeId(leftUserId);
  const right = normalizeId(rightUserId);

  if (!left || !right || left === right) {
    return false;
  }

  const block = await BlockedUser.findOne({
    $or: [
      { blocker: left, blocked: right },
      { blocker: right, blocked: left }
    ]
  }).select('_id').lean();

  return Boolean(block);
};

const getBlockedUserIdsFor = async (userId) => {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return [];
  }

  const blocks = await BlockedUser.find({
    $or: [
      { blocker: normalizedUserId },
      { blocked: normalizedUserId }
    ]
  }).select('blocker blocked').lean();

  return [...new Set(blocks.map((block) => {
    const blocker = normalizeId(block.blocker);
    const blocked = normalizeId(block.blocked);
    return blocker === normalizedUserId ? blocked : blocker;
  }).filter(Boolean))];
};

const getBlockRelationshipFor = async (userId, targetUserId) => {
  const viewer = normalizeId(userId);
  const target = normalizeId(targetUserId);

  if (!viewer || !target || viewer === target) {
    return {
      isBlockedByMe: false,
      hasBlockedMe: false,
      messagingBlocked: false
    };
  }

  const blocks = await BlockedUser.find({
    $or: [
      { blocker: viewer, blocked: target },
      { blocker: target, blocked: viewer }
    ]
  }).select('blocker blocked').lean();

  const isBlockedByMe = blocks.some((block) => normalizeId(block.blocker) === viewer);
  const hasBlockedMe = blocks.some((block) => normalizeId(block.blocker) === target);

  return {
    isBlockedByMe,
    hasBlockedMe,
    messagingBlocked: isBlockedByMe || hasBlockedMe
  };
};

module.exports = {
  getBlockRelationshipFor,
  getBlockedUserIdsFor,
  isBlockedBetween
};
