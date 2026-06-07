# Listen QA Checklist — Genre × Delivery

Manual pass after automated tests (`npm test`). Use the same track types you know well.

**Site:** https://simonlatham155-tech.github.io/mastering/

## Before each session

- [ ] Hard refresh (cache bust)
- [ ] Auto-stage on export: **ON**
- [ ] Bypass off (processed chain)

## Per combination (7 genres × 3 exports = 21 listens)

Mark each: **Pass** / **Fail** / **Notes**

### Genres

| ID | Genre |
|----|-------|
| `dnb` | Drum & Bass |
| `techno` | Techno |
| `progressivehouse` | Progressive House |
| `deephouse` | Deep House |
| `trance` | Uplifting Trance |
| `techhouse` | Tech House |
| `dubstep` | Dubstep |

### Export presets

| Preset | Target LUFS | Ceiling |
|--------|-------------|---------|
| Spotify | -14 | -1.0 dBTP |
| Club | -8 | -0.5 dBTP |
| Extreme | -6 | -0.3 dBTP |

## What to check (each export)

1. **Play preview** — no buzz/rattle on bass; transients not destroyed
2. **A/B bypass** — processed is louder/targeted, not just filtered differently
3. **Export** — banner shows integrated LUFS within ±0.5 LU of target
4. **Export** — true peak at or below ceiling
5. **Headphones + one speaker** — sub/mono compatibility on bass genres

## Matrix (fill during QA)

| Genre | Spotify | Club | Extreme |
|-------|---------|------|---------|
| DnB | | | |
| Techno | | | |
| Prog House | | | |
| Deep House | | | |
| Trance | | | |
| Tech House | | | |
| Dubstep | | | |

## Fail criteria (stop and fix before ship)

- True peak above ceiling on export banner
- Integrated LUFS more than 1 LU off target after auto-staging
- Audible buzz/rattle on bass (regression from limiter path)
- Genre sounds identical to wrong genre (e.g. DnB preset on trance mix is OK if user chose wrong genre — same genre must be consistent)

## Automated coverage (CI)

- `npm test` — preset invariants, resolver, delivery matrix, true-peak utils
- Does **not** replace ears — run this checklist before calling a release done

## Sign-off

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| | | | |
