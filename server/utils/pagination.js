const parsePaginationLimit = (value, fallback = 50, max = 50, min = 1) => {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
};

module.exports = {
  parsePaginationLimit
};
