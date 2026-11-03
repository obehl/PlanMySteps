# 👣 Plan My Steps

**Plan walks that help you explore your neighbourhood, on streets that are actually walkable.**

Tell it your mood, the errands you'd like to fit in and your step goal. Plan My Steps builds a loop
from your door that takes in those errands, prefers quiet lanes, parks and lively
shopping streets, and stays off the arterial roads that make walking in Indian cities stressful.
Then open the walk in Google Maps for turn-by-turn navigation.

## How it works

1. **Street data** comes from [OpenStreetMap](https://www.openstreetmap.org) via the Overpass API:
   every street, footpath, shop, café, temple and park within ~1–3 km of the start pin.
2. **Every street gets a walkability score from 0 to 1** (`src/score.js`). In India the road *class*
   is the strongest signal we have:

   | Road type | Score | Why |
   |---|---|---|
   | pedestrian / footway / living street | 0.95–1.0 | made for walking |
   | residential lanes, colony roads, gullies | 0.8 | quiet, slow traffic, even without footpaths |
   | service / unclassified | 0.6–0.65 | usually fine |
   | tertiary | 0.45 | getting busy |
   | secondary | 0.28 | busy, often no usable footpath |
   | primary / trunk | 0.05–0.15 | fast, wide, hard to cross |
   | motorway / private / `foot=no` | excluded | never routed |

   Adjustments: + footpath tagged (a big bonus on major roads), + designated for walking, + lit;
   − no footpath, − unpaved, − speed limit ≥ 60, − 4+ lanes, − roundabouts.
3. **Mood changes how much each factor counts** (`src/tasks.js` → `MOODS`):
   - 😌 **Calm**: a street scoring 0.2 "feels" 4× longer, and park paths get a strong bonus.
   - 🧭 **Curious**: prefers streets lined with shops and cafés.
   - ✅ **Get things done**: closer to the shortest route, while still dodging the worst roads.
4. **The planner** (`src/planner.js`) picks the best place for each errand, orders them, then
   adds scenic detour points (parks or lively streets, depending on mood) until the loop is
   within ~15% of your step goal. It penalises walking back along the same street, so you get a loop, not an out-and-back.
5. **Open in Google Maps**: the loop is pinned with up to 9 via-points so Google follows it closely.

Toggle **"Show walkability of every street"** to see the score of each street. This is the
fastest way to check the scores against your own knowledge of a neighbourhood.

## Why not Google's data for walkability?

Google doesn't expose pedestrian footfall, and the Maps Platform terms forbid scraping
or deriving datasets from its traffic layer or Street View. Traffic is also a poor signal: a
jammed market street can be lovely to walk, and a free-flowing 6-lane road is the dangerous one.
So we use open data now and, over time, **our own walkers' ratings** (the 👍/👎 after each walk), which
will become the best walkability dataset for Indian streets.

## Run it locally

No build step and no API keys.

```bash
python3 -m http.server 8080      # or: npm start
# open http://localhost:8080  (or http://localhost:8080/?start=12.9719,77.6412 to drop a pin)
npm test                          # planner and scoring tests (Node 20+)
```

## Deploy (free)

Pushing to `main` deploys to **GitHub Pages** via `.github/workflows/pages.yml`.
One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

## Sponsored stops (monetisation)

Cafés, bakeries, restaurants and shops can become **partner stops**: `data/sponsors.json`.

```json
{ "id": "unique-id", "name": "Café Name", "category": "chai",
  "lat": 12.97, "lon": 77.64, "offer": "10% off for walkers" }
```

`category` is one of the errand keys in `src/tasks.js` (`chai`, `bakery`, `snack`, `groceries`, …).
The two entries shipped now are **demo placeholders** (marked `"demo": true`); replace them with real partners.

Ground rules built into the planner, which protect the product's trustworthiness:
- A sponsor only wins a stop when it is **comparable in walking effort** (`SPONSOR_PREFERENCE = 0.75`,
  so up to ~33% further). It never pulls a walk onto a hostile road.
- Sponsored stops are **always labelled** "Sponsored".
- Sponsors only appear for errands the walker chose.

Business models to explore: monthly "featured stop" listing per neighbourhood; pay per walker
visit, tracked through in-app offer redemption; sponsored themed trails ("Malleshwaram breakfast walk");
corporate step challenges; walkability reports for RWAs, developers and municipal bodies.

## Roadmap

- [ ] Backend for ratings, so 👍/👎 and GPS traces feed back into street scores
- [ ] Heat and time of day: shade preference, and avoid noon walks in summer
- [ ] Air quality (e.g. Google Air Quality API) to suggest when and where to walk
- [ ] Street-level imagery from Mapillary (open license) to detect footpaths, broken pavements and encroachments
- [ ] Safety signals: lighting at night, women-safety ratings
- [ ] Saved walks, streaks, step-count sync (Google Fit / Apple Health)
- [ ] Sponsor dashboard and offer redemption
- [ ] Mobile app wrapper (PWA first)

## Project layout

```
index.html, styles.css   UI (Leaflet map + panel)
src/app.js               UI wiring
src/osm.js               Overpass + Nominatim fetches
src/graph.js             builds the walkable street graph (+ parks, POIs)
src/score.js             per-street walkability score
src/tasks.js             errands → OSM tags, moods → weights
src/route.js             Dijkstra with mood-aware costs
src/planner.js           loop planning, sponsors, Google Maps link
data/sponsors.json       partner stops
test/                    node:test suite on a synthetic street grid
```

Map data © OpenStreetMap contributors (ODbL).
