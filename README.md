# LOGIC BOMB: a Discrete Math defusal game

A two-role cooperative game for a Discrete Mathematics class, inspired by cooperative bomb-defusal video games.

- **Defuser** opens `index.html` (one self-contained file that works offline, including on a Chromebook) and sees a 3D bomb.
- **Expert** reads `manual.pdf` (source: `manual.html`) and does the math. They never see the screen.

## Files
| File | What it is |
|---|---|
| `index.html` | The game. Built from `src/`; don't edit it by hand. |
| `manual.html` / `manual.pdf` | Defusal Manual v2.0 (8 pages, printable) |
| `src/logic.js` | All rules, bomb generation, seeded RNG (pure JS, no graphics) |
| `src/modules3d.js`, `src/bomb3d.js`, `src/kit.js`, `src/tex.js` | 3D models and procedural textures (three.js) |
| `src/main.js`, `src/template.html` | Scene, input, game loop, menus |
| `test/logic.test.mjs` | Rule tests + 1,000 random bombs solved through the module API |

## Settings (title screen)
Module grid rows × columns (default **2 × 3**: timer + 5 modules), modules on the back too, timer length, strike limit,
optional needy module, which module types can appear, and a seed (same seed = same bomb).

## Modules
| On the bomb | Math |
|---|---|
| Wires | quantifiers over the wires (∀, ∃, ∃!) |
| The Button | propositions and connectives; set operations for the release digit |
| Set Keypad | set operations and cardinality |
| Simon Maps | functions as sets of ordered pairs |
| Who’s on ∀irst | translating nested quantifiers into English |
| Venn Wires | set expressions, K = (R ∩ L) ∪ (S − B) |
| Quantifier Grid | nested quantifiers over rows and columns |
| Truth Table | truth tables for P, Q formulas |
| Argument Check (needy) | rules of inference and fallacies |

## Developing
```
npm install
npm test          # rule tests
npm run build     # writes index.html (needs python3 + fonttools for the embedded font subset)
npm run pdf       # writes manual.pdf from manual.html
```
If you change a rule, change `src/logic.js`, `manual.html` and the tests together, then rebuild both outputs.
