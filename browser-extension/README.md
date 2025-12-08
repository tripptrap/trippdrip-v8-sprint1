# HyveWyre for VanillaSoft - Browser Extension

A Chrome/Edge browser extension that allows you to import leads from VanillaSoft directly into HyveWyre for automated SMS follow-up campaigns.

## Features

- **One-Click Lead Import**: Extract lead data from VanillaSoft and import to HyveWyre
- **Automatic Data Extraction**: Intelligently finds and extracts contact information
- **Secure API Integration**: Uses encrypted API keys for authentication
- **Real-Time Validation**: Verifies connection to HyveWyre before import
- **Visual Indicator**: Shows when the extension is active on VanillaSoft pages

## Installation

### For Chrome

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `browser-extension` folder
6. The extension icon will appear in your browser toolbar

### For Edge

1. Download or clone this repository
2. Open Edge and navigate to `edge://extensions/`
3. Enable "Developer mode" in the left sidebar
4. Click "Load unpacked"
5. Select the `browser-extension` folder
6. The extension icon will appear in your browser toolbar

## Setup

### 1. Get Your HyveWyre API Key

1. Log in to [HyveWyre](https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app)
2. Navigate to Settings
3. Find or generate your API key
4. Copy the API key

### 2. Configure the Extension

1. Click the HyveWyre extension icon in your toolbar
2. Enter your API key in the popup
3. Click "Save API Key"
4. You should see "Connected to HyveWyre" status

## Usage

### Importing a Single Lead

1. Navigate to a lead page in VanillaSoft
2. Click the HyveWyre extension icon
3. Review the extracted lead data in the popup
4. Click "Import Lead to HyveWyre"
5. The lead will be added to your HyveWyre account

### What Data is Extracted?

The extension automatically extracts:
- First Name
- Last Name
- Phone Number (formatted as E.164)
- Email Address
- Company Name
- State
- Additional notes (if available)

## Troubleshooting

### "No lead data found"
- Make sure you're on a VanillaSoft lead detail page
- The page must be fully loaded before extraction
- Try refreshing the VanillaSoft page

### "Invalid API key"
- Verify your API key is correct
- Generate a new API key in HyveWyre settings
- Make sure you're connected to the internet

### "Connection error"
- Check your internet connection
- Verify HyveWyre is accessible
- Try reloading the extension

## Privacy & Security

- API keys are stored securely using Chrome's encrypted storage
- Lead data is sent directly to HyveWyre via HTTPS
- No data is stored on external servers
- The extension only activates on VanillaSoft pages

## Support

For issues or feature requests:
- Email: support@hyvewyre.com
- Documentation: https://hyvewyre.com/docs
- Report bugs: https://github.com/hyvewyre/extension/issues

## Version History

### 1.0.0 (Current)
- Initial release
- Basic lead extraction and import
- API key management
- VanillaSoft page detection
- Visual indicator

## Development

### File Structure

```
browser-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup UI
├── popup.js              # Popup logic and API calls
├── content.js            # VanillaSoft page data extraction
├── content.css           # Styles for VanillaSoft pages
├── background.js         # Background service worker
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # This file
```

### Building for Production

1. Update version in `manifest.json`
2. Create icons (16x16, 32x32, 48x48, 128x128)
3. Test in both Chrome and Edge
4. Zip the extension folder
5. Submit to Chrome Web Store and/or Edge Add-ons

## License

Copyright © 2025 HyveWyre. All rights reserved.
