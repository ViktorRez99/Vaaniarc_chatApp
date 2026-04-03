const { encode, decode } = require('@msgpack/msgpack');

const PACKED_SOCKET_EVENTS = new Set([
  'private_message',
  'room_message',
  'message_sent'
]);

const shouldPackSocketEvent = (eventName) => PACKED_SOCKET_EVENTS.has(String(eventName || ''));

const packSocketPayload = (eventName, payload) => {
  if (!shouldPackSocketEvent(eventName) || payload === undefined) {
    return payload;
  }

  return Buffer.from(encode(payload));
};

const unpackSocketPayload = (payload) => {
  if (!payload) {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return decode(payload);
  }

  if (payload instanceof Uint8Array) {
    return decode(payload);
  }

  if (payload instanceof ArrayBuffer) {
    return decode(new Uint8Array(payload));
  }

  return payload;
};

const emitSocketEvent = (target, eventName, payload) => target.emit(
  eventName,
  packSocketPayload(eventName, payload)
);

module.exports = {
  PACKED_SOCKET_EVENTS,
  emitSocketEvent,
  packSocketPayload,
  shouldPackSocketEvent,
  unpackSocketPayload
};
