/* SOLNCE INVEST: финансовая модель. Работает и в браузере (window.Calc), и в Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE_AMOUNT = 7500000;
  var MIN_AMOUNT = 500000;
  var MAX_AMOUNT = 15000000;
  var STEP = 100000;
  var TERM = 36;

  /* Эталон на 7 500 000 ₽ */
  var PERIODS = [
    { from: 1, to: 6, base: 0 },
    { from: 7, to: 12, base: 250000 },
    { from: 13, to: 24, base: 350000 },
    { from: 25, to: 36, base: 587500 }
  ];

  /* Дата без часового пояса: считаем только в UTC, чтобы перевод часов не менял число дней */
  function toUtc(d) { return Date.UTC(d.y, d.m - 1, d.d); }

  /* Плюс n месяцев; 31 января + 1 месяц = последний день февраля */
  function addMonths(d, n) {
    var zero = d.m - 1 + n;
    var y = d.y + Math.floor(zero / 12);
    var m = ((zero % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return { y: y, m: m + 1, d: Math.min(d.d, last) };
  }

  function daysBetween(a, b) { return Math.round((toUtc(b) - toUtc(a)) / 86400000); }

  /*
   * XIRR, Actual/365 (как в Excel): корень уравнения
   * Σ cf_i / (1 + r)^(дни_i / 365) = 0. Бисекция: функция монотонна,
   * поскольку после вложения идут только положительные потоки.
   */
  function xirr(flows) {
    var t0 = flows[0].date;
    var points = flows.map(function (f) { return { cf: f.amount, t: daysBetween(t0, f.date) / 365 }; });
    function npv(r) {
      return points.reduce(function (sum, p) { return sum + p.cf / Math.pow(1 + r, p.t); }, 0);
    }
    var lo = -0.99;
    var hi = 10;
    if (npv(lo) * npv(hi) > 0) return NaN;
    for (var i = 0; i < 200 && hi - lo > 1e-10; i++) {
      var mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /* amount: целое число рублей; start: { y, m, d }, дата вложения */
  function calculate(amount, start) {
    var total = Math.round((amount * 17) / 10);
    var income = total - amount;

    var payments = [];
    var periods = PERIODS.map(function (p) {
      var monthly = Math.round((amount * p.base) / BASE_AMOUNT);
      for (var month = p.from; month <= p.to; month++) payments.push(monthly);
      return { from: p.from, to: p.to, count: p.to - p.from + 1, monthly: monthly };
    });

    /* Округление даёт расхождение в несколько рублей: его забирает последний платёж */
    var paid = payments.reduce(function (s, x) { return s + x; }, 0);
    payments[TERM - 1] += total - paid;

    periods.forEach(function (p) {
      p.total = payments.slice(p.from - 1, p.to).reduce(function (s, x) { return s + x; }, 0);
      p.lastPayment = payments[p.to - 1];
    });

    var dates = payments.map(function (_, i) { return addMonths(start, i + 1); });
    var flows = [{ date: start, amount: -amount }];
    payments.forEach(function (x, i) { if (x > 0) flows.push({ date: dates[i], amount: x }); });

    return {
      amount: amount,
      income: income,
      total: total,
      roi: income / amount,
      payments: payments,
      dates: dates,
      start: start,
      periods: periods,
      xirr: xirr(flows)
    };
  }

  /* Разделитель разрядов: неразрывный пробел */
  function formatNumber(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function formatRub(n) { return formatNumber(n) + ' ₽'; }
  function formatPercent(x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; }
  function formatDate(d) {
    function pad(v) { return (v < 10 ? '0' : '') + v; }
    return pad(d.d) + '.' + pad(d.m) + '.' + d.y;
  }

  function clamp(amount) { return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, amount)); }

  /* Сумма из ссылки: null, если параметра нет или в нём не число */
  function parseAmountParam(value) {
    if (value === null || value === undefined || !/^\d+$/.test(value)) return null;
    return clamp(parseInt(value, 10));
  }

  function summaryText(r, url) {
    var lines = [
      'SOLNCE INVEST: пример расчёта',
      'Сумма инвестиций: ' + formatRub(r.amount),
      'Доход за 36 месяцев: +' + formatRub(r.income) + ' (+70% за весь срок)',
      'Всего выплат: ' + formatRub(r.total),
      'Эффективная годовая доходность (XIRR): ≈ ' + formatPercent(r.xirr) + ' годовых',
      '',
      'График выплат:'
    ];
    r.periods.forEach(function (p) {
      var line = 'Месяцы ' + p.from + '–' + p.to + ': ' + formatRub(p.monthly) + '/мес.';
      if (p.lastPayment !== p.monthly) line += ' (последний платёж ' + formatRub(p.lastPayment) + ')';
      lines.push(line);
    });
    lines.push('');
    lines.push('Пример условий частного финансирования, не банковский вклад. Доход не гарантирован.');
    if (url) lines.push(url);
    return lines.join('\n');
  }

  return {
    BASE_AMOUNT: BASE_AMOUNT, MIN_AMOUNT: MIN_AMOUNT, MAX_AMOUNT: MAX_AMOUNT, STEP: STEP, TERM: TERM,
    calculate: calculate, xirr: xirr, addMonths: addMonths, daysBetween: daysBetween,
    formatNumber: formatNumber, formatRub: formatRub, formatPercent: formatPercent, formatDate: formatDate,
    clamp: clamp, parseAmountParam: parseAmountParam, summaryText: summaryText
  };
});
