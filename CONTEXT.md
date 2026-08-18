# DPDC Electricity Bill Calculator

## Overview
Residential electricity bill calculator for Dhaka Power Distribution Company (DPDC) LT-A tariff.

## Tech Stack
- HTML5, CSS3, vanilla JavaScript (no build step)
- Single-page app with tabs

## Files
- `index.html` - UI structure with Calculator and History tabs
- `script.js` - Bill calculation logic, tab switching, and history rendering
- `styles.css` - Responsive styling, grid layout, card UI
- `bills.txt` - Historical bill records (CSV: Year, Month, Previous Reading, Present Reading, Total Reading, Bill)

## Features
- Forward mode: Units (kWh) → Bill with VAT
- Reverse mode: Bill → Estimated units
- Lifeline tariff (৳4.63/unit) for ≤50 units
- Progressive slab rates above 50 units
- 5% VAT on energy charge
- History tab showing past bills

## Notes
- Bills are embedded directly in `script.js` to avoid fetch/CORS issues when opening the file directly in a browser.
