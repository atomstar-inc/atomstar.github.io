# atomstar.com — bilingual rebuild

Date: 2026-08-29
Status: approved design, pending implementation plan

## Context

`atomstar.com` is a single hand-written `index.html` (~700 lines, styles and
script inline) served from GitHub Pages via `actions/jekyll-build-pages`, with
`CNAME` pointing the apex at the repo and Cloudflare in front. The local
checkout matches production exactly apart from Cloudflare's injected
email-obfuscation and challenge scripts.

The page began life at `/lab/` and was promoted to `/` in commit `6c36c86`,
which deleted `lab/index.html` but carried its footer string along.

Atomstar operates from Quebec and its clients work in French. The site is
English-only, which is the largest gap: a francophone prospect searching in
French finds nothing, because no French text exists to index.

## Goals

1. Serve the site in French and English, each at a real, crawlable URL.
2. Keep the design in exactly one place so the two languages cannot drift.
3. Add the social and search metadata the site currently lacks entirely.
4. Fix the verified content defects.

## Non-goals

- Self-hosting on Incus. The untouched boilerplate at
  `~/Projects/www.atomstar.com` is a separate piece of work; GitHub Pages plus
  Cloudflare is working and is not being migrated here.
- New pages or new copy beyond the existing one-pager.
- Analytics, contact forms, or a CMS.

## Decisions

All four were made by the operator on 2026-08-29:

| Decision | Choice | Note |
|---|---|---|
| Bilingual strategy | Data-driven build step | Chosen over two static copies and over a JS string swap |
| Root URL behaviour | `/` auto-detects; content at `/en/` and `/fr/` | Requires a client-side shim — see below |
| Build engine | Eleventy | Chosen over Jekyll |
| Founding year | 2019 | `EST. 2026` was wrong |
| Hero coordinate | Removed | Not replaced with a real latitude |

### Why Eleventy rather than Jekyll

The operator's machine has stock macOS Ruby 2.6.10, no Jekyll, and no Docker or
Podman. Jekyll would require installing a modern Ruby toolchain or editing the
live company site with no local preview. Node 26 and npx are already present.

The deploy path is deliberately left alone: `actions/configure-pages`,
`actions/upload-pages-artifact` and `actions/deploy-pages` keep their current
versions and configuration. Only the build step changes, and it emits to
`_site/` exactly as the Jekyll step did.

## Architecture

Eleventy v3, Nunjucks templates, input `src/`, output `_site/`.

```
src/_data/site.json         domain, contact email, CVE ticker, stat values
src/_data/en.json           English copy
src/_data/fr.json           French copy
src/_includes/layout.njk    page shell: head, inline styles, inline scripts
src/_includes/sections/     hero, marquee, services, stats, cta, footer
src/en.njk       → /en/     lang: en
src/fr.njk       → /fr/     lang: fr
src/index.njk    → /        language shim
src/favicon.svg             passthrough
src/og.png                  passthrough, 1200x630
src/CNAME                   passthrough
src/.nojekyll               passthrough
eleventy.config.js
package.json / package-lock.json
docs/superpowers/specs/     outside src/, never published
```

`.nojekyll` is carried into the output as a zero-cost safety net, matching the
intent recorded in commit `3b6dc8d`, even though nothing in the new pipeline
invokes Jekyll.

### Copy data model

`en.json` and `fr.json` mirror each other key-for-key. Keys cover: nav labels,
theme-toggle labels, language-switch label, hero eyebrow and sub, the two
service group headings (tag, title, lede), six service cards (title, body,
meta), four stat labels and units, the marquee headline, the CTA stamp,
heading and link text, and the two footer strings.

Language-neutral content stays in `site.json` and is not duplicated: the CVE
ticker entries, the numeric stat values and their `data-count` attributes, and
the contact email.

The ticker is a judgement call worth naming: CVE identifiers, vendor names and
CVSS scores are international, and `XSS` and `XXE` are acronyms in both
languages — but `COMMAND INJECTION` and `CODE INJECTION` are English. They are
left untranslated because the ticker reads as machine output rather than prose.
If the operator disagrees, the vulnerability-class label moves into a small
per-language map; the structure supports it without rework.

### Drift guard

`eleventy.config.js` compares the key sets of `en.json` and `fr.json` at build
time, recursing into nested objects and arrays, and throws if they differ in
either direction. A missing French string fails the build rather than shipping
an English fragment on the French page. This assertion is the single thing that
makes the build-step approach worth its complexity over two static files.

### The root shim

