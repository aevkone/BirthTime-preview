/* Проверка шансов BirthTime.
   Считается в браузере, никуда не отправляется. Правила совпадают
   с registry/holders.py в приватном репозитории проекта. */
(function () {
  'use strict';

  var CURRENT_YEAR = new Date().getFullYear();
  var RETENTION_YEARS = 25;     // норматив хранения документов роддома
  var FORM_WITH_HOUR = 1984;    // форма 103/у-84 со строкой «час»

  // Только число и статусы направлений. Названия учреждений — результат маршрута,
  // клиент получает их после оплаты, поэтому здесь их нет.
  // status: 'ok' — путь проверен, 'check' — нужно проверить запросом
  function directions(city, year) {
    var fresh = CURRENT_YEAR - year <= RETENTION_YEARS ? 'ok' : 'check';
    var list = [city === 'Москва' ? 'ok' : 'check'];
    if (year >= FORM_WITH_HOUR) list.push('check');
    if (city === 'Ижевск' && year <= 2019) { list.push('check'); list.push('check'); }
    list.push(fresh);
    list.push(fresh);
    return list;
  }

  function chance(city, year) {
    var reasons = [];
    var level;
    if (CURRENT_YEAR - year <= RETENTION_YEARS) {
      level = 'high';
      reasons.push('Нормативный срок хранения документов о родах ещё не прошёл.');
    } else if (year >= FORM_WITH_HOUR) {
      level = 'mid';
      reasons.push('Нормативный срок хранения прошёл, но в те годы время рождения записывали сразу в несколько документов — часть из них хранится дольше.');
    } else {
      level = 'low';
      reasons.push('Документы тех лет сохранились не везде, поэтому проверять придётся несколько мест.');
    }
    if (city === 'Москва') reasons.push('Для Москвы один из путей хранения нужных документов мы уже проверили.');
    reasons.push('Семейные документы — обменная карта, выписка, бирка — стоит проверить в первую очередь.');
    return { level: level, reasons: reasons };
  }

  var LEVEL_TEXT = { high: 'Шансы выше среднего', mid: 'Шансы средние', low: 'Шансы ниже среднего' };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function render(box, city, year) {
    var c = chance(city, year);
    box.textContent = '';

    var head = el('div', 'cr-head');
    head.appendChild(el('span', 'cr-level cr-' + c.level, LEVEL_TEXT[c.level]));
    head.appendChild(el('span', 'cr-meta', (city === 'Другой' ? 'Другой город' : city) + ', ' + year));
    box.appendChild(head);

    var why = el('ul', 'cr-reasons');
    c.reasons.forEach(function (r) { why.appendChild(el('li', '', r)); });
    box.appendChild(why);

    var d = directions(city, year);
    var ok = d.filter(function (x) { return x === 'ok'; }).length;
    box.appendChild(el('p', 'cr-sub', 'Нашли ' + d.length + ' ' + (d.length < 5 ? 'направления' : 'направлений') + ' поиска' +
      (ok ? ', из них с проверенным путём — ' + ok : '') + '. Запросы уйдут во все сразу.'));
    var list = el('ul', 'cr-holders cr-locked');
    d.forEach(function (status, i) {
      var li = el('li', 'cr-holder');
      var txt = el('span', 'cr-holder-text');
      txt.appendChild(el('b', '', 'Учреждение ' + (i + 1)));
      var bar = el('span', 'cr-lock-bar');
      bar.style.width = (52 + (i * 17) % 40) + '%';
      bar.setAttribute('aria-hidden', 'true');
      txt.appendChild(bar);
      li.appendChild(txt);
      li.appendChild(el('span', 'cr-tag cr-tag-' + status, status === 'ok' ? 'путь проверен' : 'проверим запросом'));
      list.appendChild(li);
    });
    box.appendChild(list);
    box.appendChild(el('p', 'cr-lock-note', 'Названия, адреса и готовые запросы откроются в твоём маршруте после оплаты: найти, кто хранит запись сейчас, — и есть наша работа.'));

    var note = city === 'Другой'
      ? 'Сопровождение пока работает в Москве и Ижевске. Маршрут для другого города можно получить уже сейчас.'
      : 'Маршрут мы готовим за 48 часов. Учреждения обычно отвечают в течение месяца; точный срок зависит от адресата.';
    box.appendChild(el('p', 'cr-note', note));
    box.appendChild(el('p', 'cr-fine', 'Это предварительная оценка по общим правилам. Результат зависит от сохранности конкретных документов и не гарантируется.'));

    var cta = el('a', 'button button-lg', 'Оформить поиск');
    cta.href = 'order.html';
    box.appendChild(cta);

    box.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('check-form');
    if (!form) return;
    var cityInput = document.getElementById('check-city');
    var yearInput = document.getElementById('check-year');
    var error = document.getElementById('check-error');
    var box = document.getElementById('check-result');
    yearInput.max = String(CURRENT_YEAR);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var year = parseInt(yearInput.value, 10);
      if (!year || year < 1930 || year > CURRENT_YEAR) {
        error.textContent = 'Укажи год от 1930 до ' + CURRENT_YEAR + '.';
        error.hidden = false;
        yearInput.setAttribute('aria-invalid', 'true');
        yearInput.focus();
        return;
      }
      error.hidden = true;
      yearInput.removeAttribute('aria-invalid');
      render(box, cityInput.value, year);
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
})();
