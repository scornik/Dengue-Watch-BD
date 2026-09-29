# DengueWatch BD — Product & Technical Spec

As of 2026-09-29 · Author: Mohammad Ashik Elahi (Hakeemify)

## 1. Summary

Build DengueWatch BD (working name): a Bangla-first web app where citizens photo-report possible Aedes breeding sites. AI pre-screens each report, and city corporation ward teams get a queue that they must close with a "cleared" photo. A public map adds context layers: a satellite-derived risk score per ward, official case counts, and weather.

**Why now:** As of 29 Sep 2026, Bangladesh has recorded [239 dengue deaths this year](https://daijiworld.com/news/newsDisplay?newsID=1327105) and 77,672 hospitalisations, and September is the worst month so far. [DSCC reports Aedes larvae in 60% of surveyed homes](https://tob.news/dengue-larvae-found-in-60-dhaka-south-homes-dscc/), with AC drip water and under-construction buildings named as major sources.

**Strategy:** [Mosquito Alert already runs in Bangladesh](https://www.gavi.org/vaccineswork/bangladesh-has-dengue-fighting-mobile-app) through icddr,b, in Bangla, with an expert panel from DGHS, IEDCR, DNCC and DSCC. But it had only 227 participants by mid-April 2026, focuses on mosquito photos rather than breeding sites, and has no enforcement loop. We build the missing piece: breeding-site reports routed to ward action, with public follow-through. We approach icddr,b as a partner, not a competitor.

**Satellites cannot see container-sized breeding sites.** They are used only to rank wards by risk, so inspectors and volunteers know where to look first.

## 2. Research: what already exists

No existing project matches a Vercel + Supabase stack, so none is worth forking whole. Each one contributes a proven method, dataset or UX pattern instead.

| Project | What it does | Stack / license | Use for us |
| --- | --- | --- | --- |
| [Mosquito Alert](https://github.com/Mosquito-Alert/mosquito_alert) (Spain; in BD via icddr,b) | Citizens photo mosquitoes; entomologists validate; public map | Django + mobile app; GPL-3.0 | Partner and link out. Borrow report taxonomy and expert-validation workflow |
| [InfoDengue / AlertaDengue](https://github.com/AlertaDengue/AlertaDengue) (Fiocruz + FGV, Brazil) | Early warning for every Brazilian municipality from case, climate and social data | Django, PostGIS, Celery; GPL-3.0. [AlertTools](https://rdrr.io/github/AlertaDengue/AlertTools) R package is CC0 | Port the alert-level logic (green/yellow/orange/red) from the CC0 package |
| [GLOBE Mosquito Habitat Mapper](https://pmc.ncbi.nlm.nih.gov/articles/PMC9316649/) (NASA) | Citizens report standing water, check for larvae, then are asked to dump or cover it | Mobile app; [data free for any use](https://observer.globe.gov/get-data/mosquito-habitat-data) | Copy the "report, then eliminate" step |
| [Ushahidi](https://en.wikipedia.org/wiki/Ushahidi) | General crowdsourced crisis map with moderation | Laravel PHP; AGPL | Reference for moderation/triage only |
| [Rio de Janeiro breeding-site study](https://www.nature.com/articles/s41598-024-67914-w) (2024) | YOLOv5 on street view + satellite; tanks, loose tires, plastic bags, potted plants, drains tracked larva counts | Research method | Blueprint for the phase 3 detector and class list |
| [UAV breeding-site dataset](https://www.sciencedirect.com/science/article/pii/S0001706X24001165) (2024) | YOLOv7 finds potential breeding sites in drone images | Dataset + model | Only if a drone partner appears |
| [Mosquito_Breeding_Sites_Detector](https://github.com/pcrete/Mosquito_Breeding_Sites_Detector) | Street-view pipeline for breeding sites | Older Caffe/SegNet | Reference only |
| [Dhaka satellite dengue study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10001735/) | Heat islands, low vegetation, dense settlement matched higher 2019 incidence | Landsat LST, NDVI, NDWI, land cover | Basis for ward risk score |
| [project-geosentinel](https://github.com/acuestamd/project-geosentinel) | Live Leaflet outbreak map refreshed by GitHub Actions | Static site + scheduled jobs | Pattern for cheap scheduled ingestion |

Dhaka already collects larval surveys digitally: [DSCC's current survey](https://www.tbsnews.net/bangladesh/dscc-launches-12-day-aedes-mosquito-larvae-survey-city-1556501) covers 2,250 households across 75 wards via KoboToolbox. If shared, this is the best ground truth for calibrating the risk score.

## 3. Fork vs build

Build a new, thin app. Reuse methods and data, not codebases. Porting ideas and CC0 logic keeps the license choice open.

| Piece | Decision | Why |
| --- | --- | --- |
| Citizen reporting app | Build (Next.js PWA) | Installs from a link; suits Facebook/WhatsApp sharing |
| Report flow UX | GLOBE "report, then eliminate" + Mosquito Alert categories | Proven with citizen scientists |
| Moderation + ward queue | Build on Supabase | Simple state machine |
| Alert levels | Port InfoDengue AlertTools logic to SQL/TS | CC0, 10 years of field use |
| Satellite risk | Python job based on the Dhaka study method | Free Sentinel-2/Landsat |
| Photo AI | Tiered, near-zero cost (see §5.3) | Avoid per-photo token costs |
| Map | MapLibre GL + free vector tiles | No per-view billing |
| Project license | AGPL-3.0 | Keeps forks open; switch to MIT if a partner requires it |

## 4. Product spec

**The MVP succeeds when** one pilot ward clears most verified reports within 72 hours and the public can see it happen.

### 4.1 Users

| Role | Can do | Sign-in |
| --- | --- | --- |
| Citizen | Report, track own reports, confirm a site was cleared | Anonymous, optional phone OTP |
| Volunteer moderator | Verify, merge duplicates, reject spam | Invited |
| Ward inspector | See ward queue, mark assigned, upload "after" photo to close | Invited, tied to ward |
| Ward / zone admin | Assign inspectors, see stats, download weekly digest | Invited |
| Researcher | Read-only anonymised export | API key |

### 4.2 MVP features

1. **Report in under 30 seconds.** Camera photo, auto GPS with a draggable pin, site type (tire, bucket/drum, AC drip, construction site, rooftop, flower pot/tub, drain, other), larvae seen (yes/no/not sure), "I cleaned it myself" checkbox, optional note. Works offline and uploads later.
2. **AI pre-screen.** Tiered and near-free (see §5.3). Faces and number plates are blurred before public display.
3. **Duplicate merge.** Reports within 25 m and 7 days of each other join one "site".
4. **Public map.** Sites coloured by status, a ward risk layer, filters by type/date. Public pins are snapped to a ~50 m grid; inspectors see exact points.
5. **Ward action queue.** Statuses: new → verified → assigned → cleared / not found / rejected. "Cleared" requires an on-site after photo.
6. **Feedback to reporters.** Web push on status change; SMS in phase 3.
7. **Ward scorecard.** Public median time-to-clear and % cleared within 72 h.
8. **Open data.** Anonymised CSV and GeoJSON export.
9. **Bangla first,** English second, large tap targets, works on low-end Android over 3G.

### 4.3 Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P0 | Reporting, on-device AI screen, public map, moderation | 100 real reports from volunteers |
| P1 | Ward queue, inspector app, scorecards; one pilot ward | Pilot ward clears 70% of verified reports within 72 h for 4 weeks |
| P2 | Satellite ward risk, case + weather layers, alert levels, weekly digest | Risk layer published for all DNCC and DSCC wards |
| P3 | Own YOLO detector trained on moderated photos, SMS reporting, Mosquito Alert cross-links, more cities | Detector beats the baseline on held-out Dhaka photos |

## 5. Architecture

Vercel serves one Next.js app for citizens and staff. Supabase holds all data, auth, photos and light server logic. Northflank runs only the scheduled Python jobs.

```
Citizens (PWA) ─┐                       ┌─> Vision API (optional, capped)
Staff ──────────┴─> Next.js on Vercel ──┤
                         │ RLS          │
                         v              │
   Supabase: Auth · Postgres+PostGIS · Storage · Edge Functions
                         ^
                         │ writes ward_risk, case_counts
   Northflank cron: satellite risk job (weekly) · case data job (daily)
                         ^
   Free open data: Planetary Computer STAC · Open-Meteo · DGHS bulletin
```

### 5.1 Data model (Postgres + PostGIS)

| Table | Key columns |
| --- | --- |
| `wards` | id, city_corp (DNCC/DSCC), ward_no, name_bn, name_en, geom (MultiPolygon) |
| `reports` | id, reporter_id?, photo_path, geom (Point), accuracy_m, site_type, larvae_seen, self_cleaned, note, ai_label, ai_score, ai_source, site_id, ward_id, created_at |
| `sites` | id, geom, ward_id, status, first_reported_at, verified_at, assigned_to, cleared_at, report_count |
| `site_events` | id, site_id, actor_id, from_status, to_status, photo_path?, note, created_at (audit trail) |
| `profiles` | id, role, ward_id?, display_name, phone_verified |
| `ward_risk` | ward_id, week, ndvi, ndwi, ndbi, lst_c, rain_14d_mm, report_density, cases_area, score, level |
| `case_counts` | date, area (DNCC/DSCC/division), admissions, deaths, source_url |

Row-level security: citizens read public views only (snapped points, no reporter ids). Inspectors read and update sites in their ward. Admins access their city corporation.

### 5.2 Satellite risk job (weekly, Northflank)

1. Pull recent cloud-light Sentinel-2 L2A and Landsat 8/9 Collection 2 scenes over Dhaka from Microsoft Planetary Computer's free STAC catalogue (Google Earth Engine as alternative).
2. Per ward, compute mean NDVI, NDWI/MNDWI, NDBI and land surface temperature.
3. Add 14-day rainfall from Open-Meteo, report density and the latest official case counts.
4. Score = weighted sum of standardised inputs, mapped to four alert levels. Weights live in a config file and are later calibrated against DSCC/DNCC larval survey results.

### 5.3 AI photo screening (tiered, near-zero cost)

| Tier | How | Cost | Handles |
| --- | --- | --- | --- |
| 1. On-device | Zero-shot CLIP-family model (e.g. MobileCLIP / CLIP ViT-B/32) via transformers.js or ONNX Runtime Web in the browser; blur/darkness check | Free | Obvious yes/no; blocks junk before upload |
| 2. Rules | Rate limits, duplicate merge, phone OTP for repeat reporters | Free | Spam |
| 3. Human | Volunteer moderator queue | Free (volunteers) | Everything else at pilot scale |
| 4. Paid API (optional) | Claude/Gemini vision via Edge Function, only for "unclear" results, hard daily cap; off by default | Well under a US cent per photo (check current pricing) | Backlog relief |
| 5. Own model (P3) | YOLO trained on moderator-labelled photos, self-hosted on Northflank or home lab | Flat server cost | Best Dhaka accuracy |

Every moderator decision is stored as a training label for tier 5. Face and plate blurring runs server-side before any public thumbnail is created.

## 6. Data sources, risks and rollout

### 6.1 Data sources

| Source | Gives | Cost | Notes |
| --- | --- | --- | --- |
| Citizen reports | Breeding-site photos + GPS | Free | Core signal |
| DGHS daily dengue bulletin | Admissions and deaths by DNCC, DSCC, division ([example](https://bdnews24.com/bangladesh/yd4u29kltc)) | Free | Press-release format; scraper is fragile, so keep a manual entry form |
| Sentinel-2 L2A, Landsat 8/9 | Vegetation, water, built-up, surface temperature | Free | 10 m / 30 m pixels: ward-level only |
| Open-Meteo | Rainfall and temperature | Free, no key | |
| Ward boundaries | DNCC/DSCC ward polygons | Free | [DNCC 54 wards](https://en.wikipedia.org/wiki/Dhaka_City_Corporation), DSCC 75; try OSM first, digitise gaps |
| DSCC/DNCC larval surveys | House-level larva findings | Partnership | KoboToolbox data; best calibration source |
| Mosquito Alert BD | Validated mosquito sightings | Open data | Link out; import if API terms allow |

### 6.2 Risks

- **Authorities don't act.** Get a signed pilot agreement with one ward before launch. Public scorecards make response time visible.
- **Spam / fake reports.** On-device screen, rate limits, phone OTP, moderator queue.
- **Privacy.** Blur faces/plates, snap public pins, never show reporter identity, strip EXIF.
- **Low adoption.** Mosquito Alert reached only 227 participants via social media alone. Plan school, mosque, apartment-association and university drives, plus a share card for every cleared site.
- **Misleading risk map.** Label it "environmental risk, not confirmed cases"; publish method and weights.
- **Cost spikes.** Paid AI off by default and capped daily.

### 6.3 Rollout

- [ ] Contact icddr,b's Mosquito Alert team; position as complementary
- [ ] Pick one pilot ward (DNCC or DSCC) and get the ward office to name an inspector
- [ ] Recruit 20 volunteer moderators (entomology / public health students)
- [ ] Launch P0 with volunteers for two weeks, then open to the public in the pilot ward
- [ ] Publish the first 4-week scorecard; use it to approach the second city corporation

## 7. Open questions

- Which pilot ward, and who is the contact in that ward office?
- Will DSCC/DNCC share KoboToolbox larval survey data?
- Does Mosquito Alert's API allow importing Bangladesh reports?
