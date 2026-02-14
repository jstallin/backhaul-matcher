# Haul Monitor - Chrome Extension

Import loads from DAT and other load boards into Haul Monitor for backhaul matching.

## Installation (Development)

1. **Generate Icons** (one-time setup)

   The extension needs PNG icons at 16x16, 32x32, 48x48, and 128x128 sizes.

   Option A - Use an online converter:
   - Go to https://cloudconvert.com/webp-to-png
   - Upload `../public/haul-monitor-icon.png` (it's actually WebP format)
   - Convert to PNG
   - Resize to required sizes using any image editor
   - Save as `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`

   Option B - Use ImageMagick (if installed):
   ```bash
   cd icons
   convert ../public/haul-monitor-icon.png -resize 128x128 icon128.png
   convert ../public/haul-monitor-icon.png -resize 48x48 icon48.png
   convert ../public/haul-monitor-icon.png -resize 32x32 icon32.png
   convert ../public/haul-monitor-icon.png -resize 16x16 icon16.png
   ```

2. **Load Extension in Chrome**

   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select this `chrome-extension` folder
   - The extension should appear with the Haul Monitor icon

3. **Test with Mock DAT Page**

   - Open `mock-dat/index.html` in Chrome
   - You should see "Send to Haul Monitor" buttons on each load row
   - Click a button to import a load
   - Click the extension icon to see imported loads

## Files

- `manifest.json` - Extension configuration
- `content.js` - Injected into load board pages, adds import buttons
- `content-styles.css` - Styles for injected UI elements
- `background.js` - Service worker for message handling
- `popup.html/js` - Extension popup UI
- `welcome.html` - Welcome page shown on install
- `mock-dat/` - Mock DAT page for testing

## Supported Load Boards

- DAT Power (power.dat.com)
- DAT One (one.dat.com)
- Mock DAT page (for testing)

## How It Works

1. Content script detects when user is on a supported load board
2. Adds "Send to Haul Monitor" buttons to each load row
3. When clicked, parses load data from the row
4. Stores load in Chrome storage
5. User can open Haul Monitor to see/use imported loads

## Development

To modify the extension:

1. Make changes to the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Haul Monitor extension
4. Reload the load board page to see changes
