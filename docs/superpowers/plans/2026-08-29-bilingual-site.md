# Bilingual atomstar.com Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve atomstar.com in French and English from a single set of templates, with the social and search metadata the site currently lacks.

**Architecture:** Eleventy builds `src/` into `_site/`. All prose lives in `src/_data/en.json` and `src/_data/fr.json`, which a build-time assertion forces to stay key-identical. One Nunjucks layout renders both `/en/` and `/fr/`; `/` is a client-side language shim. The GitHub Pages deploy actions are untouched — only the build step changes.

**Tech Stack:** Eleventy v3, Nunjucks, Node 26 (`node --test`, no test framework dependency), Sharp (devDependency, one-off image generation).

**Spec:** `docs/superpowers/specs/2026-08-29-bilingual-site-design.md`

## Global Constraints

- Node 26 is the local runtime; CI pins `actions/setup-node@v4` with `node-version: 22`.
- `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4` keep their current versions and inputs. Do not modify them.
- Build output directory is `_site/` — unchanged from the Jekyll step it replaces.
- `_site/` root must contain `CNAME`, `favicon.svg`, `og.png`, `.nojekyll`.
- Founding year is **2019** everywhere. The string `EST. 2026` must not survive.
- The hero coordinate `47.6062° N` is removed, not replaced.
- The 435-line `<style>` block moves **verbatim**. Reformatting it invalidates the render diff in Task 2.
- Language codes are exactly `en` and `fr`. localStorage keys are `atomstar-lang` and the pre-existing `atomstar-theme`.
- Canonical origin is `https://atomstar.com` (no `www`, no trailing-slash variants).

---

### Task 1: Copy-parity guard

The one piece of real logic in this build. Without it, adding an English string and forgetting the French one ships a half-translated page silently.

**Files:**
- Create: `tools/lib/keyparity.mjs`
- Create: `test/keyparity.test.mjs`
- Create: `package.json`

**Interfaces:**
- Produces: `keyPaths(value, prefix = "") -> string[]` and `assertKeyParity(a, b, aName = "a", bName = "b") -> void` (throws `Error` on mismatch). Task 2 imports `assertKeyParity` in `eleventy.config.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "atomstar-site",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "eleventy",
    "serve": "eleventy --serve",
    "test": "node --test test/"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/keyparity.test.mjs`:

```js
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
  assert.throws(
    () => assertKeyParity({ a: 1 }, { a: 1, b: 2 }, "en", "fr"),
    /missing in en: b/
  );
});

test("array length mismatch is caught", () => {
  assert.throws(
    () => assertKeyParity({ cards: [1, 2, 3] }, { cards: [1, 2] }, "en", "fr"),
    /missing in fr: cards\[2\]/
  );
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../tools/lib/keyparity.mjs'`

- [ ] **Step 4: Write the implementation**

Create `tools/lib/keyparity.mjs`:

```js
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
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, 6/6.

- [ ] **Step 6: Commit**

```bash
git add package.json tools/lib/keyparity.mjs test/keyparity.test.mjs
git commit -m "Add copy key-parity guard

