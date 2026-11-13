# Flip-card back swaps

Each `{playerid}.jpg` here replaces that player's flip-card back action photo
on S3 (`players/back/{id}.jpg` and the card's `players/back-card/{id}.webp`)
when it lands on Easter-NEWS (workflow: `swap-flip-card-backs.yml`). The old
files are copied to `players/back-archive/` first. The slider cutouts
(`back-cutouts`, `back-web`) are left alone.

- 180827 Cody Bellinger: batting (the slider's action photo), Pete Nov 13 2026.
- 222313 Shane Murphy: holding the ball (the slider's action photo), Pete Nov 13 2026.
