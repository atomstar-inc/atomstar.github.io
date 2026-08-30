import sharp from "sharp";

// Brand: carbon #0a0a0a, phosphor #ff7a1a, bone #efe7d6.
// No translatable prose — og:title/description carry the language.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(600 260)" fill="none" stroke="#ff7a1a" stroke-width="3">
    <circle r="132"/>
    <ellipse rx="115" ry="40"/>
    <ellipse rx="115" ry="40" transform="rotate(60)"/>
    <ellipse rx="115" ry="40" transform="rotate(-60)"/>
    <circle r="22" fill="#ff7a1a"/>
  </g>
  <text x="600" y="500" text-anchor="middle" fill="#efe7d6"
        font-family="monospace" font-size="58" letter-spacing="14">ATOMSTAR</text>
  <text x="600" y="556" text-anchor="middle" fill="#8c877c"
        font-family="monospace" font-size="21" letter-spacing="6">EST. 2019</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("src/og.png");
console.log("wrote src/og.png");
