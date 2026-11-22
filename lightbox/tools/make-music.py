#!/usr/bin/env python3
"""Writes the game's background music: lightbox/music.m4a. Run: python3 lightbox/tools/make-music.py (needs numpy, ffmpeg).

An original 40-bar loop in F major at 104 bpm, about a minute and a half. The feel: swung eighths, a walking bass and
backbeat chord stabs (electro swing), the I-vi-IV-V loop of 50s doo-wop with a minor-fourth bridge, and a soft
pulse-wave lead with a triangle arpeggio under it (old handheld-game music). Everything is kept mellow: no bright
highs, gentle attacks, low drums, so it sits in the background.

It is written in C below and moved down a fifth when played. Durations are in thirds of a beat, so a bar is 12 and a
swung pair of eighths is 2 then 1.
"""
import os, subprocess, sys
import numpy as np

SR, BPM, SHIFT = 44100, 104, -7
BEAT = 60 / BPM
UNIT = BEAT / 3
BAR = 12

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(name):
    step, rest = NOTE[name[0]], name[1:]
    while rest[0] in '#b': step += 1 if rest[0] == '#' else -1; rest = rest[1:]
    return 12 * (int(rest) + 1) + step
def hz(m): return 440 * 2 ** ((m + SHIFT - 69) / 12)

CHORD = {'C': 'C E G A', 'Am': 'A C E G', 'F': 'F A C D', 'G7': 'G B D F', 'Dm7': 'D F A C', 'Fm': 'F Ab C D', 'C/E': 'E G C', 'A7': 'A C# E G'}
A1c = ['C', 'Am', 'F', 'G7', 'C', 'Am', 'Dm7', 'G7']
A2c = ['C', 'Am', 'F', 'G7', 'C', 'Am', 'Dm7 G7', 'C']
Bc = ['F', 'Fm', 'C/E', 'A7', 'Dm7', 'G7', 'C', 'G7']

def tune(text): return [(w.split(':')[0], int(w.split(':')[1])) for w in text.split()]
HOOK = 'E5:2 G5:1 A5:2 G5:1 E5:3 r:3  C5:2 D5:1 E5:3 A4:3 r:3  F5:2 A5:1 G5:2 F5:1 E5:3 C5:3  D5:3 B4:2 D5:1 G4:5 r:1 ' \
       'E5:2 G5:1 A5:2 G5:1 E5:3 G5:3  A5:3 E5:2 C5:1 A4:5 r:1 '
A1m = tune(HOOK + 'D5:2 F5:1 A5:2 F5:1 D5:3 F5:3  E5:2 D5:1 B4:3 G4:5 r:1')
A2m = tune(HOOK + 'D5:2 F5:1 A5:3 G5:2 F5:1 D5:3  C5:8 r:4')
Bm = tune('A5:3 C6:3 A5:2 F5:1 r:3  Ab5:3 C6:3 Ab5:2 F5:1 r:3  G5:3 E5:2 G5:1 C6:5 r:1  E5:2 G5:1 Bb5:3 A5:5 r:1 '
          'F5:2 A5:1 D6:3 C6:2 A5:1 F5:3  D5:2 F5:1 B5:3 A5:2 G5:1 F5:3  E5:6 G5:3 E5:3  D5:3 B4:3 G4:5 r:1')
# The breather: four bars with no tune, then the second half of the hook an octave down.
Cm = [('r', 48)] + [(n if n == 'r' else n[:-1] + str(int(n[-1]) - 1), d) for n, d in A1m[-22:]]
assert sum(d for _, d in A1m) == sum(d for _, d in A2m) == sum(d for _, d in Bm) == sum(d for _, d in Cm) == 96

# (chords, tune, lead level, arpeggio level, drums level)
SECTIONS = [(A1c, A1m, 1.0, 0.0, 0.7), (A2c, A2m, 1.0, 0.8, 1.0), (Bc, Bm, 0.9, 1.0, 1.0), (A2c, A2m, 1.0, 0.8, 1.0), (A1c, Cm, 0.7, 1.0, 0.45)]
BARS = 8 * len(SECTIONS)
LEN = int(round(BARS * BAR * UNIT * SR))
TAIL = int(3 * SR)
mix = np.zeros((2, LEN + TAIL))
rng = np.random.default_rng(7)

