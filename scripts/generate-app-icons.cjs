const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

function generateLogoSvg(size = 1024) {
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 1024;

  const trackRadius = 358 * scale;

  // Top text: GROWING FOOD FOR SOULS
  const topText = 'GROWING FOOD FOR SOULS';
  const topTotalAngle = 108; // degrees
  const topStep = topTotalAngle / (topText.length - 1);
  const topStartAngle = -90 - (topTotalAngle / 2);

  let topLettersSvg = '';
  for (let i = 0; i < topText.length; i++) {
    const char = topText[i];
    if (char === ' ') continue;
    const angle = topStartAngle + i * topStep;
    topLettersSvg += `    <text x="${cx}" y="${cy - trackRadius + (12 * scale)}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${42 * scale}" fill="#0f6834" text-anchor="middle" transform="rotate(${angle + 90}, ${cx}, ${cy})">${char}</text>\n`;
  }

  // Bottom text: PURE BIOTIC FARM (upright along bottom arc)
  const bottomText = 'PURE BIOTIC FARM';
  const bottomTotalAngle = 82; // degrees
  const bottomStep = bottomTotalAngle / (bottomText.length - 1);
  const bottomStartAngle = 90 + (bottomTotalAngle / 2);

  let bottomLettersSvg = '';
  for (let i = 0; i < bottomText.length; i++) {
    const char = bottomText[i];
    if (char === ' ') continue;
    const angle = bottomStartAngle - i * bottomStep;
    bottomLettersSvg += `    <text x="${cx}" y="${cy + trackRadius + (12 * scale)}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${42 * scale}" fill="#0f6834" text-anchor="middle" transform="rotate(${angle - 90}, ${cx}, ${cy})">${char}</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <clipPath id="circleClip">
      <circle cx="${cx}" cy="${cy}" r="${398 * scale}" />
    </clipPath>
  </defs>

  <!-- Pure White Background with padding for PWA icon safety and square edge protection -->
  <rect width="${size}" height="${size}" fill="#ffffff"/>

  <!-- Outer lime accent ring -->
  <circle cx="${cx}" cy="${cy}" r="${410 * scale}" fill="none" stroke="#8dc63f" stroke-width="${8 * scale}"/>

  <!-- Main dark green ring -->
  <circle cx="${cx}" cy="${cy}" r="${396 * scale}" fill="#ffffff" stroke="#0f6834" stroke-width="${18 * scale}"/>

  <!-- Inner dark green ring boundary -->
  <circle cx="${cx}" cy="${cy}" r="${320 * scale}" fill="#ffffff" stroke="#0f6834" stroke-width="${12 * scale}"/>

  <!-- Arched Text Top & Bottom -->
${topLettersSvg}
${bottomLettersSvg}
  <!-- Foliage Top (Leaves) -->
  <g transform="translate(${cx}, ${cy - 120 * scale}) scale(${1.45 * scale})">
    <!-- Center lime vertical leaf bud -->
    <path d="M0,-95 C16,-65 16,-30 0,0 C-16,-30 -16,-65 0,-95 Z" fill="#8dc63f"/>
    <path d="M0,-95 L0,0" stroke="#0f6834" stroke-width="3"/>

    <!-- Two main V-angled dark green leaves -->
    <path d="M-6,-15 C-45,-75 -85,-55 -45,-5 C-25,-5 -12,-10 -6,-15 Z" fill="#0f6834"/>
    <path d="M-55,-40 L-18,-8" stroke="#8dc63f" stroke-width="4"/>

    <path d="M6,-15 C45,-75 85,-55 45,-5 C25,-5 12,-10 6,-15 Z" fill="#0f6834"/>
    <path d="M55,-40 L18,-8" stroke="#8dc63f" stroke-width="4"/>

    <!-- Flanking horizontal dark green leaves -->
    <path d="M-35,2 C-95,-25 -115,10 -75,32 C-50,28 -38,15 -35,2 Z" fill="#0f6834"/>
    <path d="M-80,-2 L-42,12" stroke="#8dc63f" stroke-width="3.5"/>

    <path d="M35,2 C95,-25 115,10 75,32 C50,28 38,15 35,2 Z" fill="#0f6834"/>
    <path d="M80,-2 L42,12" stroke="#8dc63f" stroke-width="3.5"/>

    <!-- Small lime accent leaf buds -->
    <ellipse cx="-48" cy="-42" rx="10" ry="20" transform="rotate(-40, -48, -42)" fill="#8dc63f"/>
    <ellipse cx="48" cy="-42" rx="10" ry="20" transform="rotate(40, 48, -42)" fill="#8dc63f"/>
  </g>

  <!-- Foliage Bottom (Leaves inverted) -->
  <g transform="translate(${cx}, ${cy + 120 * scale}) scale(${1.45 * scale}, ${-1.45 * scale})">
    <!-- Center lime vertical leaf bud -->
    <path d="M0,-95 C16,-65 16,-30 0,0 C-16,-30 -16,-65 0,-95 Z" fill="#8dc63f"/>
    <path d="M0,-95 L0,0" stroke="#0f6834" stroke-width="3"/>

    <!-- Two main V-angled dark green leaves -->
    <path d="M-6,-15 C-45,-75 -85,-55 -45,-5 C-25,-5 -12,-10 -6,-15 Z" fill="#0f6834"/>
    <path d="M-55,-40 L-18,-8" stroke="#8dc63f" stroke-width="4"/>

    <path d="M6,-15 C45,-75 85,-55 45,-5 C25,-5 12,-10 6,-15 Z" fill="#0f6834"/>
    <path d="M55,-40 L18,-8" stroke="#8dc63f" stroke-width="4"/>

    <!-- Flanking horizontal dark green leaves -->
    <path d="M-35,2 C-95,-25 -115,10 -75,32 C-50,28 -38,15 -35,2 Z" fill="#0f6834"/>
    <path d="M-80,-2 L-42,12" stroke="#8dc63f" stroke-width="3.5"/>

    <path d="M35,2 C95,-25 115,10 75,32 C50,28 38,15 35,2 Z" fill="#0f6834"/>
    <path d="M80,-2 L42,12" stroke="#8dc63f" stroke-width="3.5"/>

    <!-- Small lime accent leaf buds -->
    <ellipse cx="-48" cy="-42" rx="10" ry="20" transform="rotate(-40, -48, -42)" fill="#8dc63f"/>
    <ellipse cx="48" cy="-42" rx="10" ry="20" transform="rotate(40, 48, -42)" fill="#8dc63f"/>
  </g>

  <!-- Center Horizontal Banner Background -->
  <!-- Clips inside the dark green circle so ends meet the ring flush -->
  <g clip-path="url(#circleClip)">
    <rect x="${cx - 410 * scale}" y="${cy - 92 * scale}" width="${820 * scale}" height="${184 * scale}" fill="#d3e8b4"/>
    <line x1="${cx - 410 * scale}" y1="${cy - 92 * scale}" x2="${cx + 410 * scale}" y2="${cy - 92 * scale}" stroke="#0f6834" stroke-width="${16 * scale}"/>
    <line x1="${cx - 410 * scale}" y1="${cy + 92 * scale}" x2="${cx + 410 * scale}" y2="${cy + 92 * scale}" stroke="#0f6834" stroke-width="${16 * scale}"/>
  </g>

  <!-- Center Banner Text: FRESH N LOCAL CO. -->
  <g transform="translate(${cx}, ${cy})">
    <text x="0" y="${32 * scale}" font-family="'Arial Narrow', Arial, sans-serif" font-weight="900" font-size="${96 * scale}" fill="#0f6834" text-anchor="middle" letter-spacing="${5 * scale}" transform="scale(0.85, 1)">FRESH N LOCAL CO.</text>
  </g>
</svg>`;
}

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const svgContent = generateLogoSvg(1024);

  // Write SVGs
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), svgContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), svgContent, 'utf8');
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent, 'utf8');
  console.log('Saved vector SVGs');

  const svgBuffer = Buffer.from(svgContent);

  // 1. icon-512.png (512x512)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // 2. icon-192.png (192x192)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 3. icon.png (512x512)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon.png'));
  console.log('Generated icon.png');

  // 4. apple-touch-icon.png (180x180 for iOS home screen shortcuts)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 5. favicon-32x32.png
  await sharp(svgBuffer)
    .resize(32, 32)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  // 6. favicon-16x16.png
  await sharp(svgBuffer)
    .resize(16, 16)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  // 7. favicon.ico (64x64 PNG format, fully supported as modern ICO)
  await sharp(svgBuffer)
    .resize(64, 64)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Generated favicon.ico');

  // Cleanup test files
  const testFiles = [
    'test_badge.png', 'test_badge.svg',
    'test_badge2.png', 'test_badge2.svg',
    'test_badge3.png', 'test_badge3.svg',
    'test_badge4.png', 'test_badge4.svg',
    'test_view.png', 'test_rot.png'
  ];
  for (const f of testFiles) {
    const p = path.join(publicDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('Cleaned up test files');
  console.log('All app icons generated successfully!');
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
