/* Запуск: node --test tests/calc.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const START = { y: 2026, m: 11, d: 6 };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const QUICK = [500000, 1000000, 2000000, 3000000, 5000000, 10000000, 15000000];

test('эталон 7 500 000 ₽ совпадает с заданием', () => {
  const r = C.calculate(7500000, START);
  assert.deepEqual(r.periods.map((p) => p.monthly), [0, 250000, 350000, 587500]);
  assert.equal(r.total, 12750000);
  assert.equal(r.income, 5250000);
  assert.equal(r.payments[35], 587500);
  assert.deepEqual(r.periods.map((p) => p.total), [0, 1500000, 4200000, 7050000]);
});

test('пример 5 000 000 ₽: последний платёж закрывает округление', () => {
  const r = C.calculate(5000000, START);
  assert.equal(r.income, 3500000);
  assert.equal(r.total, 8500000);
  assert.deepEqual(r.periods.map((p) => p.monthly), [0, 166667, 233333, 391667]);
  assert.equal(r.payments[35], 391665);
  assert.equal(sum(r.payments), 8500000);
});

test('все быстрые суммы: 70% за весь срок, платежи по формуле', () => {
  for (const amount of QUICK) {
    const r = C.calculate(amount, START);
    const k = amount / 7500000;
    assert.equal(r.total, Math.round(amount * 1.7));
    assert.equal(r.income, Math.round(amount * 0.7));
    assert.equal(sum(r.payments), r.total);
    assert.equal(r.payments.length, 36);
    assert.deepEqual(r.payments.slice(0, 6), [0, 0, 0, 0, 0, 0]);
    assert.equal(r.periods[1].monthly, Math.round(250000 * k));
    assert.equal(r.periods[2].monthly, Math.round(350000 * k));
    assert.equal(r.periods[3].monthly, Math.round(587500 * k));
    assert.equal(sum(r.periods.map((p) => p.total)), r.total);
    assert.ok(Math.abs(r.payments[35] - r.periods[3].monthly) <= 12);
  }
});

test('каждый шаг ползунка и произвольные суммы сходятся до рубля', () => {
  const amounts = [];
  for (let a = C.MIN_AMOUNT; a <= C.MAX_AMOUNT; a += C.STEP) amounts.push(a);
  assert.equal(amounts.length, 146);
  amounts.push(500001, 777777, 1234567, 3333333, 9999999, 14999999);
  for (const amount of amounts) {
    const r = C.calculate(amount, START);
    assert.equal(sum(r.payments), r.total, String(amount));
    assert.equal(r.total - r.amount, r.income, String(amount));
    assert.ok(Number.isInteger(r.payments[35]), String(amount));
  }
});

test('XIRR: остаток дисконтированных потоков равен нулю, это не 70/3', () => {
  const r = C.calculate(7500000, START);
  const npv = -7500000 + r.payments.reduce(
    (s, x, i) => s + x / Math.pow(1 + r.xirr, C.daysBetween(START, r.dates[i]) / 365), 0);
  assert.ok(Math.abs(npv) < 1, 'NPV = ' + npv);
  assert.ok(r.xirr > 0.7 / 3 + 0.03, 'XIRR заметно выше простого деления');
  assert.ok(r.xirr < 0.7, 'XIRR не равен 70% годовых');
});

test('XIRR почти не зависит от суммы', () => {
  const rates = QUICK.map((a) => C.calculate(a, START).xirr);
  assert.ok(Math.max(...rates) - Math.min(...rates) < 1e-5);
});

test('даты: конец месяца и високосный год', () => {
  assert.deepEqual(C.addMonths({ y: 2027, m: 1, d: 31 }, 1), { y: 2027, m: 2, d: 28 });
  assert.deepEqual(C.addMonths({ y: 2028, m: 1, d: 31 }, 1), { y: 2028, m: 2, d: 29 });
  assert.deepEqual(C.addMonths({ y: 2026, m: 11, d: 6 }, 36), { y: 2029, m: 11, d: 6 });
  assert.deepEqual(C.addMonths({ y: 2026, m: 12, d: 6 }, 1), { y: 2027, m: 1, d: 6 });
});

test('сумма из ссылки', () => {
  assert.equal(C.parseAmountParam('5000000'), 5000000);
  assert.equal(C.parseAmountParam('1'), 500000);
  assert.equal(C.parseAmountParam('99999999'), 15000000);
  assert.equal(C.parseAmountParam('abc'), null);
  assert.equal(C.parseAmountParam('-5'), null);
  assert.equal(C.parseAmountParam(null), null);
});

test('текст для копирования', () => {
  const text = C.summaryText(C.calculate(5000000, START), 'https://x/?amount=5000000');
  const plain = text.replace(/ /g, ' ');
  assert.match(plain, /Сумма инвестиций: 5 000 000 ₽/);
  assert.match(plain, /\+3 500 000 ₽ \(\+70% за весь срок\)/);
  assert.match(plain, /Месяцы 25–36: 391 667 ₽\/мес\. \(последний платёж 391 665 ₽\)/);
  assert.match(plain, /не банковский вклад/);
  assert.match(plain, /не гарантирован/);
  assert.doesNotMatch(plain.replace('не гарантирован', ''), /гарантир/i);
});
