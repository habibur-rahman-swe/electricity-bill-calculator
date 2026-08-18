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
- `bills.js` - Historical bill records (`BILLS` array)

## Features
- Forward mode: Units (kWh) → Bill with VAT
- Reverse mode: Bill → Estimated units
- Lifeline tariff (৳4.63/unit) for ≤50 units
- Progressive slab rates above 50 units
- 5% VAT on energy charge
- History tab reads `bills.js` (works when opening `index.html` as a file)
- Last-24-month table plus monthly bars and a running-total (sum) line, with increase/decrease trend

## Notes
- Add a new month by appending an object to `BILLS` in `bills.js`, then refresh and open History.
- Each record: `year`, `month`, `previous`, `present`, `total`, `bill`.
