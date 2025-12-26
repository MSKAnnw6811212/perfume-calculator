# Pixel & Pour - Artisan Perfume Calculator
**Version 1.1.0 (Professional Edition)**

Welcome to **Pixel & Pour**. This is a secure, offline-capable Progressive Web App (PWA) designed for artisan perfumers to formulate, scale batches, and check safety compliance.

## 1. Quick Start (Installation)
This software runs in your browser but can be installed as a native app. It works **100% offline**.

* **iOS (iPhone/iPad):**
    1.  Open `index.html` (or your hosted link) in Safari.
    2.  Tap the **Share** button (square with arrow).
    3.  Scroll down and tap **"Add to Home Screen"**.
* **Android:**
    1.  Open in Chrome.
    2.  Tap the menu (3 dots) -> **"Install App"** or **"Add to Home Screen"**.
* **Desktop (Mac/PC):**
    1.  Open in Chrome or Edge.
    2.  Click the small **"Install"** icon on the right side of the URL bar.

## 2. Importing Your Inventory (CSV)
The app comes with a "Starter" database of ~180 common materials. To add your own inventory in bulk, use the **"Import Inventory CSV"** button at the bottom of the Simple Calculator.

### CSV Format Requirements
Create a spreadsheet with the following headers in the first row:
* `Name` (Required)
* `CAS` (**Required** for IFRA/EU safety checks)
* `Density` (Optional, defaults to 0.85)
* `Price` (Optional, numeric value only)
* `Notes` (Optional)

**Example CSV:**
```csv
Name,CAS,Density,Price,Notes
"Bergamot Oil",8007-75-8,0.87,0.35,"Fresh citrus top note"
"Iso E Super",54464-57-2,0.96,0.15,"Velvety amber"
