import test from "node:test";
import assert from "node:assert/strict";
import { keyPaths, assertKeyParity } from "../tools/lib/keyparity.mjs";

test("keyPaths flattens nested objects to dotted paths", () => {
  assert.deepEqual(keyPaths({ a: { b: 1 } }), ["a.b"]);
});

test("keyPaths indexes array members", () => {
  assert.deepEqual(keyPaths({ a: [1, 2] }), ["a[0]", "a[1]"]);
});

test("identical shapes pass", () => {
  assert.doesNotThrow(() => assertKeyParity({ a: 1 }, { a: 2 }));
});

test("key missing from fr is reported by path", () => {
  assert.throws(
    () => assertKeyParity({ hero: { sub: "x", eyebrow: "y" } }, { hero: { sub: "x" } }, "en", "fr"),
    /missing in fr: hero\.eyebrow/
  );
});

test("key missing from en is reported by path", () => {
  assert.throws(() => assertKeyParity({ a: 1 }, { a: 1, b: 2 }, "en", "fr"), /missing in en: b/);
});

test("array length mismatch is caught", () => {
  assert.throws(
    () => assertKeyParity({ cards: [1, 2, 3] }, { cards: [1, 2] }, "en", "fr"),
    /missing in fr: cards\[2\]/
  );
});
