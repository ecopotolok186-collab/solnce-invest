#!/usr/bin/env python3
"""Независимая проверка модели на точных дробях, без кода calc.js.

Запуск: python3 tests/verify_independent.py
"""
import calendar
from datetime import date
from fractions import Fraction as F
from decimal import Decimal, ROUND_HALF_UP

START = date(2026, 11, 6)
AMOUNTS = [500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000, 15_000_000, 7_500_000]


def rnd(x):
    return int((Decimal(x.numerator) / Decimal(x.denominator)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def add_months(d, n):
    z = d.month - 1 + n
    y, m = d.year + z // 12, z % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def model(amount):
    k = F(amount, 7_500_000)
    a, b, c = rnd(250_000 * k), rnd(350_000 * k), rnd(F(587_500) * k)
    pay = [0] * 6 + [a] * 6 + [b] * 12 + [c] * 12
    total = rnd(F(amount) * F(17, 10))
    pay[-1] += total - sum(pay)
    return pay, total, (a, b, c)


def xirr(amount, pay):
    flows = [(0, -amount)] + [((add_months(START, i + 1) - START).days, x) for i, x in enumerate(pay)]
    f = lambda r: sum(cf / (1 + r) ** (t / 365) for t, cf in flows)
    lo, hi = 0.0, 5.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return lo


print(f"{'Сумма':>12} {'7-12':>9} {'13-24':>9} {'25-36':>10} {'посл.':>10} {'доход':>11} {'всего':>11} {'XIRR':>8}")
for amount in AMOUNTS:
    pay, total, (a, b, c) = model(amount)
    assert sum(pay) == total
    assert total - amount == rnd(F(amount) * F(7, 10))
    print(f"{amount:>12,} {a:>9,} {b:>9,} {c:>10,} {pay[-1]:>10,} {total - amount:>11,} {total:>11,} {xirr(amount, pay) * 100:>7.3f}%")
print("Простое деление 70% / 3 года = 23.333% (для сравнения, не XIRR)")
