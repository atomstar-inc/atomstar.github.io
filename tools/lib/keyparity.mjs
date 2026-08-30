export function keyPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((k) => keyPaths(value[k], prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

export function assertKeyParity(a, b, aName = "a", bName = "b") {
  const A = new Set(keyPaths(a));
  const B = new Set(keyPaths(b));
  const missingInB = [...A].filter((k) => !B.has(k));
  const missingInA = [...B].filter((k) => !A.has(k));
  if (missingInB.length === 0 && missingInA.length === 0) return;

  const parts = [];
  if (missingInB.length) parts.push(`missing in ${bName}: ${missingInB.join(", ")}`);
  if (missingInA.length) parts.push(`missing in ${aName}: ${missingInA.join(", ")}`);
  throw new Error(`Copy key parity failed — ${parts.join(" | ")}`);
}
