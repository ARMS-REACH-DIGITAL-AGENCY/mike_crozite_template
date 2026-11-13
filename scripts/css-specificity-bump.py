#!/usr/bin/env python3
"""Raise every selector in a CSS file by exactly one class of specificity.

Why (Nov 13, 2026): the flip-card styles used to be an inline <style> that
came after YatStyles, so at equal specificity the card's rules won. As an
imported stylesheet they load before YatStyles, and an older YatStyles rule
(.yat-front-content { justify-content: space-between; padding: 12px })
started winning: the name printed over the YAT?STATS mark. Adding one class
(:not(.yat-css-k), which matches every element) to each selector keeps
every win the inline block had, while a rule elsewhere that was one class
stronger still ties and, coming later, still wins. Idempotent.
Usage: css-specificity-bump.py FILE...
"""
import re, sys
MARK = ':not(.yat-css-k)'

def split_top(s, ch):
    out, depth, cur = [], 0, ''
    for c in s:
        if c in '([': depth += 1
        elif c in ')]': depth -= 1
        if c == ch and depth == 0: out.append(cur); cur = ''
        else: cur += c
    out.append(cur); return out

def bump(sel):
    if MARK in sel: return sel
    lead = re.match(r'\s*', sel).group(0); tail = re.search(r'\s*$', sel).group(0)
    core = sel.strip()
    # end of the last compound selector = whole string; place before a pseudo-element
    depth, pe = 0, None
    for i, c in enumerate(core):
        if c in '([': depth += 1
        elif c in ')]': depth -= 1
        elif depth == 0 and core.startswith('::', i): pe = i
        elif depth == 0 and c in ' >+~': pe = None
    if pe is not None: core = core[:pe] + MARK + core[pe:]
    else: core = core + MARK
    return lead + core + tail

def transform(css):
    out, i, stack = [], 0, []
    while i < len(css):
        if css.startswith('/*', i):
            j = css.index('*/', i) + 2; out.append(css[i:j]); i = j; continue
        j = i
        while j < len(css) and css[j] not in '{};' and not css.startswith('/*', j): j += 1
        if j >= len(css): out.append(css[i:]); break
        if css.startswith('/*', j): out.append(css[i:j]); i = j; continue
        chunk, c = css[i:j], css[j]
        if c == '{':
            prelude = chunk.strip()
            in_kf = any(s.startswith('@keyframes') or s.startswith('@-webkit-keyframes') for s in stack)
            if prelude.startswith('@') or in_kf or not prelude:
                out.append(chunk)
            else:
                out.append(','.join(bump(s) for s in split_top(chunk, ',')))
            stack.append(prelude); out.append('{')
        elif c == '}':
            if stack: stack.pop()
            out.append(chunk + '}')
        else:
            out.append(chunk + ';')
        i = j + 1
    return ''.join(out)

for f in sys.argv[1:]:
    s = open(f).read(); t = transform(s)
    open(f, 'w').write(t)
    print(f, 'selectors bumped:', t.count(MARK) - s.count(MARK))
