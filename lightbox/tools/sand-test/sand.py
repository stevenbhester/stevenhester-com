"""Sand Bottle level-generation test.

Rules under test
- A frame of C chambers, each H squares tall. Sand settles from the bottom up.
- Each chamber shows the jugs of sand it will get (a colour and a number of scoops each). The player chooses the order
  to pour them. Pouring stacks a jug's sand on top of what is already there. Each chamber ends exactly full.
- Clues: for every row, how many squares of each colour it ends with.
A puzzle is good if exactly one finished picture fits, and "row reasoning" alone finds it: for each row and colour,
an ordering of a chamber is ruled out if no choice in the other chambers could still make that row's count.

Variants measured
  shown   : each chamber's own jugs are shown (above)
  pool    : one shared pile of jugs, any jug into any chamber (row clues only)
  poolcol : shared pile, plus each column's colour counts
"""
import itertools, random, sys, time
from collections import Counter

def col_of(order, H):
    s = ''.join(c * n for c, n in order); assert len(s) == H; return s

def options(jugs, H):
    """Every distinct finished chamber this set of jugs can make."""
    return sorted({col_of(p, H) for p in itertools.permutations(jugs)})

def row_counts(cols, H, colours):
    return [Counter(c[r] for c in cols) for r in range(H)]

def count_solutions(opts, target, H, colours, cap=50):
    """Backtracking count of full pictures that match every row count (stops at cap)."""
    C = len(opts); found = [0]
    need = [[target[r][k] for k in colours] for r in range(H)]
    ki = {k: i for i, k in enumerate(colours)}
    # remaining max per row/colour from columns not yet placed
    def rec(c, acc):
        if found[0] >= cap: return
        if c == C:
            if all(acc[r][i] == need[r][i] for r in range(H) for i in range(len(colours))): found[0] += 1
            return
        for o in opts[c]:
            ok = True
            for r in range(H):
                acc[r][ki[o[r]]] += 1
            for r in range(H):
                for i in range(len(colours)):
                    if acc[r][i] > need[r][i]: ok = False; break
                    # can the rest still reach it? each later column adds at most 1 per row
                    if acc[r][i] + (C - c - 1) < need[r][i]: ok = False; break
                if not ok: break
            if ok: rec(c + 1, acc)
            for r in range(H): acc[r][ki[o[r]]] -= 1
    rec(0, [[0] * len(colours) for _ in range(H)])
    return found[0]

def row_reasoning(opts, target, H, colours):
    """Prune chamber orderings by row bounds until nothing changes. Returns (solved, rounds, options left)."""
    live = [list(o) for o in opts]; rounds = 0
    while True:
        rounds += 1; changed = False
        for c in range(len(live)):
            keep = []
            for o in live[c]:
                good = True
                for r in range(H):
                    for k in colours:
                        lo = sum(min(int(x[r] == k) for x in live[d]) for d in range(len(live)) if d != c)
                        hi = sum(max(int(x[r] == k) for x in live[d]) for d in range(len(live)) if d != c)
                        v = int(o[r] == k)
                        if not (lo + v <= target[r][k] <= hi + v): good = False; break
                    if not good: break
                if good: keep.append(o)
            if len(keep) < len(live[c]): live[c] = keep; changed = True
        if not changed: break
    return all(len(x) == 1 for x in live), rounds, sum(len(x) for x in live)

def random_chamber(R, H, colours, kmin, kmax):
    while True:
        k = R.randint(kmin, kmax); cuts = sorted(R.sample(range(1, H), k - 1)); sizes = [b - a for a, b in zip([0] + cuts, cuts + [H])]
        if max(sizes) <= 4:
            cols = [R.choice(colours) for _ in sizes]
            if all(cols[i] != cols[i + 1] for i in range(len(cols) - 1)): return list(zip(cols, sizes))

def landscape_chamber(R, H, bands):
    """Sand-art style: every chamber has the same bands in the same order, with heights that wander."""
    sizes = [1] * len(bands); left = H - len(bands)
    for _ in range(left): sizes[R.randrange(len(bands))] += 1
    return list(zip(bands, sizes))

def trial(R, kind, C, H, colours):
    if kind == 'random':
        chambers = [random_chamber(R, H, colours, 2, 4) for _ in range(C)]
        for ch in chambers: R.shuffle(ch)
    else:
        chambers = [landscape_chamber(R, H, colours) for _ in range(C)]
    cols = [col_of(ch, H) for ch in chambers]
    target = row_counts(cols, H, colours)
    opts = [options(ch, H) for ch in chambers]
    n = count_solutions(opts, target, H, colours)
    solved, rounds, left = row_reasoning(opts, target, H, colours)
    return n, solved, rounds, chambers

def report(kind, C, H, colours, N=300):
    R = random.Random(hash((kind, C, H, len(colours))) & 0xffff)
    t0 = time.time(); uniq = rr = 0; sols = []
    for _ in range(N):
        n, solved, rounds, _ = trial(R, kind, C, H, colours)
        sols.append(n); uniq += n == 1; rr += solved
    print(f"{kind:9} C={C} H={H} colours={len(colours)}  unique {100*uniq/N:5.1f}%  solved by row reasoning {100*rr/N:5.1f}%  "
          f"median solutions {sorted(sols)[N//2]}  {1000*(time.time()-t0)/N:.0f} ms each")

if __name__ == '__main__':
    print('— each chamber shows its own jugs; row colour counts as clues —')
    for kind in ('random', 'landscape'):
        for C, H, cs in [(4, 6, 'abc'), (5, 6, 'abc'), (5, 8, 'abcd'), (6, 8, 'abcd')]:
            report(kind, C, H, cs)
