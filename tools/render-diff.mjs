import fs from "node:fs";

const norm = (s) =>
  s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("\n");

const [a, b] = process.argv.slice(2);
const A = norm(fs.readFileSync(a, "utf8")).split("\n");
const B = norm(fs.readFileSync(b, "utf8")).split("\n");

const onlyA = A.filter((l) => !B.includes(l));
const onlyB = B.filter((l) => !A.includes(l));

console.log(`--- only in ${a} (${onlyA.length}) ---`);
onlyA.forEach((l) => console.log("  " + l));
console.log(`--- only in ${b} (${onlyB.length}) ---`);
onlyB.forEach((l) => console.log("  " + l));
