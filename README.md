# databallr KNOCKOUT

Free-throw **Knockout** against real NBA shooters, in the browser. Three.js + Vite + TypeScript.

**Play it:** https://asiantown.github.io/databallr-knockout/

## The hook

Your make window is your player's **real career FT%** — shoot as Curry (91%) and the green window is wide; shoot as Shaq (53%) and it's a sliver. The AI opponents in line aren't dice rolls either: every AI shot is a noisy "wrist flick" resolved through the **same power-band physics you play**, so their real percentages emerge on the court — bricks, rim-rolls, and all. Names + stats are public facts; no likenesses or team branding.

## How to play

Classic playground knockout: the front two in line have balls. **If the person behind you scores before you do, you're out.** Make it → pass the ball on, rejoin the back. Last one standing wins.

Shoot four ways:
- **Flick up** — quick upward drag with mouse or finger
- **Two-finger trackpad swipe** — either direction, speed = power
- **Hold SPACE, release** — charge meter (keyboard / accessibility)
- **📷 Wrist flick (webcam)** — tap the camera button (top-left) and shoot with a
  real upward hand flick. MediaPipe hand tracking; peak flick speed → power. A
  live preview shows the tracked hand + a power bar. Fully opt-in; swipe/space
  stay active as fallback.

Miss and the ball caroms off the rim — chase the board and hit the **putback** (bigger window, close range). Watch the chaser behind you: they walk up, dribble, and fire at the same rim in real time.

## Run locally

Requires Node **20.19+ or 22+**.

```bash
npm install
npm run dev        # http://127.0.0.1:5188
```

## Verify

```bash
npm run build
npm run verify:visual                                   # Playwright: desktop + mobile, 0-error gate
npm run inspect:canvas -- --url http://127.0.0.1:5188   # non-blank canvas evidence
node scripts/user-run.mjs [--mobile]                    # scripted as-a-user pass w/ screenshots
```

## Credits

Built for the databallr Three.js jam. The `skills/` folder and verification harness are vendored from [RussDT/arcade-hoops-jam](https://github.com/RussDT/arcade-hoops-jam).
