# River Forest Reassessment Explorer

Static civic data explorer for River Forest, Illinois property reassessments.

Live site: <https://jvanderberg.github.io/riverforest-reassessment-codex/>

The app compares 2026 and 2025 estimated market values, maps records with Cook
County parcel and address-point data, and exposes filters, search, summary
tables, source provenance, and shareable URLs.

## Development

```sh
npm install
npm run extract
npm run dev
```

## Checks

```sh
npm run check
npm run build
```

GitHub Pages uses `npm run build:site`, which builds from the committed static
data in `public/data/` so deployments do not depend on live upstream API
availability.

## Data

The extractor writes static files to `public/data/` from Cook County public data
services. Market values are estimated from Cook County assessed values by
dividing by the assessment level for each property class.