def put(sig, at, level=1.0, pan=0.0):
    i = int(round(at * SR)); sig = sig[: mix.shape[1] - i]
    mix[0, i:i + len(sig)] += sig * level * min(1, 1 - pan)
    mix[1, i:i + len(sig)] += sig * level * min(1, 1 + pan)

def env(n, attack, release, decay=0.0, sustain=1.0):
    e = np.full(n, sustain); a, r, d = int(attack * SR), int(release * SR), int(decay * SR)
    a = min(a, n // 2); r = min(r, n - a)
    if d: e[a:a + d] = np.linspace(1, sustain, min(d, n - a))[: max(0, min(d, n - a))]
    e[:a] = np.linspace(0, 1, a, endpoint=False)
    if r: e[n - r:] *= np.linspace(1, 0, r)
    return e

def tone(freq, dur, harmonics, vibrato=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    phase = 2 * np.pi * freq * t
    if vibrato: phase += vibrato * freq / 5.5 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.16) / 0.25, 0, 1)
    out = np.zeros(n)
    for k, amp in harmonics:
        if freq * k < 7000: out += amp * np.sin(k * phase)
    return out

# Lead: a quarter-duty pulse wave with its upper harmonics shaved off, so it hums rather than buzzes.
PULSE = [(k, np.sin(np.pi * k * 0.25) / k * (1 / (1 + (k / 7) ** 2))) for k in range(1, 13)]
TRI = [(k, (-1) ** ((k - 1) // 2) / k ** 2) for k in (1, 3, 5, 7)]
BASS = [(1, 0.8), (2, 0.6), (3, 0.34), (4, 0.16), (5, 0.06)]   # plenty of overtones: phone speakers cannot play the bottom note itself
KEYS = [(1, 1.0), (2, 0.28), (3, 0.08), (4, 0.05)]

def filtered_noise(dur, lo, hi):
    n = int(dur * SR); spec = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    spec *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    out = np.fft.irfft(spec, n); return out / np.abs(out).max()

BRUSH = filtered_noise(0.22, 900, 5200) * np.exp(-np.arange(int(0.22 * SR)) / (0.055 * SR))
SHAKE = filtered_noise(0.07, 3500, 7500) * np.exp(-np.arange(int(0.07 * SR)) / (0.016 * SR))
tk = np.arange(int(0.2 * SR)) / SR
KICK = np.sin(2 * np.pi * (48 * tk + (105 - 48) * 0.035 * (1 - np.exp(-tk / 0.035)))) * np.exp(-tk / 0.07)

def chord_at(chords, unit):
    """The chord sounding at a position in a section, counted in thirds of a beat. A bar may hold two chords."""
    names = chords[unit // BAR].split()
    return names[(unit % BAR) * len(names) // BAR]

for s, (chords, melody, lead_lv, arp_lv, drum_lv) in enumerate(SECTIONS):
    t0 = s * 8 * BAR * UNIT
    # Lead, with a quiet echo three quarters of a beat later on the other side.
    u = 0
    for name, d in melody:
        if name != 'r':
            f, dur = hz(midi(name)), d * UNIT * 0.94
            sig = tone(f, dur, PULSE, vibrato=0.022) * env(int(dur * SR), 0.014, 0.09, 0.12, 0.72)
            put(sig, t0 + u * UNIT, 0.17 * lead_lv, -0.12)
            put(sig, t0 + u * UNIT + 0.75 * BEAT, 0.045 * lead_lv, 0.45)
            put(sig, t0 + u * UNIT + 1.5 * BEAT, 0.017 * lead_lv, -0.5)
        u += d
    for bar in range(8):
        for beat in range(4):
            unit = bar * BAR + beat * 3; at = t0 + unit * UNIT
            notes = [midi(n + '3') for n in CHORD[chord_at(chords, unit)].split()]
            root = notes[0] - 12
            # Walking bass: root, a chord tone, another, then a half-step lean into the next bar's root.
            nxt = midi(CHORD[chord_at(chords if bar < 7 else SECTIONS[(s + 1) % len(SECTIONS)][0], ((bar + 1) % 8) * BAR)].split()[0] + '2')
            walk = [root, notes[1] - 12, notes[2] - 12, nxt + (1 if (bar + s) % 2 else -1)][beat]
            if len(chords[bar].split()) > 1 and beat == 2: walk = root
            while walk > midi('E3'): walk -= 12
            while walk < midi('B1'): walk += 12
            n = int(BEAT * 0.92 * SR)
            put(tone(hz(walk), BEAT * 0.92, BASS) * env(n, 0.008, 0.07) * np.exp(-np.arange(n) / (0.5 * SR)), at, 0.105)
            # Chord stabs on the backbeat, plus a held pad under everything.
            if beat in (1, 3):
                n = int(0.3 * SR)
                for k, m in enumerate(notes):
                    put(tone(hz(m + 12), 0.3, KEYS) * env(n, 0.006, 0.12) * np.exp(-np.arange(n) / (0.11 * SR)), at, 0.052, 0.3 - 0.12 * k)
            if beat == 0 or len(chords[bar].split()) > 1 and beat == 2:
                hold = (2 if len(chords[bar].split()) > 1 else 4) * BEAT; n = int(hold * SR)
                for k, m in enumerate(notes):
                    put(tone(hz(m + 12), hold, [(1, 1.0), (2, 0.12)]) * env(n, 0.35, 0.5), at, 0.017, -0.35 + 0.22 * k)
            # Triangle arpeggio in swung eighths: up through the chord, the way handheld-game tunes fill the middle.
            if arp_lv:
                for j, off in enumerate((0, 2)):
                    m = notes[(beat * 2 + j) % len(notes)] + 12 + (12 if (beat * 2 + j) >= len(notes) else 0)
                    dur = (2 if off == 0 else 1) * UNIT * 0.9; n = int(dur * SR)
                    put(tone(hz(m), dur, TRI) * env(n, 0.006, 0.05), at + off * UNIT, 0.056 * arp_lv, 0.28 if j else -0.3)
            # Drums, low in the mix: soft kick on 1 and 3, a brush on 2 and 4, a shaker shuffling the swung eighths.
            if beat in (0, 2): put(KICK, at, 0.1 * drum_lv)
            else: put(BRUSH, at, 0.055 * drum_lv, 0.1)
            put(SHAKE, at, 0.014 * drum_lv, -0.25); put(SHAKE, at + 2 * UNIT, 0.024 * drum_lv, -0.25)

# A little room: each side convolved with a short burst of fading noise.
def room(x, seed):
    n = int(1.1 * SR); r = np.random.default_rng(seed).standard_normal(n) * np.exp(-np.arange(n) / (0.26 * SR)); r[: int(0.012 * SR)] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(r, size), size)[: len(x)] / np.sqrt((r ** 2).sum())
wet = np.stack([room(mix[0], 1), room(mix[1], 2)])
mix = mix + 0.16 * wet

# Fold the ringing end back onto the start so the loop has no seam, then roll off the highs and lows.
mix[:, :TAIL] += mix[:, LEN:LEN + TAIL]; mix = mix[:, :LEN]
f = np.fft.rfftfreq(LEN, 1 / SR)
shape = (1 / np.sqrt(1 + (f / 6500) ** 4)) * (1 / np.sqrt(1 + (38 / np.maximum(f, 1)) ** 4))
mix = np.fft.irfft(np.fft.rfft(mix, axis=1) * shape, LEN, axis=1)
mix = np.tanh(mix / np.abs(mix).max() * 1.15) * 0.62

here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, '..', 'music.m4a')
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', out], input=pcm, check=True)
if len(sys.argv) > 1: open(sys.argv[1], 'wb').write(pcm)   # raw copy, for checking the loop
print(f'{BARS} bars, {LEN / SR:.1f}s, {os.path.getsize(out) // 1024} KB')
