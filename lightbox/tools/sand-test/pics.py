"""Drawn pictures as Sand Bottle levels. Each picture column becomes one chamber; each run of one colour in it
becomes one jug. Empty glass ('.') becomes a background colour, since sand fills every chamber to the top."""
import json, re, subprocess, time
from collections import Counter
from sand import options, row_counts, count_solutions, row_reasoning
from depth import depth

src = open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', 'glass-pictures.js')).read()
pics = [(m.group(1), json.loads(m.group(2).replace("'", '"'))) for m in re.finditer(r"id: '(\w+)'.*?pic: (\[[^\]]*\])", src)]

def level(pic):
    rows = [r.replace('.', 'z') for r in reversed(pic)]   # bottom row first
    H, C = len(rows), len(rows[0])
    cols = [''.join(rows[r][c] for r in range(H)) for c in range(C)]
    chambers = [[(m.group(0)[0], len(m.group(0))) for m in re.finditer(r'(.)\1*', col)] for col in cols]
    return H, C, cols, chambers

def with_marks(opts, target, H, cs, cols):
    """Add revealed squares (a dab of colour shown on the glass) until row reasoning finishes. Greedy: each mark is the
    square that cuts the most orderings. Returns how many marks it took."""
    opts = [list(o) for o in opts]; marks = 0
    while not row_reasoning(opts, target, H, cs)[0]:
        best = None
        for c in range(len(opts)):
            if len(opts[c]) == 1: continue
            for r in range(H):
                keep = [o for o in opts[c] if o[r] == cols[c][r]]
                if best is None or len(keep) < best[0]: best = (len(keep), c, keep)
        opts[best[1]] = best[2]; marks += 1
    return marks

print(f"{'picture':11} size  jugs  orderings  solutions  row-reasoning  steps  marks needed")
tot = Counter()
for name, pic in pics:
    H, C, cols, chambers = level(pic); cs = sorted(set(''.join(cols)))
    t0 = time.time()
    opts = [options(ch, H) if len(ch) <= 7 else None for ch in chambers]
    if None in opts: print(f"{name:11} skipped: a chamber with 8+ jugs"); tot['skipped'] += 1; continue
    target = row_counts(cols, H, cs)
    n = count_solutions(opts, target, H, cs, cap=20)
    solved = row_reasoning(opts, target, H, cs)[0]
    steps = depth(opts, target, H, cs)[1] if solved else '-'
    marks = with_marks(opts, target, H, cs, cols)
    tot['pics'] += 1; tot['unique'] += n == 1; tot['clean'] += solved; tot['marks'] += marks
    print(f"{name:11} {C}x{H}  {sum(map(len, chambers)):4}  {max(len(o) for o in opts):9}  {n if n < 20 else '20+':>9}  {'yes' if solved else 'no':>13}  {steps!s:>5}  {marks:12}   ({time.time()-t0:.1f}s)")
print(f"\n{tot['pics']} pictures: {tot['unique']} have one answer, {tot['clean']} need no help, average marks needed {tot['marks']/tot['pics']:.1f}")
