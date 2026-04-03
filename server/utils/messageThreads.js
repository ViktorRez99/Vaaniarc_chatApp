const Message = require('../models/Message');
const PrivateMessage = require('../models/PrivateMessage');

const detachReplyThread = async (Model, rootMessageId) => {
  let parentIds = [rootMessageId];
  const detachedReplyIds = [];

  while (parentIds.length) {
    const childMessages = await Model.find({
      replyTo: { $in: parentIds }
    }).select('_id');

    if (!childMessages.length) {
      break;
    }

    const childIds = childMessages.map((message) => message._id);
    await Model.updateMany(
      { _id: { $in: childIds } },
      { $set: { replyTo: null } }
    );

    detachedReplyIds.push(...childIds.map((childId) => childId.toString()));
    parentIds = childIds;
  }

  return detachedReplyIds;
};

const detachPrivateReplyThread = (messageId) => detachReplyThread(PrivateMessage, messageId);
const detachRoomReplyThread = (messageId) => detachReplyThread(Message, messageId);

module.exports = {
  detachPrivateReplyThread,
  detachRoomReplyThread
};
