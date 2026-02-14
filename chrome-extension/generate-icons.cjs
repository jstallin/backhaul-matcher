#!/usr/bin/env node
/**
 * Generate PNG icons from SVG for Chrome extension
 *
 * Usage: node generate-icons.js
 *
 * Requires: npm install sharp
 * Or run: npx sharp-cli -i icons/icon.svg -o icons/icon128.png -w 128 -h 128
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Installing...');
  const { execSync } = require('child_process');
  execSync('npm install sharp', { stdio: 'inherit' });
  sharp = require('sharp');
}

const sizes = [16, 32, 48, 128];
const svgPath = path.join(__dirname, 'icons', 'icon.svg');
const svgContent = fs.readFileSync(svgPath);

async function generateIcons() {
  console.log('Generating icons...');

  for (const size of sizes) {
    const outputPath = path.join(__dirname, 'icons', `icon${size}.png`);

    await sharp(svgContent)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Created icon${size}.png`);
  }

  console.log('Done!');
}

generateIcons().catch(console.error);
