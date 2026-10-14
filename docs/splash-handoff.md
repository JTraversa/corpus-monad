# Splash handoff: a Monad variant of the corpus ink loop

Written 2026-10-13 for rendering on a PC with Blender. The live hackathon page already runs the stock corpus splash
(see "What is live now"); this covers the variant where a Monad coin joins the corpus coin in the animation itself.

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

### Implemented: two coins side by side (`--marks corpus monad`)

`ink_sim.py` takes `--marks` (default `corpus`, which reproduces the original render exactly, same rng draw order).
`--marks corpus monad` forms two coins on one baseline: the corpus coin (gray ring + green square) on the left and a
Monad coin (gray ring + the logomark above as its core) on the right. Details:

- Pair geometry: `RING_R` drops 2.1 -> 1.75 so both fit, gap 0.9·RING_R, pair centred. The logomark is 1.2·RING_R
  tall, rejection-sampled inside the path (cubics flattened in numpy, even-odd test; no extra deps in Blender).
- Particle split per coin: ring 15 %, core 19 % (single coin keeps 24 % / 34 %); halo takes the rest less 10 % dust.
- Colour: a second attribute `tint_p` and mix node toward an ink-dark #836EF9 (linear 0.080, 0.052, 0.360), darkened
  the way the video's green is darkened from #1cc744. Full brand purple (0.230, 0.158, 0.950) read as a flat sticker
  next to the green in the preview; swap it back in `mix_p` if exact brand match matters more.
- Burst: each coin's particles are kicked radially from their own coin's centre, not frame centre.
- Phone caveat: the video is `object-fit: cover`, so a portrait phone shows only the middle ~25-35 % of the frame
  width; the pair is cropped there (the single coin already was, slightly).

Production render: same command as above plus `--marks corpus monad` (about 26 min on the RTX 3070 here,
4.5 s/frame). Rendered and shipped to `web/media/` on 2026-10-13.

### Encode (same as production)

The 348 rendered frames become a 300-frame loop: playback starts at frame 49 (mark already held), and the last 2 s
crossfade the dust tail (frames 301-348) into frames 1-48, so the marks condense out of dust and the wrap lands on
frame 49 seamlessly. A plain encode of all 348 frames hard-cuts from dust to the formed marks at the seam.

```
IN="-framerate 24 -start_number 49 -i frames/frame_%04d.png -framerate 24 -start_number 1 -i frames/frame_%04d.png"
XF="[1:v]trim=end_frame=48[h];[0:v][h]xfade=transition=fade:duration=2:offset=10.5"
ffmpeg $IN -filter_complex "$XF,scale=1280:720,hqdn3d=1.5:1.5:6:6" -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p -movflags +faststart -an corpus_ink_loop.mp4
ffmpeg $IN -filter_complex "$XF,scale=960:540,hqdn3d=1.5:1.5:6:6"  -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an corpus_ink_loop_540.mp4
ffmpeg -i corpus_ink_loop.mp4 -ss 0.4 -frames:v 1 -q:v 3 corpus_ink_poster.jpg   # the held mark(s); by 1.5 s the burst has begun
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
