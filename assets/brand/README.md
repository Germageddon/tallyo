# Tallyo brand

The mark is a tally — four strokes and a diagonal slash (the "count of five" gate). It reads as *tally* and stays legible at avatar size.

## Files

- `tallyo-avatar.svg` — master, scalable (viewBox only, no fixed size). Source of truth for the site and any other surface.
- `tallyo-avatar-1024.png` — 1024×1024, for the Telegram bot picture (`/setuserpic` in BotFather). Bigger than the display size on purpose: Telegram re-compresses and rescales avatars, so a larger source survives that with cleaner edges.

## Palette (Ink)

| Role | Hex |
|------|-----|
| Background | `#16181D` |
| Strokes | `#F2ECE0` |
| Slash accent | `#E8B04B` |

The avatar is a full square; Telegram crops it to a circle. On the web, apply rounding in CSS rather than baking it into the file.