Fails the build when en.json and fr.json diverge, so a missing French
string cannot ship as an English fragment on the French page."
```

---

### Task 2: Eleventy build + English page, proven identical to production

The risky task. A 686-line hand-tuned page becomes templates; this task exists to prove that move changed nothing.

**Files:**
- Create: `eleventy.config.js`, `src/_data/site.json`, `src/_data/en.json`
- Create: `src/_includes/layout.njk`, `src/en.njk`
- Create: `test/fixtures/baseline-index.html`, `tools/render-diff.mjs`
- Move: `favicon.svg`, `CNAME`, `.nojekyll` → `src/`
- Delete: `index.html` (root)

**Interfaces:**
- Consumes: `assertKeyParity` from Task 1.
- Produces: `src/_data/en.json` shape consumed by Task 3's `fr.json`; `layout.njk` consumed by Tasks 3–5. Layout expects page front matter to set `lang` (`"en"`/`"fr"`), `t` resolved via `{% set t = [lang] %}` from data, and `other` (the opposite language code).

- [ ] **Step 1: Snapshot the current page as the regression baseline**

```bash
cp index.html test/fixtures/baseline-index.html
```

This is the file currently in production. Every later step compares against it.

- [ ] **Step 2: Move static assets under `src/`**

```bash
mkdir -p src/_includes src/_data
git mv favicon.svg src/favicon.svg
git mv CNAME src/CNAME
git mv .nojekyll src/.nojekyll
```

- [ ] **Step 3: Create `src/_data/site.json`**

Language-neutral values only. Stat values live here because they are numbers, not prose.

```json
{
  "origin": "https://atomstar.com",
  "email": "contact@atomstar.com",
  "founded": 2019,
  "feed": [
    "CVE-2021-1694 · MICROSOFT · EOP · IMPORTANT",
    "CVE-2020-8256 · PULSE SECURE · XXE · CVSS 4.9",
    "CVE-2020-8238 · PULSE SECURE · XSS · CVSS 6.1",
    "CVE-2020-1013 · MICROSOFT · EOP · IMPORTANT",
    "CVE-2020-8218 · IVANTI · CODE INJECTION · CVSS 7.2",
    "CVE-2019-9972 · 3CX · COMMAND INJECTION · CVSS 8.8"
  ],
  "statValues": [
    { "count": "6" },
    { "count": "3" },
    { "count": "8.8", "decimals": "1" },
    { "static": "2019&nbsp;→&nbsp;26" }
  ]
}
```

- [ ] **Step 4: Create `src/_data/en.json`**

Copy transcribed verbatim from `test/fixtures/baseline-index.html`, except the three fixes named in Global Constraints.

```json
{
  "meta": {
    "title": "ATOMSTAR · IT Consulting and Adversarial Research",
    "description": "Atomstar is a Quebec IT consultancy with an offensive security research practice: infrastructure, identity, penetration testing, and AI agent security.",
    "ogTitle": "ATOMSTAR — IT Consulting and Adversarial Research",
    "ogDescription": "Infrastructure, identity and continuity engineering, plus penetration testing, vulnerability research and AI agent security."
  },
  "nav": { "work": "Work", "engage": "Engage" },
  "theme": { "dark": "DARK", "light": "LIGHT" },
  "langSwitch": { "label": "FR", "aria": "Voir cette page en français" },
  "hero": {
    "eyebrow": "LIVE TRANSMISSION",
    "sub": "An IT consultancy with a research practice."
  },
  "services": {
    "consulting": {
      "tag": "01 / Services",
      "title": "IT Consulting.",
      "lede": "Designing and operating production infrastructure.",
      "cards": [
        {
          "num": "01",
          "title": "Infrastructure as code.",
          "body": "Production infrastructure defined in a repository. Versioned, reviewable, reproducible.",
          "meta": "Infrastructure-as-Code · Containers · Fabric"
        },
        {
          "num": "02",
          "title": "Identity and access.",
          "body": "Directory services, access management, device management, and key infrastructure. Documentation included.",
          "meta": "Identity · Access · Policy · Devices"
        },
        {
          "num": "03",
          "title": "Network and continuity.",
          "body": "Network design, overlay meshes, site-to-site links, backup, and continuity planning.",
          "meta": "Mesh · Fabric · Backup · Continuity"
        }
      ]
    },
    "offensive": {
      "tag": "02 / Services",
      "title": "Offensive Security.",
      "lede": "Independent security review of what you ship and what you depend on.",
      "cards": [
        {
          "num": "04",
          "title": "Vulnerability research.",
          "body": "Independent research and coordinated disclosure. Six published CVEs since 2019.",
          "meta": "MSRC · NVD · 90-day window"
        },
        {
          "num": "05",
          "title": "Penetration testing.",
          "body": "Web, network, cloud, and internal engagements. Findings documented with reproductions, severity, and fixes. Re-tested after remediation.",
          "meta": "Web · Network · Cloud · Internal"
        },
        {
          "num": "06",
          "title": "AI and agent security.",
          "body": "Adversarial testing for language models and agentic systems: prompt injection, tool misuse, policy boundaries, behavioural review.",
          "meta": "LLMs · Agents · Evals · Guardrails"
        }
      ]
    }
  },
  "stats": [
    { "label": "Public / CVEs", "unit": "published findings" },
    { "label": "Affected / vendors", "unit": "Microsoft · Pulse · 3CX" },
    { "label": "Peak / CVSS", "unit": "CVE-2019-9972" },
    { "label": "Disclosure / span", "unit": "research, continuous" }
  ],
  "marquee": "we test the things that test you back",
  "cta": { "stamp": "★ Since 2019", "title": "Contact us." },
  "footer": { "left": "ATOMSTAR", "right": "★ EST. 2019 · OPERATING UNDER OBSERVATION" }
}
```

- [ ] **Step 5: Create `eleventy.config.js`**

```js
import fs from "node:fs";
import { assertKeyParity } from "./tools/lib/keyparity.mjs";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));

