# Assets Directory

This directory contains assets required for building and distributing StateSet Desktop.

## Required Icons

Before building for distribution, you need to create the following icon files:

### macOS
- `icon.icns` - macOS app icon (required)
  - Must be at least 512x512 pixels
  - Use the `iconutil` command to create from a .iconset folder

- `tray-icon-template.png` - System tray icon (16x16 or 22x22)
  - Use "Template" naming for automatic dark/light mode support
  - Should be black with transparency

### Windows
- `icon.ico` - Windows app icon (required)
  - Should include multiple sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
  - Use tools like ImageMagick or online converters

- `tray-icon.png` - System tray icon (16x16)

### Linux
- `icon.png` - App icon (512x512 recommended)
- `tray-icon.png` - System tray icon (22x22 recommended)

## Creating Icons

### From a 1024x1024 PNG source:

```bash
# macOS - Create .icns
mkdir icon.iconset
sips -z 16 16 source.png --out icon.iconset/icon_16x16.png
sips -z 32 32 source.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 source.png --out icon.iconset/icon_32x32.png
sips -z 64 64 source.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 source.png --out icon.iconset/icon_128x128.png
sips -z 256 256 source.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 source.png --out icon.iconset/icon_256x256.png
sips -z 512 512 source.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 source.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 source.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset

# Windows - Create .ico (requires ImageMagick)
convert source.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Linux - Just use the PNG
cp source.png icon.png
```

## Other Assets

- `entitlements.mac.plist` - macOS entitlements for code signing (already provided)

## Notes

- Icon files are not tracked in git to avoid large binary files
- The build process will fail if required icons are missing
- For development, the build will use placeholder icons if available
