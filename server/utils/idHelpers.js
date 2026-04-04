const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const normalizeId = (value, seen = new Set()) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return typeof value.toString === 'function' ? value.toString() : '';
    }

    seen.add(value);

    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }

    if (hasOwn(value, '_id') && value._id != null && value._id !== value) {
      return normalizeId(value._id, seen);
    }

    if (hasOwn(value, 'id') && value.id != null && value.id !== value) {
      return normalizeId(value.id, seen);
    }

    if (typeof value.valueOf === 'function') {
      const primitiveValue = value.valueOf();
      if (primitiveValue != null && primitiveValue !== value && typeof primitiveValue !== 'object') {
        return String(primitiveValue);
      }
    }
  }

  return typeof value.toString === 'function' ? value.toString() : '';
};

const idsEqual = (left, right) => normalizeId(left) === normalizeId(right);

const arrayIncludesId = (items = [], target) => items.some((item) => idsEqual(item, target));

module.exports = {
  normalizeId,
  idsEqual,
  arrayIncludesId
};
