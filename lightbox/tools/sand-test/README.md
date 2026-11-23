# Sand Bottle: level-generation test

A possible third Lightbox mode. Not built into the app; these scripts only test whether good levels can be made.

**Rules tested.** A frame of chambers, each the same height. Each chamber shows the jugs of sand it will get (a colour
and a number of scoops). The player picks the order to pour them; sand stacks from the bottom and each chamber ends full.
Clues: for every row, how many squares of each colour it ends with. A level is good if exactly one picture fits and
row-by-row reasoning finds it with no guessing.

| Script | What it measures |
|---|---|
| `sand.py` | Random levels and same-order "landscapes": how often one answer, how often no guessing (`python3 sand.py`) |
| `depth.py` | Steps of reasoning per level, the landscape trap, and the shared-pile variant |
| `pics.py` | The Stained Glass pictures as sand levels, plus how many revealed squares fix the ones that fail |

Results (first run): random levels pass 55-70% of the time and take 9-12 steps. Landscapes always pass but are trivial:
the bottom row gives the answer away. 26 of 32 drawn pictures pass as they are; the other 6 pass with 2-11 revealed
squares. The lighthouse was skipped (a chamber with 8 jugs is too many orderings to check this way).