`/` is a real, brand-styled HTML page, not a blank redirect. Its script:

1. Reads `localStorage['atomstar-lang']`. If it holds `en` or `fr`, calls
   `location.replace()` to that language and stops.
2. Otherwise walks `navigator.languages`, choosing `fr` if any entry begins with
   `fr`, else `en`, and calls `location.replace()`.

`location.replace` is used rather than `location.href` so the shim does not
occupy a history entry and cannot trap the back button.

`<noscript>` contains visible *Français* and *English* links, so crawlers that
do not execute JavaScript, and clients with scripting disabled, reach real
content instead of a dead end.

The shim runs **only** at `/`. Neither `/en/` nor `/fr/` performs any automatic
redirection, so no redirect loop is reachable. The language switcher on those
pages writes `localStorage['atomstar-lang']` before navigating, so a deliberate
choice survives and step 1 above honours it on any later visit to `/`.

### Metadata

Per language: `<html lang>`, `<title>`, `<meta name="description">`, and a
canonical link pointing at that page's own URL.

All three pages carry the same `hreflang` set: `en` → `/en/`, `fr` → `/fr/`,
`x-default` → `/`.

Open Graph: `og:type`, `og:title`, `og:description`, `og:url`, `og:image`,
`og:locale` (`en_CA` / `fr_CA`) and `og:locale:alternate`. Twitter:
`twitter:card` set to `summary_large_image`.

`og.png` is a single shared 1200x630 image — the atom mark and wordmark on the
carbon background. It carries no translatable prose, so one image serves both
languages; the language-specific text lives in `og:title` and
`og:description`. It is generated once by `tools/og-image.mjs` (Sharp, a
devDependency, rasterising a brand SVG) and the resulting PNG is committed, so
the CI build needs no image toolchain.

## Content fixes

| Defect | Fix |
|---|---|
| Footer `★ EST. 2026` contradicts CTA `★ Since 2019` | Footer becomes `★ EST. 2019 · OPERATING UNDER OBSERVATION` |
| Footer `ATOMSTAR // LAB · v0.1` — leftover from `/lab/` | Becomes `ATOMSTAR` |
| Hero eyebrow `LIVE TRANSMISSION · 47.6062° N` (Seattle) | Becomes `LIVE TRANSMISSION`, translated per language |
| No `description`, `og:`, or `twitter:` tags anywhere | Added as specified above |
| Stale `origin/copilot/create-landing-page-atomtar` | Deleted after merge |

The CTA stamp keeps `★ Since 2019`. It and the footer now agree on the year;
the repetition is a deliberate brand motif, not the defect being fixed.

## Translation

French copy is drafted as part of implementation and reviewed by the operator,
a native speaker, before merge. Machine-flavoured French is a worse outcome
than English-only, so this review is a gate, not a formality.

## Verification

1. `npx @11ty/eleventy` completes without error.
2. The key-parity assertion fails the build when a key is removed from
   `fr.json` — proven by temporarily removing one, not assumed.
3. **Render diff.** `_site/en/index.html` is compared against the current
   production `index.html`, normalised for whitespace. The only differences may
   be the intended ones: added metadata, the language switcher, the three
   content fixes, and asset paths. This proves the refactor into templates
   changed nothing else about a working page.
4. `npx @11ty/eleventy --serve`: both languages render; the theme toggle still
   persists via `localStorage['atomstar-theme']`; the language switcher moves
   between `/en/` and `/fr/` and persists; `#work` and `#engage` anchors resolve
   on both pages; the `mailto:` is intact.
5. Shim behaviour is checked in three states: no stored preference with a
   French browser locale, no stored preference with an English locale, and a
   stored preference opposite to the browser locale.
6. `_site/` contains `CNAME`, `favicon.svg`, `og.png` and `.nojekyll` at its
   root.

## Risks

**Changing the deploy mechanism on the live company site.** The mitigation is
that the three Pages actions and their inputs are untouched; only the build
step is replaced, emitting to the same directory. The full output is built and
inspected locally before the branch merges.

**Crawlers and the root shim.** A JavaScript redirect is weaker than a server
302, which GitHub Pages cannot provide. Mitigated by `hreflang x-default` on
`/`, the `<noscript>` links, and both language pages being directly reachable
and independently canonical.

**Template refactor silently altering the design.** Mitigated by verification
step 3, which is the reason that step exists.

## Sequencing

Deleting the stale `copilot/create-landing-page-atomtar` branch is in scope but
happens after the merge, not during the build work.
