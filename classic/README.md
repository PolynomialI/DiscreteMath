# LOGIC BOMB: Classic Edition

A non-math version of LOGIC BOMB that plays like a classic cooperative bomb-defusal game:
general-purpose puzzles instead of discrete math.

- **Defuser** opens `index.html` (one self-contained file, works offline).
- **Expert** reads `manual.pdf` (23 pages, typewriter style).

All rules, word lists, symbols, mazes, text and art are original to this project.

## Modules
Wires · The Button · Keypad · Simon · Word Board · Memory · Morse Code · Complex Wires · Wire Sequence · Maze · Password
Needy: Venting · Capacitor · Knob

## Developing (from the repo root)
```
npm run test:classic      # rule tests + 1,000 random bombs solved through each module's API
npm run build:classic     # writes classic/index.html
npm run manual:classic    # writes classic/manual.html from the game's rule data, then classic/manual.pdf
```
The manual is generated from `classic/src/logic.js`, so change rules there and regenerate.
Manual fonts: Special Elite (Apache 2.0) and Courier Prime (SIL OFL); licenses are in `classic/fonts/`.
