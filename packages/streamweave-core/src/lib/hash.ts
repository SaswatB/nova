export function generateCacheKey(obj: object): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());

  // FNV-1a hash algorithm constants
  const PRIME = 0x01000193;
  const OFFSET_BASIS = 0x811c9dc5;

  let hash = OFFSET_BASIS;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, PRIME);
  }

  // Convert to hex string
  return (hash >>> 0).toString(16).padStart(8, "0");
}
