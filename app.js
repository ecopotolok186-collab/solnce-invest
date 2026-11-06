/* SOLNCE INVEST: интерфейс. Все расчёты находятся в calc.js. */
(function () {
  'use strict';

  var C = window.Calc;
  var QUICK = [
    [500000, '500 тыс.'], [1000000, '1 млн'], [2000000, '2 млн'], [3000000, '3 млн'],
    [5000000, '5 млн'], [10000000, '10 млн'], [15000000, '15 млн']
  ];
  var DEFAULT_AMOUNT = 5000000;
  var HINT = 'Вручную: от 500\u00A0000 до 15\u00A0000\u00A0000\u00A0₽';
  var COUNT_WORDS = { 6: '6 платежей', 12: '12 платежей' };

  function el(id) { return document.getElementById(id); }

  var input = el('amount-input');
  var ghost = el('amount-ghost');
  var slider = el('slider');
  var hint = el('amount-hint');
  var field = input.closest('.amount-field');
  var chart = el('chart');
  var readout = el('chart-readout');

  var now = new Date();
  var startDate = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };

  var result = null;
  var activeMonth = null;
  var tween = null;
  var tweenEnd = null;
  var urlTimer = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Статичная разметка ---------- */

  var chipEls = QUICK.map(function (q) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = q[1];
    b.addEventListener('click', function () { setAmount(q[0], { animate: true }); });
    el('chips').appendChild(b);
    return { el: b, value: q[0] };
  });

  var periodEls = [1, 2, 3, 4].map(function () {
    var row = document.createElement('div');
    row.className = 'period';
    row.innerHTML =
      '<div class="period-head"><span class="period-name"></span><span class="period-monthly"></span></div>' +
      '<div class="period-bar"><div class="period-fill"></div></div>' +
      '<div class="period-foot"><span class="period-count"></span><span class="period-total"></span></div>';
    el('periods').appendChild(row);
    return {
      name: row.querySelector('.period-name'),
      monthly: row.querySelector('.period-monthly'),
      fill: row.querySelector('.period-fill'),
      count: row.querySelector('.period-count'),
      total: row.querySelector('.period-total')
    };
  });

  var barEls = [];
  for (var i = 0; i < C.TERM; i++) {
    var slot = document.createElement('div');
    slot.className = 'bar-slot';
    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.animationDelay = (i * 12) + 'ms';
    slot.appendChild(bar);
    chart.appendChild(slot);
    barEls.push(bar);
  }

  /* Подписи уровней над первым столбцом каждого периода выплат */
  var stepLabels = [7, 13, 25].map(function (month) {
    var s = document.createElement('span');
    s.className = 'step-label';
    s.style.left = ((month - 1) / C.TERM * 100) + '%';
    chart.appendChild(s);
    return { el: s, month: month };
  });

  [1, 7, 13, 25, 36].forEach(function (month) {
    var s = document.createElement('span');
    s.textContent = month === 1 ? '1 мес.' : String(month);
    s.style.left = month === 1 ? '0' : month === 36 ? '100%' : ((month - 0.5) / C.TERM * 100) + '%';
    el('chart-axis').appendChild(s);
  });

  /* ---------- Вывод ---------- */

  function render() {
    var r = result;
    var max = Math.max.apply(null, r.payments);

    r.periods.forEach(function (p, idx) {
      var e = periodEls[idx];
      e.name.textContent = 'Месяцы ' + p.from + '–' + p.to;
      e.monthly.textContent = C.formatRub(p.monthly) + '/мес.';
      e.fill.style.width = (p.monthly / max * 100) + '%';
      e.count.textContent = p.monthly === 0
        ? 'Без выплат'
        : p.lastPayment !== p.monthly
          ? 'Последний платёж ' + C.formatRub(p.lastPayment)
          : COUNT_WORDS[p.count];
      e.total.textContent = 'За период ' + C.formatRub(p.total);
    });

    r.payments.forEach(function (x, idx) {
      barEls[idx].style.height = (x / max * 100) + '%';
      barEls[idx].classList.toggle('is-zero', x === 0);
      barEls[idx].classList.toggle('is-active', activeMonth === idx);
    });

    stepLabels.forEach(function (s) {
      var x = r.payments[s.month - 1];
      s.el.textContent = C.formatNumber(x);
      s.el.style.bottom = (x / max * (chart.clientHeight - paddingTop()) ) + 'px';
    });

    chart.setAttribute('aria-label',
      'Столбчатый график выплат за 36 месяцев. ' + r.periods.map(function (p) {
        return 'Месяцы ' + p.from + '–' + p.to + ': ' + C.formatRub(p.monthly) + ' в месяц';
      }).join('. '));

    renderReadout();

    el('metric-amount').textContent = C.formatRub(r.amount);
    el('metric-xirr').textContent = '≈ ' + C.formatPercent(r.xirr) + ' годовых';
    el('metric-xirr-note').textContent =
      'Рассчитана по датам денежных потоков: вложение ' + C.formatDate(r.start) +
      ', платежи ежемесячно по ' + C.formatDate(r.dates[C.TERM - 1]) +
      '. Учитывает отсрочку и возврат капитала частями. Не равна 70%, делённым на 3 года.';

    chipEls.forEach(function (c) {
      c.el.setAttribute('aria-pressed', String(c.value === r.amount));
    });
  }

  function paddingTop() { return parseFloat(getComputedStyle(chart).paddingTop) || 0; }

  function renderReadout() {
    readout.textContent = '';
    if (activeMonth === null) {
      readout.textContent = 'Коснитесь столбца, чтобы увидеть месяц, дату и сумму';
      return;
    }
    var paidSoFar = result.payments.slice(0, activeMonth + 1).reduce(function (s, x) { return s + x; }, 0);
    var left = document.createElement('span');
    left.textContent = 'Месяц ' + (activeMonth + 1) + ', ' + C.formatDate(result.dates[activeMonth]) + ': ';
    var val = document.createElement('b');
    val.textContent = C.formatRub(result.payments[activeMonth]);
    left.appendChild(val);
    var right = document.createElement('span');
    right.textContent = 'Выплачено всего ' + C.formatRub(paidSoFar);
    readout.appendChild(left);
    readout.appendChild(right);
  }

  function showTotals(income, total) {
    el('income').textContent = '+' + C.formatRub(income);
    el('total').textContent = C.formatRub(total);
  }

  function cancelTween() {
    if (tween) cancelAnimationFrame(tween);
    clearTimeout(tweenEnd);
    tween = null;
  }

  function animateTotals(from, to) {
    cancelTween();
    if (!from || reducedMotion) { showTotals(to.income, to.total); return; }
    var t0 = performance.now();
    function step(t) {
      var k = Math.min(1, (t - t0) / 320);
      var e = 1 - Math.pow(1 - k, 3);
      showTotals(from.income + (to.income - from.income) * e, from.total + (to.total - from.total) * e);
      tween = k < 1 ? requestAnimationFrame(step) : null;
    }
    tween = requestAnimationFrame(step);
    /* Браузер может приостановить анимацию (энергосбережение): точная сумма появится в любом случае */
    tweenEnd = setTimeout(function () {
      cancelTween();
      showTotals(to.income, to.total);
    }, 360);
  }

  function showAmount(amount) {
    var text = C.formatNumber(amount);
    input.value = text;
    ghost.textContent = text;
  }

  function syncSlider(amount) {
    slider.value = String(amount);
    slider.style.setProperty('--p', String((amount - C.MIN_AMOUNT) / (C.MAX_AMOUNT - C.MIN_AMOUNT)));
    slider.setAttribute('aria-valuetext', C.formatRub(amount));
  }

  function setError(message) {
    hint.textContent = message || HINT;
    hint.classList.toggle('is-error', Boolean(message));
    field.classList.toggle('is-error', Boolean(message));
  }

  /* source 'input' не переписывает поле, чтобы не мешать вводу; source 'slider' не трогает ручку */
  function setAmount(amount, opts) {
    opts = opts || {};
    var previous = result;
    result = C.calculate(amount, startDate);
    if (opts.animate) {
      animateTotals(previous, result);
    } else {
      cancelTween();
      showTotals(result.income, result.total);
    }
    if (opts.source !== 'input') showAmount(amount);
    if (opts.source !== 'slider') syncSlider(amount);
    else slider.style.setProperty('--p', String((amount - C.MIN_AMOUNT) / (C.MAX_AMOUNT - C.MIN_AMOUNT)));
    setError(null);
    render();
    scheduleUrlUpdate();
  }

  /* ---------- Ссылка ---------- */

  function shareUrl() {
    return location.origin + location.pathname + '?amount=' + result.amount;
  }

  function scheduleUrlUpdate() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try { history.replaceState(null, '', shareUrl()); } catch (e) { /* не критично */ }
    }, 300);
  }

  /* ---------- Ручной ввод ---------- */

  function digitsOf(s) { return s.replace(/\D/g, ''); }

  input.addEventListener('focus', function () {
    setTimeout(function () { input.select(); }, 0);
  });

  input.addEventListener('input', function () {
    var caret = input.selectionStart === null ? input.value.length : input.selectionStart;
    var digitsBefore = digitsOf(input.value.slice(0, caret)).length;
    var digits = digitsOf(input.value).replace(/^0+/, '').slice(0, 9);
    var formatted = digits ? C.formatNumber(parseInt(digits, 10)) : '';

    input.value = formatted;
    ghost.textContent = formatted || ' ';

    /* Каретка остаётся после той же цифры, несмотря на новые пробелы */
    var pos = 0;
    var seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[pos])) seen++;
      pos++;
    }
    input.setSelectionRange(pos, pos);

    var value = digits ? parseInt(digits, 10) : 0;
    if (value >= C.MIN_AMOUNT && value <= C.MAX_AMOUNT) {
      setAmount(value, { source: 'input' });
    } else {
      setError(value > C.MAX_AMOUNT
        ? 'Максимальная сумма: 15 000 000 ₽'
        : 'Минимальная сумма: 500 000 ₽');
    }
  });

  input.addEventListener('blur', function () {
    var digits = digitsOf(input.value);
    var value = digits ? parseInt(digits, 10) : result.amount;
    setAmount(C.clamp(value));
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') input.blur();
  });

  /* ---------- Ползунок ---------- */

  slider.addEventListener('input', function () {
    setAmount(parseInt(slider.value, 10), { source: 'slider' });
  });

  /*
   * На iPhone штатный ползунок двигается только за круглую ручку.
   * Касание дорожки и перетаскивание добавлены вручную; вертикальная прокрутка
   * страницы при этом не меняет сумму, потому что браузер отменяет такое касание.
   */
  var touch = null;

  function amountFromX(x) {
    var rect = slider.getBoundingClientRect();
    var thumb = 30;
    var k = Math.min(1, Math.max(0, (x - rect.left - thumb / 2) / (rect.width - thumb)));
    var raw = C.MIN_AMOUNT + k * (C.MAX_AMOUNT - C.MIN_AMOUNT);
    return Math.round(raw / C.STEP) * C.STEP;
  }

  slider.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch') return;
    touch = { id: e.pointerId, x: e.clientX, moved: false };
  });
  slider.addEventListener('pointermove', function (e) {
    if (!touch || touch.id !== e.pointerId) return;
    if (!touch.moved && Math.abs(e.clientX - touch.x) < 4) return;
    touch.moved = true;
    setAmount(amountFromX(e.clientX));
  });
  slider.addEventListener('pointerup', function (e) {
    if (!touch || touch.id !== e.pointerId) return;
    setAmount(amountFromX(e.clientX));
    touch = null;
  });
  slider.addEventListener('pointercancel', function () { touch = null; });

  /* ---------- График ---------- */

  function setActive(month) {
    if (month === activeMonth) return;
    activeMonth = month;
    barEls.forEach(function (b, idx) { b.classList.toggle('is-active', idx === month); });
    renderReadout();
  }

  function monthFromX(x) {
    var rect = chart.getBoundingClientRect();
    var k = (x - rect.left) / rect.width;
    return Math.min(C.TERM - 1, Math.max(0, Math.floor(k * C.TERM)));
  }

  chart.addEventListener('pointerdown', function (e) { setActive(monthFromX(e.clientX)); });
  chart.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' || e.buttons) setActive(monthFromX(e.clientX));
  });
  chart.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') setActive(null);
  });
  chart.addEventListener('keydown', function (e) {
    var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    var base = activeMonth === null ? (delta > 0 ? -1 : C.TERM) : activeMonth;
    setActive(Math.min(C.TERM - 1, Math.max(0, base + delta)));
  });
  chart.addEventListener('blur', function () { setActive(null); });

  window.addEventListener('resize', function () { render(); });

  /* ---------- Кнопки ---------- */

  var toastTimer = null;
  function toast(message) {
    var t = el('toast');
    t.textContent = message;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2400);
  }

  function legacyCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  el('share').addEventListener('click', function () {
    var url = shareUrl();
    function fallback() {
      copyText(url).then(function (ok) {
        toast(ok ? 'Ссылка на расчёт скопирована' : 'Не удалось скопировать: ' + url);
      });
    }
    if (navigator.share) {
      navigator.share({
        title: 'SOLNCE INVEST',
        text: 'Пример расчёта на ' + C.formatRub(result.amount),
        url: url
      }).catch(function (err) {
        if (!err || err.name !== 'AbortError') fallback();
      });
    } else {
      fallback();
    }
  });

  el('copy').addEventListener('click', function () {
    copyText(C.summaryText(result, shareUrl())).then(function (ok) {
      toast(ok ? 'Расчёт скопирован' : 'Не удалось скопировать расчёт');
    });
  });

  /* ---------- Старт ---------- */

  var fromUrl = C.parseAmountParam(new URLSearchParams(location.search).get('amount'));
  setAmount(fromUrl === null ? DEFAULT_AMOUNT : fromUrl);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* без офлайна тоже работает */ });
    });
  }
})();
