const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const sourceImage = path.join(publicDir, 'firestore_check.png');

  if (!fs.existsSync(sourceImage)) {
    console.error('Source image firestore_check.png not found!');
    process.exit(1);
  }

  // Target canvas: 1024 x 1024 white background
  // Safe zone diameter is 80% (820px) to prevent any clipping on Android / iOS
  const targetBadgeSize = 820;
  const padding = Math.round((1024 - targetBadgeSize) / 2); // 102px padding

  const resizedBadge = await sharp(sourceImage)
    .resize(targetBadgeSize, targetBadgeSize, { fit: 'contain' })
    .toBuffer();

  const masterPaddedBuffer = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite([
    {
      input: resizedBadge,
      top: padding,
      left: padding
    }
  ])
  .png()
  .toBuffer();

  // 1. icon-512.png (512x512)
  await sharp(masterPaddedBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Generated icon-512.png');

  // 2. icon-192.png (192x192)
  await sharp(masterPaddedBuffer)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Generated icon-192.png');

  // 3. icon.png (512x512)
  await sharp(masterPaddedBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon.png'));
  console.log('Generated icon.png');

  // 4. apple-touch-icon.png (180x180 for iOS home screen shortcuts)
  await sharp(masterPaddedBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 5. favicon-32x32.png
  await sharp(masterPaddedBuffer)
    .resize(32, 32)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  // 6. favicon-16x16.png
  await sharp(masterPaddedBuffer)
    .resize(16, 16)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  // 7. favicon.ico (64x64)
  await sharp(masterPaddedBuffer)
    .resize(64, 64)
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Generated favicon.ico');

  // Cleanup test composite
  const testComp = path.join(publicDir, 'test_composite.png');
  if (fs.existsSync(testComp)) fs.unlinkSync(testComp);

  console.log('All PWA and install app icons successfully regenerated from authentic master asset!');
}

main().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
