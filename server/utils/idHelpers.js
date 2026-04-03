const normalizeId = (value) => {
  if (!value) return '';

  if (typeof value === 'object') {
    if (value._id) return normalizeId(value._id);
    if (value.id) return normalizeId(value.id);
  }

  return value.toString();
};

const idsEqual = (left, right) => normalizeId(left) === normalizeId(right);

const arrayIncludesId = (items = [], target) => items.some((item) => idsEqual(item, target));

module.exports = {
  normalizeId,
  idsEqual,
  arrayIncludesId
};
