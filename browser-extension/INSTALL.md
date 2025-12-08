# Installation Guide - HyveWyre for VanillaSoft

## Quick Install (5 minutes)

### Step 1: Download the Extension

1. Navigate to the `browser-extension` folder in your file system
2. Make sure all files are present:
   - ✅ manifest.json
   - ✅ popup.html
   - ✅ popup.js
   - ✅ content.js
   - ✅ content.css
   - ✅ background.js
   - ✅ icons/ folder (with icon files)

### Step 2: Install in Chrome

1. Open **Chrome** browser
2. Type `chrome://extensions/` in the address bar
3. Enable **"Developer mode"** using the toggle in the top-right corner
4. Click **"Load unpacked"** button
5. Navigate to and select the `browser-extension` folder
6. Click **"Select Folder"**
7. The HyveWyre extension should now appear in your extensions list

### Step 3: Install in Microsoft Edge

1. Open **Edge** browser
2. Type `edge://extensions/` in the address bar
3. Enable **"Developer mode"** using the toggle in the left sidebar
4. Click **"Load unpacked"** button
5. Navigate to and select the `browser-extension` folder
6. Click **"Select Folder"**
7. The HyveWyre extension should now appear in your extensions list

### Step 4: Get Your API Key

1. Open [HyveWyre](https://trippdrip-v8-sprint1-ouusl0ocj-tripptraps-projects.vercel.app)
2. Log in to your account
3. Click your profile icon → **Settings**
4. Scroll to the **API & Integrations** section
5. Click **"Generate API Key"** (or copy existing key)
6. **Save this key** - you'll need it in the next step

### Step 5: Configure the Extension

1. Click the HyveWyre extension icon in your browser toolbar
   - If you don't see it, click the puzzle piece icon and pin HyveWyre
2. The extension popup will open
3. Paste your API key into the **"HyveWyre API Key"** field
4. Click **"Save API Key"**
5. You should see: ✅ **"Connected to HyveWyre"**

## Usage

### Import a Lead from VanillaSoft

1. **Open VanillaSoft** and navigate to a lead
2. **Click the HyveWyre extension icon** in your toolbar
3. **Review the extracted data** in the popup
4. **Click "Import Lead to HyveWyre"**
5. Wait for the success message
6. The lead is now in HyveWyre and ready for SMS campaigns!

### Verify Import

1. Open HyveWyre
2. Go to the **Leads** page
3. Your imported lead should appear at the top
4. Source will show: **"VanillaSoft Extension"**

## Troubleshooting

### Extension Won't Load

**Problem**: Error when loading unpacked extension

**Solutions**:
- Make sure you selected the correct folder (browser-extension)
- Verify all files are present
- Check that icons folder exists with PNG files
- Try restarting Chrome/Edge

### Can't Find Extension Icon

**Problem**: Don't see HyveWyre in toolbar

**Solutions**:
- Click the puzzle piece icon (🧩) in Chrome
- Find "HyveWyre for VanillaSoft"
- Click the pin icon to add to toolbar

### "No Lead Data Found"

**Problem**: Extension can't extract lead information

**Solutions**:
- Make sure you're on a VanillaSoft **lead detail page** (not the list)
- Wait for the page to fully load
- Try clicking the "Refresh VanillaSoft Page" button
- Some custom VanillaSoft implementations may use different layouts

### "Invalid API Key"

**Problem**: Can't connect to HyveWyre

**Solutions**:
- Double-check you copied the entire API key
- Generate a new API key in HyveWyre Settings
- Make sure there are no extra spaces when pasting
- Verify you're logged into HyveWyre

### Lead Imports But Data is Wrong

**Problem**: Fields are empty or incorrect

**Solutions**:
- The extension uses intelligent extraction but VanillaSoft customizations may affect this
- Manually verify data in the preview before importing
- You can edit leads in HyveWyre after import

## Creating Icons (For Developers)

The extension needs icons in 4 sizes. You can:

**Option 1: Use an online tool**
1. Go to https://icon.kitchen/
2. Upload your logo
3. Select "Chrome Extension" preset
4. Download and extract to `icons/` folder

**Option 2: Use an image editor**
Create PNG files:
- icon16.png (16x16 pixels)
- icon32.png (32x32 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

**Recommended Design**:
- Use HyveWyre logo or "H" letter mark
- Blue/purple gradient background (#3b82f6 to #8b5cf6)
- White symbol/text
- Simple and recognizable at small sizes

## Updating the Extension

1. Make changes to the extension files
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Find "HyveWyre for VanillaSoft"
4. Click the **refresh icon** (🔄)
5. Changes are now live

## Uninstalling

1. Go to `chrome://extensions/` or `edge://extensions/`
2. Find "HyveWyre for VanillaSoft"
3. Click **"Remove"**
4. Confirm removal

Your API key will be deleted from browser storage.

## Support

Need help?
- **Email**: support@hyvewyre.com
- **Live Chat**: Available in HyveWyre dashboard
- **Documentation**: https://hyvewyre.com/docs/extensions

## Security Notes

- ✅ Extension only runs on VanillaSoft pages
- ✅ API key is stored securely in encrypted browser storage
- ✅ All API calls use HTTPS encryption
- ✅ No data is sent to third parties
- ✅ Open source - you can review all code

---

**Version**: 1.0.0
**Last Updated**: 2025
**Compatibility**: Chrome 88+, Edge 88+
