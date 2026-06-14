# Office art assets (not committed)

The pixel-art office sprites are **LimeZu — Modern Interiors (free version)** and
are **not** stored in this repo (the free license is non-commercial and the repo
is public, so the art isn't redistributed here).

To get the office + characters to render:

1. Download the free pack: https://limezu.itch.io/moderninteriors
2. Unzip it into this folder so the paths look like:

```
frontend/public/office/Modern tiles_Free/Characters_free/Adam_run_16x16.png
frontend/public/office/Modern tiles_Free/Interiors_free/16x16/Interiors_free_16x16.png
```

The app reads these at runtime. If they're missing, the agents fall back to the
built-in procedural pixel characters.

License (free version): non-commercial use only; editing allowed; no reselling.
For commercial use, buy the full pack (~$1.20).
