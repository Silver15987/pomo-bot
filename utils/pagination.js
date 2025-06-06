/**
 * Paginate an array.
 * @param {Array} array
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ paginated: Array, totalPages: number }}
 */
export function paginate(array, page = 0, pageSize = 5) {
  // TODO: Add more robust pagination (bounds checking, etc.)
  const start = page * pageSize;
  const paginated = array.slice(start, start + pageSize);
  const totalPages = Math.ceil(array.length / pageSize);
  return { paginated, totalPages };
} 