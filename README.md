# Food Recall Wall

A public-data dashboard that treats active U.S. food recalls like a Wall Street market wall: bigger public-health and geographic impacts get bigger visual weight, while a blocky U.S. map shows where recalls are distributed.

## What it does

- Pulls **FDA food enforcement reports** from openFDA.
- Pulls **USDA FSIS recalls and public health alerts** from the official FSIS Recall API.
- Normalizes both sources into one recall model.
- Scores recalls by hazard class, geographic scope, recency, and active status.
- Displays high-impact recalls as larger cards over an intentionally blocky U.S. state grid.
- Shows nationwide recalls in a dedicated national rail.
- Filters by product category and agency.
- Sorts by impact, newest, or geographic scope.
- Tracks simple state-count changes in browser local storage to surface a growth vector when an existing recall expands geographically.
- Opens detailed recall information and links back to the official agency source.

## Data sources

### FDA

openFDA Food Enforcement API

`https://api.fda.gov/food/enforcement.json`

The FDA food enforcement dataset comes from the FDA Recall Enterprise System and is updated periodically/weekly by openFDA.

### USDA FSIS

FSIS Recall API

`https://www.fsis.usda.gov/fsis/api/recall/v/1`

FSIS describes this as real-time access to recall and public-health-alert information.

## Impact score

The dashboard uses a **visualization score, not an official government risk metric**.

Current weighting:

- Class I / High: 100 base points
- Class II: 62 base points
- Class III: 34 base points
- Nationwide distribution: +45
- State count: up to +38
- Newly initiated recalls: up to +30
- Active status: +12

The score exists only to determine ranking and visual size on the wall.

## Growth vectors

Government recall feeds do not provide a stock-like time series of geographic expansion. Food Recall Wall therefore records the state count it saw for each recall in the visitor's browser. If that same recall later contains more parsed states, the wall displays a positive state-growth vector.

A later version should move snapshots to a scheduled GitHub Action or database so growth is global rather than browser-local.

## Run locally

This project has no build step.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

Because this is a static site, it can be hosted directly with GitHub Pages:

1. In **Settings → Pages**, choose **Deploy from a branch**.
2. Select `main` and `/ (root)`.

## Known limitations

- FDA's `distribution_pattern` is free text, so state parsing is necessarily heuristic.
- FSIS field names have changed historically; the normalizer intentionally accepts several common variants.
- Browser CORS policies or temporary agency outages can cause one feed to fail. The app is designed to render whichever source remains available.
- Product categories are inferred from recall text, not supplied as a single shared taxonomy by the two agencies.
- The growth vector becomes more meaningful after repeated snapshots.

## Next milestones

1. Add a scheduled ingestion job that writes normalized recall snapshots to `/data/recalls.json`.
2. Compute true day-over-day geographic and product-count changes.
3. Parse affected retailers and establishment numbers.
4. Add state drill-down and ZIP-radius relevance.
5. Add search for brand, product, pathogen, allergen, and lot code.
6. Add shareable recall cards and state-specific URLs.
7. Add a 7-day / 30-day recall heat history mode.

## Disclaimer

Food Recall Wall is an independent visualization of public government data. It is not affiliated with FDA or USDA. Always verify product names, dates, lot codes, establishment numbers, UPCs, and instructions with the issuing agency before making food-safety decisions.

## License

MIT
