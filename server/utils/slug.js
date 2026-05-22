/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const slugifyValue = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

const buildUniqueSlug = async (Model, value, excludeId = null) => {
  const baseSlug = slugifyValue(value) || `item-${Date.now()}`;
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    const query = { slug: candidate };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await Model.findOne(query).select('_id').lean();

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
};

module.exports = {
  slugifyValue,
  buildUniqueSlug
};
