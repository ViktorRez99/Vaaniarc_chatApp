/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

export const normalizeId = (value) => {
  if (!value) return '';

  if (typeof value === 'object') {
    if (value._id) return normalizeId(value._id);
    if (value.id) return normalizeId(value.id);
  }

  return value.toString();
};

export const idsEqual = (left, right) => normalizeId(left) === normalizeId(right);
