# Credits

DengueWatch BD reimplements ideas; it does not copy code from GPL-licensed projects.

| Source | License | What we took |
| --- | --- | --- |
| [Mosquito Alert](https://github.com/Mosquito-Alert/mosquito_alert) (icddr,b runs it in Bangladesh) | GPL-3.0 | Idea only: report taxonomy and expert-validation workflow. No code copied. We link out and aim to partner. |
| [InfoDengue / AlertTools](https://github.com/AlertaDengue/AlertTools) (Fiocruz, FGV) | CC0 (AlertTools) | Idea of four alert levels (green/yellow/orange/red) driven by standardised indicators. Our scoring is reimplemented in Python (`workers/satellite/score.py`). |
| [GLOBE Mosquito Habitat Mapper](https://observer.globe.gov/get-data/mosquito-habitat-data) (NASA) | Data free for any use | "Report, then eliminate" step: the success screen asks citizens to empty and cover containers. |
| [Ushahidi](https://www.ushahidi.com/) | AGPL | Reference for moderation/triage UX only. |
| Rio de Janeiro breeding-site study, *Scientific Reports* 2024 ([doi](https://www.nature.com/articles/s41598-024-67914-w)) | Research | Class list and approach for the P3 detector. |
| Dhaka satellite dengue study ([PMC10001735](https://pmc.ncbi.nlm.nih.gov/articles/PMC10001735/)) | Research | Choice of NDVI, NDWI, NDBI and Landsat LST as ward-level risk inputs. |
| [project-geosentinel](https://github.com/acuestamd/project-geosentinel) | — | Pattern of cheap scheduled ingestion jobs. |
| OpenStreetMap contributors | ODbL | Ward boundaries (where available) and base map data via OpenFreeMap. |
| [OpenFreeMap](https://openfreemap.org/) / [MapLibre GL JS](https://maplibre.org/) | BSD-3 / free tiles | Map rendering and tiles. |
| [Transformers.js](https://github.com/huggingface/transformers.js), OpenAI CLIP weights (`Xenova/clip-vit-base-patch32`) | Apache-2.0 / MIT | On-device zero-shot screening. |
| [OpenCV](https://opencv.org/) YuNet face detector, Haar plate cascade | Apache-2.0 / BSD | Face and number-plate blurring in `workers/thumbs`. |
| [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) | AGPL-3.0 | P3 detector training (compatible with our AGPL license). |
| Microsoft Planetary Computer (Sentinel-2 L2A, Landsat C2 L2), [Open-Meteo](https://open-meteo.com/) | Open data (Copernicus / USGS terms), CC-BY 4.0 | Satellite indices and rainfall. |
| DGHS daily dengue press releases | Public information | Official admissions and deaths. |
| Noto Sans Bengali (Google) | SIL OFL 1.1 | Bangla typeface. |
