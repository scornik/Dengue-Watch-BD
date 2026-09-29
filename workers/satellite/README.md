# satellite worker (M7): weekly ward environmental risk

Each week this job computes one row per ward in `ward_risk`. The row holds the inputs, the
score and a green/yellow/orange/red level.

> **This is environmental risk, not confirmed cases.** It ranks wards by conditions that
> favour *Aedes* breeding, so inspectors and volunteers know where to look first. It does not
> say where dengue is, and the satellites cannot see a single tyre, bucket or AC tray. Show the
> label "environmental risk, not confirmed cases" wherever this layer is shown.

```
python -m satellite.main [--week YYYY-MM-DD|YYYY-Www] [--dry-run] [--skip-imagery] [--skip-weather] [--weights PATH] [-v]
```

- `--week` accepts any date or ISO week and snaps it to that week's Monday (Asia/Dhaka). The
  default is the current week.
- Every input uses data from **before** Monday 00:00 Asia/Dhaka, so a re-run gives the same
  result.
- `--dry-run` prints the rows as JSON. It still reads wards, reports and cases from the DB.

| Exit code | Meaning |
| --- | --- |
| 0 | ok |
| 2 | No wards with geometry |
| 3 | DB write failed |
| 4 | Bad configuration |
| other non-zero | STAC or network failure (Northflank marks the run failed and retries) |

## Method

| Column | Source | How |
| --- | --- | --- |
| `ndvi` | Sentinel-2 L2A (`sentinel-2-l2a`, Planetary Computer) | (B08 − B04) / (B08 + B04) |
| `ndwi` | Sentinel-2 L2A | **MNDWI**: (B03 − B11) / (B03 + B11). Stored in the `ndwi` column |
| `ndbi` | Sentinel-2 L2A | (B11 − B08) / (B11 + B08) |
| `lst_c` | Landsat 8/9 C2 L2 (`landsat-c2-l2`) | `lwir11` (ST_B10) × 0.00341802 + 149.0 = K, then − 273.15 = °C |
| `rain_14d_mm` | Open-Meteo | Sum of daily `precipitation_sum` over the 14 days before the week, at each ward's point-on-surface |
| `report_density` | `reports` | Reports per km² in the last 28 days, excluding `ai_label = 'not_relevant'` |
| `cases_area` | `case_counts` | Sum of admissions over the last 14 days for the ward's city corporation (DNCC or DSCC) |

**Imagery**

- The job searches Planetary Computer's STAC catalog for scenes with less than
  `MAX_CLOUD_COVER`% cloud in the `LOOKBACK_DAYS` window. It keeps the `STAC_MAX_ITEMS` least
  cloudy scenes and loads them with **odc-stac** (dask-backed) in UTM 46N: 20 m for
  Sentinel-2, 30 m for Landsat.
- Sentinel-2 cloud mask: pixels are kept only when SCL is 4 (vegetation), 5 (not vegetated),
  6 (water) or 7 (unclassified). SCL 0, 1, 2, 3 and 8–11 are dropped: no data, defective,
  shadow, cloud, cirrus, snow.
- Sentinel-2 offset: for processing baseline ≥ 04.00, the `BOA_ADD_OFFSET` of −1000 is applied
  before scaling by 1e-4.
- Landsat cloud mask: a pixel is dropped when any of these `qa_pixel` bits is set: 0 (fill),
  1 (dilated cloud), 3 (cloud), 4 (cloud shadow).
- Indices are computed per scene, then **median-composited** over time.

**Zonal means.** Each ward polygon is reprojected to the raster CRS and rasterised with
`rasterio.features.geometry_mask`, using pixel centres. A ward too small to contain a pixel
centre falls back to `all_touched`. The job then takes the mean of the finite pixels. This is
its own small implementation; no GPL zonal-stats dependency.

**Score** (`satellite/score.py`, pure and unit-tested):

1. Each input is z-scored across all wards for that week, using the population standard
   deviation.
2. A missing value (no clear pixels, API failure, no data) gets z = 0, the city average, and
   is left out of the mean and standard deviation.
3. If the standard deviation is 0, every z is 0. z-scores are clipped to ±3.
4. `score = Σ wᵢ·zᵢ / Σ|wᵢ|`: a weighted mean of z-scores, so thresholds read roughly in
   standard deviations.
5. Sign convention: a positive weight means a higher value raises risk.
   - **NDVI has a negative weight**, because more vegetation means lower risk.
   - MNDWI, NDBI, LST, rain, report density and cases have positive weights.