export default function (eleventyConfig) {
  // Fail the build rather than ship a half-translated page.
  assertKeyParity(read("./src/_data/en.json"), read("./src/_data/fr.json"), "en", "fr");

  for (const asset of ["CNAME", "favicon.svg", "og.png", ".nojekyll"]) {
    eleventyConfig.addPassthroughCopy({ [`src/${asset}`]: asset });
  }

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
```

Note: the parity call reads `fr.json`, which does not exist until Task 3. Task 2 therefore creates a placeholder `src/_data/fr.json` that is a byte-copy of `en.json`, so the build runs. Task 3 replaces its values with real French. This is deliberate — it keeps the guard wired from the first build rather than bolted on later.

```bash
cp src/_data/en.json src/_data/fr.json
```

- [ ] **Step 6: Create `src/_includes/layout.njk`**

Transcribe from `test/fixtures/baseline-index.html`:
- lines 1–11 → head opening and font links, with `<html lang="{{ lang }}">`
- lines 12–22 → theme pre-paint script, **verbatim**
- lines 23–457 → the `<style>` block, **verbatim, not reformatted**
- lines 459–627 → body markup, with every prose string replaced by a `{{ t.* }}` reference
- lines 628–684 → behaviour script, verbatim, plus the language-switch handler below

Three regions are data-driven rather than literal. Wire them exactly as follows.

Marquee feed. `site.feed` is emitted twice; the duplicate is what makes the loop
seamless and was already so in the baseline:

```njk
<div class="marquee-track">
  {% for item in site.feed %}<span>{{ item }}</span>{% endfor %}
  {% for item in site.feed %}<span>{{ item }}</span>{% endfor %}
</div>
```

Stats pair prose from `t.stats` with numbers from `site.statValues` by index.
The fourth stat has no `data-count` — it is static text, and needs `| safe`
because it contains `&nbsp;` and an arrow:

```njk
{% for s in t.stats %}
{% set v = site.statValues[loop.index0] %}
<div class="stat">
  <div class="label">{{ s.label }}</div>
  {% if v.static %}
  <div class="value">{{ v.static | safe }}</div>
  {% else %}
  <div class="value" data-count="{{ v.count }}"{% if v.decimals %} data-decimals="{{ v.decimals }}"{% endif %}>0</div>
  {% endif %}
  <div class="unit">{{ s.unit }}</div>
</div>
{% endfor %}
```

Service cards loop over both groups in order:

```njk
{% for group in [t.services.consulting, t.services.offensive] %}
<div class="svc-group">
  <header class="svc-head">
    <div><span class="svc-tag">{{ group.tag }}</span><h2>{{ group.title }}</h2></div>
    <p class="lede">{{ group.lede }}</p>
  </header>
  <div class="svc-grid">
    {% for c in group.cards %}
    <article class="svc">
      <div class="svc-num">{{ c.num }}</div>
      <h3>{{ c.title }}</h3>
      <p>{{ c.body }}</p>
      <div class="svc-meta">{{ c.meta }}</div>
    </article>
    {% endfor %}
  </div>
</div>
{% endfor %}
```

The CTA link uses `site.email` for both href and label:

```njk
<a class="cta" href="mailto:{{ site.email }}">{{ site.email }} &rarr;</a>
```

The header gains a language switch beside the existing theme toggle:

```njk
<a class="lang-switch" href="/{{ other }}/" hreflang="{{ other }}"
   data-lang-switch="{{ other }}" aria-label="{{ t.langSwitch.aria }}">{{ t.langSwitch.label }}</a>
```

Appended to the existing IIFE in the behaviour script:

```js
  // Remember a deliberate language choice so the shim at / honours it.
  document.querySelectorAll('[data-lang-switch]').forEach((a) => {
    a.addEventListener('click', () => {
      try { localStorage.setItem('atomstar-lang', a.dataset.langSwitch); } catch (e) {}
    });
  });
```

The anchor is a real link, so it works with JavaScript disabled; the handler only adds persistence.

Style the switch to match the existing `.theme-toggle` rules — reuse its font-size, letter-spacing and `--dim` colour rather than inventing new values.

- [ ] **Step 7: Create `src/en.njk`**

```njk
---
layout: layout.njk
permalink: /en/index.html
lang: en
other: fr
---
```

Body content comes entirely from the layout; this file only supplies front matter.

In `layout.njk`, resolve the copy bundle once at the top:

```njk
{% set t = en if lang == "en" else fr %}
```

- [ ] **Step 8: Build and compare against the baseline**

Create `tools/render-diff.mjs`:

```js
import fs from "node:fs";

const norm = (s) =>
  s.replace(/\r\n/g, "\n")
   .split("\n")
   .map((l) => l.trim())
   .filter((l) => l.length > 0)
   .join("\n");

const [a, b] = process.argv.slice(2);
const A = norm(fs.readFileSync(a, "utf8")).split("\n");
const B = norm(fs.readFileSync(b, "utf8")).split("\n");

const onlyA = A.filter((l) => !B.includes(l));
const onlyB = B.filter((l) => !A.includes(l));

console.log(`--- only in ${a} (${onlyA.length}) ---`);
onlyA.forEach((l) => console.log("  " + l));
console.log(`--- only in ${b} (${onlyB.length}) ---`);
onlyB.forEach((l) => console.log("  " + l));
```

Run:

```bash
npm install
npx @11ty/eleventy
node tools/render-diff.mjs test/fixtures/baseline-index.html _site/en/index.html
```

Expected differences, and **nothing else**:
- `<html lang="en">` unchanged; `<title>` unchanged
- removed: `LIVE TRANSMISSION · 47.6062° N`, `ATOMSTAR // LAB · v0.1`, `★ EST. 2026 · OPERATING UNDER OBSERVATION`
- added: `LIVE TRANSMISSION`, `ATOMSTAR`, `★ EST. 2019 · OPERATING UNDER OBSERVATION`, the `.lang-switch` anchor and its handler

If any style rule or section markup appears in the diff, the transcription is wrong. Fix it before continuing — this is the whole point of the task.

- [ ] **Step 9: Remove the old root page**

```bash
git rm index.html
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Build the English page from Eleventy templates

Copy moves into src/_data/en.json; the style block and behaviour script
move verbatim. Render diff against the pre-refactor page shows only the
three intended content fixes and the language switch."
```

---

### Task 3: French copy

**Files:**
- Modify: `src/_data/fr.json` (replacing the Task 2 placeholder)
- Create: `src/fr.njk`

**Interfaces:**
- Consumes: `layout.njk` and the `en.json` key shape from Task 2.
- Produces: `/fr/` — the target of Task 4's shim and Task 5's `hreflang`.

- [ ] **Step 1: Write `src/_data/fr.json`**

Same keys, French values. Draft for operator review — the operator is a native speaker and this is a review gate, not a formality.

```json
{
  "meta": {
    "title": "ATOMSTAR · Conseil TI et recherche offensive",
    "description": "Atomstar est une société de conseil en TI du Québec dotée d'une pratique de recherche en sécurité offensive : infrastructure, identité, tests d'intrusion et sécurité des agents IA.",
    "ogTitle": "ATOMSTAR — Conseil TI et recherche offensive",
    "ogDescription": "Ingénierie d'infrastructure, d'identité et de continuité, tests d'intrusion, recherche de vulnérabilités et sécurité des agents IA."
  },
  "nav": { "work": "Services", "engage": "Nous joindre" },
  "theme": { "dark": "SOMBRE", "light": "CLAIR" },
  "langSwitch": { "label": "EN", "aria": "View this page in English" },
  "hero": {
    "eyebrow": "TRANSMISSION EN DIRECT",
    "sub": "Une société de conseil en TI dotée d'une pratique de recherche."
  },
  "services": {
    "consulting": {
      "tag": "01 / Services",
      "title": "Conseil TI.",
      "lede": "Conception et exploitation d'infrastructures de production.",
      "cards": [
        {
          "num": "01",
          "title": "L'infrastructure comme code.",
          "body": "Une infrastructure de production définie dans un dépôt. Versionnée, révisable, reproductible.",
          "meta": "Infrastructure-as-Code · Conteneurs · Fabric"
        },
        {
          "num": "02",
          "title": "Identité et accès.",
          "body": "Services d'annuaire, gestion des accès, gestion des appareils et infrastructure à clés. Documentation incluse.",
          "meta": "Identité · Accès · Politiques · Appareils"
        },
        {
          "num": "03",
          "title": "Réseau et continuité.",
          "body": "Conception réseau, maillages overlay, liens site à site, sauvegarde et planification de la continuité.",
          "meta": "Maillage · Fabric · Sauvegarde · Continuité"
        }
      ]
    },
    "offensive": {
      "tag": "02 / Services",
      "title": "Sécurité offensive.",
      "lede": "Revue de sécurité indépendante de ce que vous livrez et de ce dont vous dépendez.",
      "cards": [
        {
          "num": "04",
          "title": "Recherche de vulnérabilités.",
          "body": "Recherche indépendante et divulgation coordonnée. Six CVE publiées depuis 2019.",
          "meta": "MSRC · NVD · fenêtre de 90 jours"
        },
        {
          "num": "05",
          "title": "Tests d'intrusion.",
          "body": "Mandats web, réseau, infonuagique et interne. Constats documentés avec reproductions, sévérité et correctifs. Retestés après remédiation.",
          "meta": "Web · Réseau · Infonuagique · Interne"
        },
        {
          "num": "06",
          "title": "Sécurité de l'IA et des agents.",
          "body": "Tests adverses pour les modèles de langage et les systèmes agentiques : injection de prompt, détournement d'outils, limites des politiques, revue comportementale.",
          "meta": "LLM · Agents · Évaluations · Garde-fous"
        }
      ]
    }
  },
  "stats": [
    { "label": "Public / CVE", "unit": "constats publiés" },
    { "label": "Fournisseurs / touchés", "unit": "Microsoft · Pulse · 3CX" },
    { "label": "Sommet / CVSS", "unit": "CVE-2019-9972" },
    { "label": "Divulgation / période", "unit": "recherche, en continu" }
  ],
  "marquee": "nous testons ce qui vous teste en retour",
  "cta": { "stamp": "★ Depuis 2019", "title": "Contactez-nous." },
  "footer": { "left": "ATOMSTAR", "right": "★ FONDÉE EN 2019 · SOUS OBSERVATION" }
}
```

- [ ] **Step 2: Create `src/fr.njk`**

```njk
---
layout: layout.njk
permalink: /fr/index.html
lang: fr
other: en
---
```

- [ ] **Step 3: Prove the parity guard actually fires**

Do not assume it works — demonstrate it.

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('src/_data/fr.json'));delete j.hero.eyebrow;fs.writeFileSync('/tmp/fr-broken.json',JSON.stringify(j,null,2))"
cp src/_data/fr.json /tmp/fr-good.json && cp /tmp/fr-broken.json src/_data/fr.json
npx @11ty/eleventy
```

Expected: build FAILS with `Copy key parity failed — missing in fr: hero.eyebrow`.

Restore and rebuild:

```bash
cp /tmp/fr-good.json src/_data/fr.json
npx @11ty/eleventy
```

Expected: build succeeds.

- [ ] **Step 4: Check both pages render**

```bash
grep -c 'nous testons ce qui vous teste' _site/fr/index.html   # expect 4 (marquee repeats)
grep -c 'we test the things that test you back' _site/en/index.html  # expect 4
grep -o 'lang="[a-z]*"' _site/fr/index.html | head -1           # expect lang="fr"
```

- [ ] **Step 5: Commit**

```bash
git add src/_data/fr.json src/fr.njk
git commit -m "Add French copy and the /fr/ page

