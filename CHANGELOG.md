# Revision history

## 2026-10-25 — IDS by milestone, every model checked

- IDS export cuts by milestone (`--milestone`) or writes one file per milestone (`--split`);
  the web Model menu lists each milestone.
- `bep ids check` and the web check cover every attached model, each in its own IFC schema.
- A class the target schema lacks is reported instead of silently passing.
- `Pset_DoorCommon.FireRating` in the LOIN table is required in that property set.
- Every IDS value is a setting; `bep --set key=value` overrides any setting for one run.
- New *Structured Data Responsibility Matrix* in the ISO framework (69 fields).
- New [docs/07-standards.md](docs/07-standards.md); roadmap puts IDS ahead of viewer scaling.

## 2026-10-22 — Acknowledgement

- Credit for the Duplex Apartment model in the README.

## 2026-10-14 — RunPod deployment and live demo

- `deploy/runpod.sh` with data on the persistent volume and basic authentication.
- Port conflicts reported clearly; installs into a virtualenv; service restarts with the pod.
- Optional unauthenticated serving; live demo linked from the README.

## 2026-09-26 — Layout fixes, roadmap and progress record

- Editor no longer blanks at 1101–1500px; card margins no longer leak into grids.
- Roadmap with measured scaling limits, and a progress record.

## 2026-09-18 — Initial release

- BEP authoring and scoring for ISO 19650-2, NBIMS-US v4 and a Lite template.
- buildingSMART IDS export, IFC viewer, local AI drafting, Word export, CLI, English and Korean.