6. Levels are set in `weights.yaml`, in one of two modes:
   - **`thresholds`** (the default): score < −0.5 is green, < 0.25 is yellow, < 1.0 is orange,
     and anything higher is red.
   - **`percentiles`**: the same cut-offs, applied to each ward's mid-rank percentile within
     the city that week (defaults 50/75/90%). This mode always produces some red wards, so use
     it for relative targeting, not alarm.
7. `weights.yaml` → `version` is written to `ward_risk.method_version`. Bump it whenever
   weights or thresholds change.

### Basis and inspiration

- **Dhaka satellite dengue study.** Satellite-derived heat islands (Landsat LST), low
  vegetation (NDVI), water indices and dense built-up land matched higher 2019 dengue
  incidence across Dhaka: <https://pmc.ncbi.nlm.nih.gov/articles/PMC10001735/>. The inputs and
  the signs of the weights follow that study. The weight *magnitudes* are our own first guess.
- **InfoDengue / AlertTools** (Fiocruz/FGV, Brazil). The four-colour alert levels and the idea
  of publishing a transparent, versioned rule set come from InfoDengue's AlertTools R package,
  which is CC0. **We borrowed the ideas only; no code was copied.** InfoDengue's levels are
  driven by case counts and climate thresholds. Ours rank environmental risk.

### Limits (read before using the map)

- **Satellites cannot see container breeding sites.** Tyres, buckets, AC trays, flower tubs
  and construction pits are far smaller than a pixel. That is what citizen reports are for.
- **Resolution.** Pixels are 10–20 m for Sentinel-2 and 30 m (resampled from 100 m thermal)
  for Landsat. The values are ward-level averages, never street-level.
- **Clouds.** During the monsoon (June–October), cloud-free scenes can be rare even with a
  60-day window. Missing inputs become neutral (z = 0), so scores then rely more on rain,
  reports and cases. Check `NULL`s in `ward_risk`.
- **Ranking, not cases.** The score is relative to the other wards in the same week. A red ward
  is "among the highest environmental risk in Dhaka this week", not a confirmed outbreak.
- **`cases_area` is city-corporation-wide.** DGHS does not publish ward-level cases, so it only
  shifts all DNCC wards against all DSCC wards.
- **Report density is biased** toward wards where the app is promoted.
- **The weights are uncalibrated.** They must be fitted against DSCC/DNCC larval survey data
  (house index / Breteau index, KoboToolbox) before any operational use. Until then, publish
  the method and weights alongside the map.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | none | Postgres connection string, used for reading wards/reports/cases and writing `ward_risk` |
| `LOOKBACK_DAYS` | no | `60` | Imagery composite window before the week start |
| `MAX_CLOUD_COVER` | no | `40` | Maximum scene cloud cover (%) |
| `STAC_MAX_ITEMS` | no | `30` | Least-cloudy scenes kept per collection (bounds memory) |
| `STAC_URL` | no | Planetary Computer STAC v1 | STAC API root |
| `TARGET_CRS` | no | `EPSG:32646` | Working CRS (UTM 46N) |
| `S2_RESOLUTION_M` / `LANDSAT_RESOLUTION_M` | no | `20` / `30` | Load resolution in metres |
| `OPEN_METEO_URL` | no | `https://api.open-meteo.com/v1/forecast` | Used for the recent past (last ~80 days) |
| `OPEN_METEO_ARCHIVE_URL` | no | `https://archive-api.open-meteo.com/v1/archive` | Used for older back-fills |
| `CITY_LAT` / `CITY_LON` | no | `23.8103` / `90.4125` | Fallback rainfall point |
| `WEIGHTS_PATH` | no | bundled `weights.yaml` | Scoring config |
| `HTTP_TIMEOUT` | no | `60` | Open-Meteo timeout in seconds |
| `LOG_LEVEL` | no | `INFO` | Python log level |

No API keys are needed: Planetary Computer signs asset URLs anonymously, and Open-Meteo is
keyless.

## Schedule (Northflank cron)

The schedule is `0 21 * * 0` UTC, which is Monday 03:00 Asia/Dhaka. The command is
`python -m satellite.main`. Give the job about 4 GB RAM. See `northflank.json`.

## Development

```
uv run --extra dev pytest        # DB tests skipped unless DATABASE_URL is set (PostGIS test also needs PostGIS)
uv run --extra dev ruff check . && uv run --extra dev ruff format --check .
```

The tests use synthetic rasters, a fake STAC catalog and a mocked Open-Meteo, so they need no
network. DB tests use `TEMP` tables, so they are safe against a dev database.
