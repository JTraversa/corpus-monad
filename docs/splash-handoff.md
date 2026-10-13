# Splash handoff: a Monad variant of the corpus ink loop

Written 2026-10-13 for rendering on a PC with Blender. The live hackathon page already runs the stock corpus splash
(see "What is live now"); this is for an optional variant where a Monad element joins the mark in the animation itself.

## What is live now

https://hackathon.trycorpus.ai/ plays `web/media/corpus_ink_loop.mp4` (720p, 9.1 MB) on desktop and
`corpus_ink_loop_540.mp4` (540p, 2.4 MB) under 768 px or with Save-Data, poster `corpus_ink_poster.jpg`.
Sequence: ~1 s of bare video from first painted frame (4 s stall fallback), then the page sheet rides up and the nav
drops in on a shared 1.5 s ease while the video settles to a 70svh band; a "corpusAI on Monad" lockup (corpus mark +
the official Monad logomark in #836EF9) fades in once settled. `prefers-reduced-motion` or a `#hash` skips the intro.
All of it is in `web/index.html` (the `<style>` block and the first IIFE in the module script). Nothing else on the
page depends on the video, so a new encode with the same three file names is a drop-in.

## Source of the animation

- Script: `corpus-website/scripts/ink_sim.py` (authored scene, no hand modeling; commit `4adcf8d animation`).
- Blender 5.x portable on the Windows PC: `~/Tools/blender-5.2.0-windows-x64/`.
- Render: `blender --background --factory-startup --python scripts/ink_sim.py -- --frames 348 --fps 24 --res 1920 1080 --points 700000 --samples 16 --out frames/`
  (`--help` lists the options; `--start N` resumes; `--no-logo` is the plain billow loop). Cycles with OptiX; the
  production loop used 700k points at 1080p.
- Timeline (seconds, 12.5 s loop = 348 frames @ 24 fps): `0.0–HOLD_END(3.0)` the mark stands formed at center;
  `BURST(0.6)` radial burst; billow; `THIN_START(9.8)–THIN_END(12.5)` dissolves to dust whose tail crossfades into
  the head, so the mark condenses out of dust at every wrap.
- Seeding of the mark (lines ~187–211): ring of `n_ring = 24 %` of particles at `RING_R = 2.1` with gaussian stroke
  `RING_W = 0.10`; solid square `SQ_HALF = RING_R·7/20` (mark.svg proportions, circle r=10 / square 7 in a 24 box);
  halo and dust make up the rest. `logo_mask` marks ring+square; `tint[...] = uniform(0.55, 0.95)` on the square
  carries the green. The material mixes per-point gray `g` toward brand green by `tint`.

## The Monad element

Official logomark (from monad.xyz/brand-and-media-kit, as served; fill #836EF9). Also saved as `web/monad-mark.svg`:

```
viewBox 0 0 24 24
M11.782 0C8.37963 0 0 8.53443 0 11.9999C0 15.4654 8.37963 24 11.782 24C15.1844 24 23.5642 15.4653 23.5642 11.9999C23.5642 8.53458 15.1845 0 11.782 0Z
M9.94598 18.8619C8.51124 18.4637 4.65378 11.5912 5.04481 10.1299C5.43584 8.66856 12.1834 4.73984 13.6181 5.1381C15.0529 5.5363 18.9104 12.4087 18.5194 13.87C18.1283 15.3314 11.3807 19.2602 9.94598 18.8619Z
```
(outer rounded diamond, inner tilted rounded square as the counter; even-odd fill.)

Brand colours on the current kit page: primary #6E54FF, #DDD7FE, #0E091C; the logomark asset itself is #836EF9.
Use #836EF9 so the video matches the lockup on the page.

### Suggested variant (least risk)

Keep the corpus mark exactly as is for the 0–3 s hold. Add the Monad mark as a second body that forms *beside* the
corpus mark (lockup spacing: marks on one baseline, gap ≈ 0.9·RING_R), purple-tinted, and let both burst together:

1. Rasterise the two paths above to a boolean mask (e.g. `matplotlib.path.Path` with even-odd, or `cairosvg` to a
   PNG then threshold) at ~512 px; rejection-sample `n_monad ≈ 14 %` of N inside the mask, scale so the diamond's
   height equals `2·RING_R`, offset `x += 2.6·RING_R`; shift the corpus mark `x -= 1.3·RING_R` so the pair is centred.
2. Add a second tint channel (`tint_p`) and a second mix in the material toward #836EF9 (linear: 0.230, 0.158, 0.950);
   seed `tint_p = uniform(0.55, 0.95)` on the Monad particles, extend `logo_mask` to include them.
3. Burst/billow phases need no change; they act on `logo_mask`. Check the crossfade tail still condenses both marks.
4. Render a 540p preview first (`--res 960 540 --points 200000 --samples 8`) to check composition before the
   1080p/700k production render (hours on OptiX).

Alternative, cheaper on render time: leave the hold as is and only tint the billow's threaded colour from green toward
purple over 3–9 s (`tint` ramp in the billow phase), so the Monad colour arrives with the burst rather than as a shape.

### Encode (same as production)

```
ffmpeg -framerate 24 -i frames/%04d.png -vf "scale=1280:720,hqdn3d=1.5:1.5:6:6" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart -an corpus_ink_loop.mp4
ffmpeg -framerate 24 -i frames/%04d.png -vf "scale=960:540,hqdn3d=1.5:1.5:6:6"  -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an corpus_ink_loop_540.mp4
ffmpeg -i corpus_ink_loop.mp4 -ss 1.5 -frames:v 1 -q:v 3 corpus_ink_poster.jpg   # the held mark(s)
```
Targets: 720p ≈ 9 MB / ~5.8 Mbps, 540p ≈ 2.5 MB. Check the loop seam by playing the file on repeat.

## Shipping it

1. Copy the three files over `corpus-monad/web/media/` (same names). If the poster's composition changed, nothing
   else needs editing; the page masks and crops the video, it never positions by pixel.
2. Deploy: `vercel deploy --prod --yes --scope jtraversas-projects --cwd web` from the repo root (the project
   `corpus-monad-hackathon` is linked in `web/.vercel`, git-ignored).
3. Verify: `node ~/.local/share/resume-pdf/shot-splash.mjs <outdir>` on the VPS captures the bare-video moment and
   the settled page at desktop and phone widths and prints lock/settled/lockup/overflow state.
4. Commit the media in `corpus-monad` (the files are ~12 MB; fine for this repo, do not add them to corpus-website).