Parity guard verified by removing a key and confirming the build fails.
French copy is a draft pending native-speaker review."
```

---

### Task 4: Language shim at `/`

**Files:**
- Create: `src/index.njk`

**Interfaces:**
- Consumes: `/en/` and `/fr/` from Tasks 2–3; the `atomstar-lang` localStorage key written by Task 2's switch handler.
- Produces: `/` — the `x-default` hreflang target in Task 5.

- [ ] **Step 1: Create `src/index.njk`**

Standalone page, no layout — it must be tiny and paint instantly.

```njk
---
permalink: /index.html
eleventyExcludeFromCollections: true
---
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ATOMSTAR</title>
<meta name="theme-color" content="#0a0a0a" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="canonical" href="{{ site.origin }}/" />
<link rel="alternate" hreflang="en" href="{{ site.origin }}/en/" />
<link rel="alternate" hreflang="fr" href="{{ site.origin }}/fr/" />
<link rel="alternate" hreflang="x-default" href="{{ site.origin }}/" />
<style>
  html, body { margin: 0; height: 100%; background: #0a0a0a; color: #efe7d6;
    font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .wrap { height: 100%; display: flex; flex-direction: column; gap: 20px;
    align-items: center; justify-content: center; }
  .brand { color: #ff7a1a; letter-spacing: 0.25em; font-size: 13px; text-transform: uppercase; }
  .choice { display: flex; gap: 18px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; }
  .choice a { color: #efe7d6; text-decoration: none; border-bottom: 1px solid rgba(239,231,214,0.3); padding-bottom: 2px; }
  .choice a:hover { color: #ff7a1a; border-color: #ff7a1a; }
</style>
<script>
  (() => {
    const langs = ['en', 'fr'];
    let target;
    try {
      const stored = localStorage.getItem('atomstar-lang');
      if (langs.includes(stored)) target = stored;
    } catch (e) {}
    if (!target) {
      const prefs = navigator.languages || [navigator.language || 'en'];
      target = Array.prototype.some.call(prefs, (l) => String(l).toLowerCase().startsWith('fr')) ? 'fr' : 'en';
    }
    // replace() so the shim takes no history entry and cannot trap Back.
    location.replace('/' + target + '/');
  })();
</script>
</head>
<body>
<div class="wrap">
  <div class="brand">ATOMSTAR</div>
  <noscript>
    <div class="choice">
      <a href="/fr/" hreflang="fr">Français</a>
      <a href="/en/" hreflang="en">English</a>
    </div>
  </noscript>
</div>
</body>
</html>
```

The visible `<noscript>` block is what keeps non-JS crawlers and clients from hitting a dead end.

- [ ] **Step 2: Verify the three shim states**

Build, then serve and check each case in a browser:

```bash
npx @11ty/eleventy && npx @11ty/eleventy --serve
```

| State | Setup | Expected |
|---|---|---|
| No preference, French browser | `localStorage.removeItem('atomstar-lang')`, browser language `fr-CA` | lands on `/fr/` |
| No preference, English browser | cleared, browser language `en-CA` | lands on `/en/` |
| Stored preference wins | `localStorage.setItem('atomstar-lang','en')`, browser `fr-CA` | lands on `/en/` |

Also confirm: from `/en/`, clicking **FR** reaches `/fr/`, and a later visit to `/` then lands on `/fr/`. Confirm neither `/en/` nor `/fr/` redirects on its own — no loop.

- [ ] **Step 3: Confirm noscript content survives the build**

```bash
grep -c 'noscript' _site/index.html   # expect 2 (open + close)
grep -c 'Français' _site/index.html   # expect 1
```

- [ ] **Step 4: Commit**

```bash
git add src/index.njk
git commit -m "Add language-detecting shim at /

Honours a stored choice first, then navigator.languages. Uses
location.replace so Back is not trapped, and carries visible noscript
links so JS-less clients and crawlers reach real content."
```

---

### Task 5: Metadata and the Open Graph image

The site currently has no `description`, no `og:`, and no `twitter:` tags at all.

**Files:**
- Modify: `src/_includes/layout.njk` (head section)
- Create: `tools/og-image.mjs`, `src/og.png`
- Modify: `package.json` (add `sharp` devDependency)

**Interfaces:**
- Consumes: `t.meta.*` from Tasks 2–3, `site.origin` from `site.json`.

- [ ] **Step 1: Add the metadata block to `layout.njk`'s head**

Insert after the existing `<link rel="icon">` line:

```njk
<meta name="description" content="{{ t.meta.description }}" />
<link rel="canonical" href="{{ site.origin }}/{{ lang }}/" />
<link rel="alternate" hreflang="en" href="{{ site.origin }}/en/" />
<link rel="alternate" hreflang="fr" href="{{ site.origin }}/fr/" />
<link rel="alternate" hreflang="x-default" href="{{ site.origin }}/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="{{ t.meta.ogTitle }}" />
<meta property="og:description" content="{{ t.meta.ogDescription }}" />
<meta property="og:url" content="{{ site.origin }}/{{ lang }}/" />
<meta property="og:image" content="{{ site.origin }}/og.png" />
<meta property="og:locale" content="{{ 'en_CA' if lang == 'en' else 'fr_CA' }}" />
<meta property="og:locale:alternate" content="{{ 'fr_CA' if lang == 'en' else 'en_CA' }}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{{ t.meta.ogTitle }}" />
<meta name="twitter:description" content="{{ t.meta.ogDescription }}" />
<meta name="twitter:image" content="{{ site.origin }}/og.png" />
```

- [ ] **Step 2: Add `sharp` and write the image generator**

```bash
npm install --save-dev sharp
```

Create `tools/og-image.mjs`. Run once; the PNG is committed so CI needs no image toolchain.

```js
import sharp from "sharp";

// Brand: carbon #0a0a0a, phosphor #ff7a1a, bone #efe7d6.
// No translatable prose — og:title/description carry the language.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(600 270)" fill="none" stroke="#ff7a1a" stroke-width="3">
    <circle r="138"/>
    <ellipse rx="120" ry="42"/>
    <ellipse rx="120" ry="42" transform="rotate(60)"/>
    <ellipse rx="120" ry="42" transform="rotate(-60)"/>
    <circle r="24" fill="#ff7a1a"/>
  </g>
  <text x="600" y="520" text-anchor="middle" fill="#efe7d6"
        font-family="monospace" font-size="60" letter-spacing="14">ATOMSTAR</text>
  <text x="600" y="572" text-anchor="middle" fill="rgba(239,231,214,0.5)"
        font-family="monospace" font-size="22" letter-spacing="6">EST. 2019</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("src/og.png");
console.log("wrote src/og.png");
```

- [ ] **Step 3: Generate and verify the image**

```bash
node tools/og-image.mjs
node -e "const s=require('sharp');s('src/og.png').metadata().then(m=>console.log(m.width,m.height,m.format))"
```

Expected: `1200 630 png`

- [ ] **Step 4: Rebuild and verify the tags landed in both languages**

```bash
npx @11ty/eleventy
grep -c 'og:' _site/en/index.html    # expect 7
grep -c 'og:' _site/fr/index.html    # expect 7
grep -o 'og:locale" content="[a-z_A-Z]*"' _site/fr/index.html   # expect fr_CA
grep -o 'hreflang="[a-z-]*"' _site/en/index.html | sort -u      # expect en, fr, x-default
test -f _site/og.png && echo "og.png published"
```

- [ ] **Step 5: Commit**

```bash
git add src/_includes/layout.njk tools/og-image.mjs src/og.png package.json package-lock.json
git commit -m "Add search and social metadata

Adds description, canonical, hreflang, Open Graph and Twitter card tags
per language. The site previously had none, so shared links rendered as
bare URLs. og.png is generated once and committed so CI needs no image
toolchain."
```

---

### Task 6: Switch the CI build step

**Files:**
- Modify: `.github/workflows/jekyll-gh-pages.yml`

- [ ] **Step 1: Replace only the build job's steps**

Keep the `on`, `permissions`, `concurrency` and `deploy` blocks exactly as they are. Replace the `build` job's `steps` with:

```yaml
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build with Eleventy
        run: npx @11ty/eleventy
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./_site
```

Also update the workflow `name:` from `Deploy Jekyll with GitHub Pages dependencies preinstalled` to `Deploy site to GitHub Pages`, and rename the file:

```bash
git mv .github/workflows/jekyll-gh-pages.yml .github/workflows/pages.yml
```

- [ ] **Step 2: Verify `npm ci` works from a clean state**

`npm ci` fails without a lockfile — confirm one is committed.

```bash
test -f package-lock.json && echo "lockfile present"
rm -rf node_modules && npm ci && npx @11ty/eleventy
```

Expected: clean install, successful build.

- [ ] **Step 3: Confirm the published tree is complete**

```bash
ls _site _site/en _site/fr
for f in CNAME favicon.svg og.png .nojekyll index.html en/index.html fr/index.html; do
  test -e "_site/$f" && echo "ok  $f" || echo "MISSING  $f"
done
cat _site/CNAME    # expect atomstar.com
```

Every line must read `ok`. A missing `CNAME` would drop the custom domain on deploy.

- [ ] **Step 4: Commit**

```bash
git add -A .github/workflows
git commit -m "Build with Eleventy in CI

Replaces the Jekyll build step. configure-pages, upload-pages-artifact
and deploy-pages keep their versions and inputs, and output is still
_site/, so the deploy path is unchanged."
```

---

### Task 7: Final verification and handoff

**Files:** none modified.

- [ ] **Step 1: Full clean build from scratch**

```bash
rm -rf node_modules _site && npm ci && npm test && npx @11ty/eleventy
```

Expected: tests pass, build succeeds, no warnings about missing data.

- [ ] **Step 2: Confirm no forbidden strings survive**

```bash
grep -rn 'EST. 2026\|LAB · v0.1\|47.6062' _site/ && echo "FAIL — stale string still present" || echo "ok — all three fixes applied"
```

Expected: `ok`.

- [ ] **Step 3: Re-run the render diff as a final regression check**

```bash
node tools/render-diff.mjs test/fixtures/baseline-index.html _site/en/index.html
```

Review the output one last time. Only the intended deltas — three content fixes, the language switch, and the metadata block — may appear.

- [ ] **Step 4: Interactive checks in both languages**

Run `npx @11ty/eleventy --serve` and confirm on **both** `/en/` and `/fr/`:

| Check | Expected |
|---|---|
| Theme toggle | Flips DARK/LIGHT, survives reload via `atomstar-theme` |
| `#work` anchor | Nav link scrolls to the services section |
| `#engage` anchor | Nav link scrolls to the CTA section |
| CTA link | `mailto:contact@atomstar.com`, not a mangled or empty href |
| Stat count-up | Numbers animate to 6, 3, 8.8; fourth reads `2019 → 26` |
| Marquee | Scrolls without a visible seam |

The theme toggle and count-up scripts moved verbatim, so a failure here means
the transcription in Task 2 dropped or altered something.

```bash
grep -o 'href="mailto:[^"]*"' _site/en/index.html _site/fr/index.html
```

Expected: `mailto:contact@atomstar.com` in both.

- [ ] **Step 5: Hand the French copy to the operator for review**

The French in `src/_data/fr.json` is a draft. Surface it for native-speaker review and apply corrections before merge. Flag specifically: `L'infrastructure comme code.` (Task 3) — the anglicism *infrastructure as code* is common in Quebec tech usage and the operator may prefer it untranslated.

- [ ] **Step 6: Push the branch and open a PR**

```bash
git push -u origin feat/bilingual-site
```

Open a **draft** PR against `main`. Do not merge without the French review from Step 4.

Note: the `gh` CLI's active account is `jpineault-bt`, but this repo is `atomstar-inc/atomstar.github.io` and the other authenticated account is `nitbx`. Confirm the right account before pushing or the push will fail or misattribute:

```bash
gh auth status
```

- [ ] **Step 7: After merge only — delete the stale branch**

```bash
git push origin --delete copilot/create-landing-page-atomtar
```

This is the abandoned early landing page superseded by everything since. Do this only after the PR merges.
