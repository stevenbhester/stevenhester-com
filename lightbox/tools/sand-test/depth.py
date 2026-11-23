"""How much thinking a level takes, and the shared-pile variant."""
import random, itertools
from collections import Counter
from sand import *

def depth(opts, target, H, colours):
    """Plays row reasoning one deduction at a time, like a person: find a row/colour that rules out an ordering,
    apply it, repeat. Returns (finished, steps, steps where no single row settled a chamber outright)."""
    live = [list(o) for o in opts]; steps = 0; subtle = 0
    while not all(len(x) == 1 for x in live):
        best = None
        for c in range(len(live)):
            if len(live[c]) == 1: continue
            for r in range(H):
                for k in colours:
                    lo = sum(min(int(x[r] == k) for x in live[d]) for d in range(len(live)) if d != c)
                    hi = sum(max(int(x[r] == k) for x in live[d]) for d in range(len(live)) if d != c)
                    keep = [o for o in live[c] if lo + int(o[r] == k) <= target[r][k] <= hi + int(o[r] == k)]
                    if len(keep) < len(live[c]) and (best is None or len(keep) < len(best[1])): best = (c, keep)
        if best is None: return False, steps, subtle
        c, keep = best; subtle += len(keep) > 1; live[c] = keep; steps += 1
    return True, steps, subtle

def survey(kind, C, H, cs, N=300):
    R = random.Random(7); acc = 0; st = []; sub = []; trivial = 0
    for _ in range(N):
        n, solved, rounds, chambers = trial(R, kind, C, H, cs)
        if n != 1 or not solved: continue
        cols = [col_of(ch, H) for ch in chambers]; target = row_counts(cols, H, cs); opts = [options(ch, H) for ch in chambers]
        ok, s, sb = depth(opts, target, H, cs)
        acc += 1; st.append(s); sub.append(sb)
        # trivial: the bottom row alone tells every chamber which jug goes first
        trivial += len(set(c[0] for c in cols)) == 1
    st.sort(); sub.sort()
    print(f"{kind:9} C={C} H={H}: kept {acc}/{N}  steps median {st[len(st)//2]} (max {st[-1]})  "
          f"partial steps median {sub[len(sub)//2]}  orderings per chamber {sum(len(options(random_chamber(R,H,cs,2,4),H)) for _ in range(200))/200:.1f}  "
          f"same first jug in every chamber {100*trivial/max(1,acc):.0f}%")

for kind in ('random', 'landscape'):
    for C, H, cs in [(5, 8, 'abcd'), (6, 8, 'abcd')]:
        survey(kind, C, H, cs)

# Shared pile + column colour counts: any jug can go into any chamber.
def pool_trial(R, C, H, cs):
    chambers = [random_chamber(R, H, cs, 2, 4) for _ in range(C)]
    cols = [col_of(ch, H) for ch in chambers]; target = row_counts(cols, H, cs)
    pool = Counter(j for ch in chambers for j in ch); colcount = [Counter(c) for c in cols]
    jugs = list(pool.keys())
    # every way to fill one chamber from the pile, matching its colour counts (as finished columns, with jugs used)
    def fills(cc):
        out = []
        def rec(seq, used, h):
            if h == H:
                s = ''.join(k * n for k, n in seq)
                if Counter(s) == cc: out.append((s, Counter(used)))
                return
            for j in jugs:
                if used.count(j) < pool[j] and h + j[1] <= H and Counter(''.join(k * n for k, n in seq + [j])) <= cc:
                    rec(seq + [j], used + [j], h + j[1])
        rec([], [], 0); return out
    opts = [fills(cc) for cc in colcount]
    found = [0]; seen = set()
    def rec(c, chosen, left):
        if found[0] > 20: return
        if c == C:
            if row_counts(chosen, H, cs) == target and tuple(chosen) not in seen: seen.add(tuple(chosen)); found[0] += 1
            return
        for s, used in opts[c]:
            if all(left[j] >= n for j, n in used.items()):
                part = chosen + [s]
                if all(Counter(x[r] for x in part)[k] <= target[r][k] for r in range(H) for k in cs):
                    rec(c + 1, part, left - used)
    rec(0, [], pool)
    return found[0]

R = random.Random(3); res = [pool_trial(R, 5, 8, 'abcd') for _ in range(120)]
print(f"shared pile + column counts C=5 H=8: unique {100*sum(r == 1 for r in res)/len(res):.0f}%  median solutions {sorted(res)[len(res)//2]}")
