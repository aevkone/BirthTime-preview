/* Проверка шансов BirthTime.
   Считается в браузере, никуда не отправляется. Правила совпадают
   с registry/holders.py в приватном репозитории проекта. */
(function () {
  'use strict';

  var CURRENT_YEAR = new Date().getFullYear();
  var RETENTION_YEARS = 25;     // норматив хранения документов роддома
  var FORM_WITH_HOUR = 1984;    // форма 103/у-84 со строкой «час»

  // status: 'ok' — путь проверен, 'check' — нужно проверить запросом
  function holders(city, year) {
    var list = [];
    if (city === 'Москва') {
      list.push({ name: 'ГБУ «Мосархив»', doc: 'Детская карта из поликлиники — в ней часто есть выписка из роддома', status: 'ok' });
    } else {
      list.push({ name: 'Детская поликлиника или её архив', doc: 'Детская карта — в ней часто есть выписка из роддома', status: 'check' });
    }
    if (year >= FORM_WITH_HOUR) {
      list.push({ name: 'ЗАГС', doc: 'Медицинское свидетельство о рождении — в нём была строка «час»', status: 'check' });
    }
    if (city === 'Ижевск' && year <= 2019) {
      list.push({ name: 'Первая РКБ', doc: 'Документы бывшего роддома № 3, если ты родился там', status: 'check' });
      list.push({ name: 'Правопреемники заводских медсанчастей', doc: 'Часть родов в Ижевске шла в роддомах при МСЧ', status: 'check' });
    }
    list.push({ name: 'Роддом или его правопреемник', doc: 'Запись о новорождённом и журнал родов', status: CURRENT_YEAR - year <= RETENTION_YEARS ? 'ok' : 'check' });
    list.push({ name: 'Роддом — по запросу мамы', doc: 'История родов — её документ, запрос подаёт она', status: CURRENT_YEAR - year <= RETENTION_YEARS ? 'ok' : 'check' });
    return list;
  }

  function chance(city, year) {
    var reasons = [];
    var level;
    if (CURRENT_YEAR - year <= RETENTION_YEARS) {
      level = 'high';
      reasons.push('Документы роддома ещё в пределах срока хранения — 25 лет.');
    } else if (year >= FORM_WITH_HOUR) {
      level = 'mid';
      reasons.push('Срок хранения документов роддома истёк, но в медицинском свидетельстве тех лет была строка «час», и оно уходило в ЗАГС.');
    } else {
      level = 'low';
      reasons.push('Срок хранения документов роддома давно истёк. Была ли строка времени в свидетельствах до 1984 года — ещё проверяем.');
    }
    if (city === 'Москва') reasons.push('В Москве детские карты поликлиник собраны в одном месте — в Мосархиве.');
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

    box.appendChild(el('p', 'cr-sub', 'Куда отправим запросы — одновременно:'));
    var list = el('ul', 'cr-holders');
    holders(city, year).forEach(function (h) {
      var li = el('li', 'cr-holder');
      var txt = el('span', 'cr-holder-text');
      txt.appendChild(el('b', '', h.name));
      txt.appendChild(el('span', '', h.doc));
      li.appendChild(txt);
      li.appendChild(el('span', 'cr-tag cr-tag-' + h.status, h.status === 'ok' ? 'путь проверен' : 'проверим запросом'));
      list.appendChild(li);
    });
    box.appendChild(list);

    var note = city === 'Другой'
      ? 'Сопровождение пока работает в Москве и Ижевске. Маршрут для другого города можно получить уже сейчас.'
      : 'Срок ответа учреждений по закону — до 30 дней. Маршрут мы готовим за 48 часов.';
    box.appendChild(el('p', 'cr-note', note));
    box.appendChild(el('p', 'cr-fine', 'Это предварительная оценка по общим правилам. Результат зависит от сохранности конкретных документов и не гарантируется.'));

    var cta = el('a', 'button button-lg', 'Посмотреть тарифы');
    cta.href = '#pricing';
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
