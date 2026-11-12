// The arithmetic of the landing page JavaScript budget, kept apart from the file reading so a test can check it.

/** Adds the sizes (in KB, compressed) and says whether the total fits the budget. A total equal to the budget fits. */
export function evaluate(sizesKb, budgetKb) {
  const total = sizesKb.reduce((sum, size) => sum + size, 0);
  return { total, ok: total <= budgetKb };
}
