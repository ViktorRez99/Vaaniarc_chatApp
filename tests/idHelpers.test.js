const mongoose = require('mongoose');
const { normalizeId, idsEqual, arrayIncludesId } = require('../server/utils/idHelpers');

describe('idHelpers', () => {
  it('normalizes strings, objects, and nested _id values', () => {
    expect(normalizeId('abc123')).toBe('abc123');
    expect(normalizeId({ _id: 'abc123' })).toBe('abc123');
    expect(normalizeId({ _id: { toString: () => 'abc123' } })).toBe('abc123');
  });

  it('compares ids across string and object shapes', () => {
    expect(idsEqual('abc123', { _id: 'abc123' })).toBe(true);
    expect(idsEqual({ _id: 'abc123' }, { id: 'abc123' })).toBe(true);
    expect(idsEqual('abc123', 'xyz789')).toBe(false);
  });

  it('checks whether arrays contain an id regardless of representation', () => {
    const participants = [{ _id: 'user-1' }, { _id: 'user-2' }];

    expect(arrayIncludesId(participants, 'user-2')).toBe(true);
    expect(arrayIncludesId(participants, { _id: 'user-1' })).toBe(true);
    expect(arrayIncludesId(participants, 'user-3')).toBe(false);
  });

  it('normalizes mongoose ObjectId values without recursing forever', () => {
    const objectId = new mongoose.Types.ObjectId();

    expect(normalizeId(objectId)).toBe(objectId.toHexString());
    expect(idsEqual(objectId, objectId.toHexString())).toBe(true);
  });
});
