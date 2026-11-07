// Handlers are fresh closures over the same values each render; the values they act on are
// compared through the context's data fields, so a row re-renders only for data it shows.
export function sameRowValue(left: unknown, right: unknown, depth: number): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left === "function" && typeof right === "function") return true;
  if (left instanceof Set && right instanceof Set) {
    return left.size === right.size && [...left].every((value) => right.has(value));
  }
  if (left instanceof Map && right instanceof Map) {
    return (
      left.size === right.size &&
      [...left].every(([key, value]) => right.has(key) && sameRowValue(value, right.get(key), 1))
    );
  }
  if (depth > 0 && Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sameRowValue(value, right[index], depth - 1))
    );
  }
  if (
    depth > 0 &&
    typeof left === "object" &&
    typeof right === "object" &&
    left !== null &&
    right !== null &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return (
      keys.length === Object.keys(rightRecord).length &&
      keys.every((key) => sameRowValue(leftRecord[key], rightRecord[key], depth - 1))
    );
  }
  return false;
}
