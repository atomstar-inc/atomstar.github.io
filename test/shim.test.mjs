import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Pull the redirect script out of the BUILT page, so this tests what ships.
const html = fs.readFileSync("_site/index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const shim = scripts.find((s) => s.includes("location.replace"));

function run({ stored, languages }) {
  let replaced = null;
  const ctx = {
    localStorage: {
      getItem: () => (stored === undefined ? null : stored),
      setItem: () => {},
    },
    navigator: { languages, language: languages[0] },
    location: { replace: (u) => { replaced = u; } },
  };
  vm.createContext(ctx);
  vm.runInContext(shim, ctx);
  return replaced;
}

test("the built page actually contains a redirect script", () => {
  assert.ok(shim, "no script with location.replace found in _site/index.html");
});

test("no preference + French browser lands on /fr/", () => {
  assert.equal(run({ languages: ["fr-CA", "en-CA"] }), "/fr/");
});

test("no preference + English browser lands on /en/", () => {
  assert.equal(run({ languages: ["en-CA"] }), "/en/");
});

test("stored preference beats the browser locale", () => {
  assert.equal(run({ stored: "en", languages: ["fr-CA"] }), "/en/");
  assert.equal(run({ stored: "fr", languages: ["en-US"] }), "/fr/");
});

test("junk in localStorage falls back to browser detection", () => {
  assert.equal(run({ stored: "klingon", languages: ["fr-FR"] }), "/fr/");
});

test("French detected anywhere in the language list", () => {
  assert.equal(run({ languages: ["de-DE", "fr"] }), "/fr/");
});

test("unknown locales default to English", () => {
  assert.equal(run({ languages: ["ja-JP", "de-DE"] }), "/en/");
});
