/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

import { encode, decode } from '@msgpack/msgpack';

const PACKED_SOCKET_EVENTS = new Set([
  'private_message',
  'room_message',
  'message_sent'
]);

export const shouldPackSocketEvent = (eventName) => PACKED_SOCKET_EVENTS.has(String(eventName || ''));

export const encodeSocketPayload = (eventName, payload) => {
  if (!shouldPackSocketEvent(eventName) || payload === undefined) {
    return payload;
  }

  return encode(payload);
};

export const decodeSocketPayload = (payload) => {
  if (!payload) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return decode(new Uint8Array(payload));
  }

  if (ArrayBuffer.isView(payload)) {
    return decode(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
  }

  return payload;
};
