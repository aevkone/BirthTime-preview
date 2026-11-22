/* Трекер поиска BirthTime.
   Читает cases/<код>.json. В файле дела нет имён и документов —
   только хранители, даты, входящие номера и статусы. */
(function () {
  'use strict';

  var STAGES = [
    { id: 'check', title: 'Проверка шансов' },
    { id: 'route', title: 'Маршрут готов' },
    { id: 'sent', title: 'Запросы отправлены' },
    { id: 'waiting', title: 'Ждём ответы' },
    { id: 'result', title: 'Результат' }
  ];

  var STATUS = {
    prepared:   { text: 'Подготовлен — уйдёт после оплаты', tone: 'idle' },
    sent:       { text: 'Отправлен', tone: 'sent' },
    registered: { text: 'Зарегистрирован', tone: 'sent' },
    in_work:    { text: 'В работе', tone: 'work' },
    found:      { text: 'Ответ получен: время найдено', tone: 'done' },
    no_time:    { text: 'Ответ получен: времени в документе нет', tone: 'warn' },
    redirected: { text: 'Переадресовали к другому хранителю', tone: 'warn' },
    refused:    { text: 'Отказ — разбираем причину', tone: 'bad' },
    overdue:    { text: 'Срок прошёл — выясняем причину', tone: 'bad' },
    self_send:  { text: 'Письмо готово — отправляет заявитель', tone: 'idle' }
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    var p = value.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function days(from, to) {
    return Math.round((to - from) / 86400000);
  }

  function fmt(value) {
    var d = parseDate(value);
    if (!d) return '';
    var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
                  'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return d.getUTCDate() + ' ' + months[d.getUTCMonth()];
  }

  function requestCard(req, asOf) {
    var info = STATUS[req.status] || STATUS.prepared;
    var limit = req.deadline_days || 30;
    var start = parseDate(req.registered) || parseDate(req.sent);
    var end = parseDate(req.reply) || asOf;
    var passed = start ? Math.max(0, days(start, end)) : 0;
    var closed = !!req.reply;
    var tone = info.tone;
    if (!closed && start && passed > limit) { tone = 'bad'; info = STATUS.overdue; }

    var card = el('article', 'st-req st-' + tone);
    var top = el('div', 'st-req-top');
    var name = el('div', 'st-req-name');
    name.appendChild(el('h3', '', req.holder));
    name.appendChild(el('p', '', req.document + ' · ' + req.channel));
    top.appendChild(name);
    top.appendChild(el('span', 'st-chip st-chip-' + tone, info.text));
    card.appendChild(top);

    if (start) {
      var bar = el('div', 'st-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', closed ? 'Ответ за ' + passed + ' дн.' : 'Прошло ' + passed + ' из ' + limit + ' дней');
      var fill = el('span', 'st-bar-fill');
      fill.style.width = Math.min(100, Math.round(passed / limit * 100)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    var meta = el('dl', 'st-req-meta');
    function row(label, value) {
      if (!value) return;
      var wrap = el('div');
      wrap.appendChild(el('dt', '', label));
      wrap.appendChild(el('dd', '', value));
      meta.appendChild(wrap);
    }
    row('Отправлен', fmt(req.sent));
    if (req.sent) row('Зарегистрирован', req.registered ? fmt(req.registered) + (req.number ? ', вх. № ' + req.number : '') : 'ждём подтверждения');
    row(closed ? 'Ответ' : 'Ожидаемый срок', closed ? fmt(req.reply) + ' — за ' + passed + ' дн.' : (start ? 'день ' + passed + ' из ' + limit : limit + ' дней'));
    card.appendChild(meta);

    if (req.result) card.appendChild(el('p', 'st-req-result', req.result));
    return card;
  }

  function render(root, data) {
    root.textContent = '';
    var asOf = parseDate(data.as_of) || new Date();

    var head = el('section', 'st-head');
    if (data.example) head.appendChild(el('span', 'tp-tag', 'Пример'));
    head.appendChild(el('h1', '', 'Поиск № ' + data.case));
    head.appendChild(el('p', 'st-sub', data.label + (data.plan ? ' · тариф «' + data.plan + '»' : '')));
    root.appendChild(head);

    var stageIndex = Math.max(0, STAGES.map(function (s) { return s.id; }).indexOf(data.stage));
    var stages = el('ol', 'st-stages');
    STAGES.forEach(function (stage, i) {
      var li = el('li', i < stageIndex ? 'is-done' : (i === stageIndex ? 'is-now' : ''));
      li.appendChild(el('span', 'st-stage-dot'));
      li.appendChild(el('span', 'st-stage-title', stage.title));
      if (i === stageIndex) li.setAttribute('aria-current', 'step');
      stages.appendChild(li);
    });
    root.appendChild(stages);

    var reqs = data.requests || [];
    var done = reqs.filter(function (r) { return r.reply; }).length;
    var found = reqs.filter(function (r) { return r.status === 'found'; }).length;
    var summary = el('div', 'st-summary');
    [['Запросов отправлено', String(reqs.length)],
     ['Ответов получено', done + ' из ' + reqs.length],
     ['Время найдено', found ? 'да — в ' + found + ' ' + (found === 1 ? 'источнике' : 'источниках') : 'пока нет'],
     ['Следующая сводка', fmt(data.next_update) || '—']
    ].forEach(function (pair) {
      var box = el('div', 'st-sum');
      box.appendChild(el('span', 'st-sum-label', pair[0]));
      box.appendChild(el('b', '', pair[1]));
      summary.appendChild(box);
    });
    root.appendChild(summary);

    var grid = el('section', 'st-reqs');
    grid.appendChild(el('h2', '', 'Куда ушли запросы'));
    reqs.forEach(function (req) { grid.appendChild(requestCard(req, asOf)); });
    root.appendChild(grid);

    if (data.events && data.events.length) {
      var feed = el('section', 'st-feed');
      feed.appendChild(el('h2', '', 'Что происходило'));
      var ol = el('ol', 'st-events');
      data.events.slice().reverse().forEach(function (ev) {
        var li = el('li');
        li.appendChild(el('time', '', fmt(ev.date)));
        li.appendChild(el('span', '', ev.text));
        ol.appendChild(li);
      });
      feed.appendChild(ol);
      root.appendChild(feed);
    }

    root.appendChild(el('p', 'note st-fine', 'Скорость ответа зависит от учреждений; ожидаемый срок указан у каждого запроса. Мы пишем тебе на каждом шаге и раз в неделю, даже если новостей нет. Найти документ мы не гарантируем.'));
  }

  function fail(root, text) {
    root.textContent = '';
    root.appendChild(el('h1', '', 'Поиск не найден'));
    root.appendChild(el('p', 'st-sub', text));
    var link = el('a', 'link-strong', 'Посмотреть пример трекера');
    link.href = 'status.html?case=demo';
    root.appendChild(link);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('st-root');
    var cfg = window.BIRTHTIME_CONFIG || {};
    var params = new URLSearchParams(location.search);
    var code = params.get('case') || 'demo';
    var token = params.get('t') || '';
    function show(data) { render(root, data); document.title = 'Поиск № ' + data.case + ' — BirthTime'; }

    if (code === 'local') {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('birthtime-local-case') || 'null'); } catch (e) { saved = null; }
      if (saved) { show(saved); return; }
      fail(root, 'Демо-трекер хранится только в этой вкладке браузера. Оформи заявку ещё раз или посмотри пример.');
      return;
    }
    var live = cfg.mode === 'live' && cfg.apiBase && /^BT-[0-9A-Z]{6}$/.test(code);
    var url;
    if (live) {
      url = cfg.apiBase.replace(/\/$/, '') + '/cases/' + code + '?t=' + encodeURIComponent(token);
    } else if (/^[a-z0-9-]{3,40}$/i.test(code)) {
      url = 'cases/' + code.toLowerCase() + '.json';
    } else { fail(root, 'Проверь код поиска в ссылке.'); return; }
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(show)
      .catch(function () { fail(root, 'По этой ссылке нет поиска. Проверь ссылку из письма или напиши нам.'); });
  });
})();
