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
