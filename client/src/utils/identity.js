export const normalizeId = (value) => {
  if (!value) return '';

  if (typeof value === 'object') {
    if (value._id) return normalizeId(value._id);
    if (value.id) return normalizeId(value.id);
  }

  return value.toString();
};

export const idsEqual = (left, right) => normalizeId(left) === normalizeId(right);
