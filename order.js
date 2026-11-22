/* Оформление поиска BirthTime.
   До оплаты клиент видит только число направлений поиска и доверенность:
   какие учреждения получат запросы — результат маршрута, он открывается после оплаты.
   data/directions.json не содержит названий и адресов (registry/export_public.py).
   В демо-режиме данные не покидают браузер. */
(function () {
  'use strict';

  var CFG = window.BIRTHTIME_CONFIG || { mode: 'demo', apiBase: '' };
  var LIVE = CFG.mode === 'live' && !!CFG.apiBase;
  var PRICES = { route: 4900, support: 7900, full: 11900 };
  var TITLES = { route: 'Маршрут за 48 часов', support: 'Сопровождение до ответа', full: 'Под ключ' };

  var state = { step: 1, directions: [], poa: null, created: null };
  var form = document.getElementById('ord-form');
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function val(name) {
    var f = form.elements[name];
    return f ? String(f.value || '').trim().replace(/\s+/g, ' ') : '';
  }
  function checked(name) { var f = form.elements[name]; return !!(f && f.checked); }
  function radio(name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function ruDate(iso) { var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function norm(s) { return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }

  // ── сбор заявки ───────────────────────────────────────────
  function order() {
    var city = val('birth_city_choice') === 'other' ? val('birth_city_other') : val('birth_city_choice');
    var docs = Array.prototype.slice.call(form.querySelectorAll('input[name="home_docs"]:checked')).map(function (x) { return x.value; });
    var mode = radio('mode');
    var o = {
      applicant: { fio: val('fio'), fio_birth: checked('f-fio-changed') ? val('fio_birth') : '', birth_date: val('birth_date'),
                   birth_city: city, email: val('email'), phone: val('phone') },
      memory: { hospital: val('hospital'), family_address: val('family_address'), mother_fio: val('mother_fio'),
                registry_office: val('registry_office'), polyclinic: val('polyclinic'), home_docs: docs },
      tariff: radio('tariff'), mode: mode, proxy: null,
      consents: { offer: checked('c_offer'), personal_data: checked('c_pd'), special_data: checked('c_special') }
    };
    if (mode === 'proxy') {
      o.proxy = { passport: { series: val('passport_series'), number: val('passport_number'), issued_by: val('passport_issued_by'),
                              issued_date: val('passport_issued_date') ? ruDate(val('passport_issued_date')) : '' },
                  reg_address: val('reg_address'), city: city };
      o.consents.proxy = checked('c_proxy');
    }
    return o;
  }

  // ── направления: те же правила отбора, что registry/holders.py, без названий ──
  function plan(o) {
    var year = parseInt(o.applicant.birth_date.slice(0, 4), 10);
    var q = norm(o.applicant.birth_city || '');
    return state.directions.filter(function (h) {
      if (h.city !== '*' && norm(h.city) !== q) return false;
      if (h.birth_years.from !== null && year < h.birth_years.from) return false;
      if (h.birth_years.to !== null && year > h.birth_years.to) return false;
      return true;
    }).sort(function (a, b) { return a.order - b.order; });
  }

  function fill(text, v) { return text.replace(/\{\{(\w+)\}\}/g, function (_, k) { return v[k] || ''; }); }

  function poa(o) {
    var spec = state.poa.power_of_attorney, a = o.applicant, rep = state.poa.representative, p = (o.proxy && o.proxy.passport) || {};
    var v = { place: a.birth_city, date: ruDate(new Date().toISOString().slice(0, 10)), applicant_fio: a.fio, birth_date: a.birth_date ? ruDate(a.birth_date) : '',
              passport: (p.series + ' ' + p.number + ', выдан ' + p.issued_by + ' ' + p.issued_date).trim(), reg_address: (o.proxy || {}).reg_address || '',
              rep_name: rep.name, rep_inn: rep.inn, rep_ogrnip: rep.ogrnip };
    return { title: spec.title, body: spec.body.map(function (l) { return fill(l, v); }), warning: spec.warning };
  }

  function plural(n) { return n % 10 === 1 && n % 100 !== 11 ? 'направление' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'направления' : 'направлений'); }

  function errorsFor(step, o) {
    var e = [];
    if (step === 1) {
      if (o.applicant.fio.split(' ').length < 2) e.push(['fio', 'Укажи фамилию и имя полностью.']);
      if (checked('f-fio-changed') && !o.applicant.fio_birth) e.push(['fio_birth', 'Укажи ФИО при рождении.']);
      var d = o.applicant.birth_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < '1930-01-01' || d > new Date().toISOString().slice(0, 10)) e.push(['birth_date', 'Укажи дату рождения.']);
      if (!o.applicant.birth_city) e.push(['birth_city_other', 'Укажи город рождения.']);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.applicant.email)) e.push(['email', 'Проверь адрес почты.']);
      if (!/^\+?[0-9 ()\-]{10,20}$/.test(o.applicant.phone)) e.push(['phone', 'Проверь номер телефона.']);
    }
    if (step === 3 && o.mode === 'proxy') {
      var p = o.proxy;
      if (!/^\d{2}\s?\d{2}$/.test(p.passport.series)) e.push(['passport_series', 'Серия — 4 цифры.']);
      if (!/^\d{6}$/.test(p.passport.number)) e.push(['passport_number', 'Номер — 6 цифр.']);
      if (!p.passport.issued_by) e.push(['passport_issued_by', 'Укажи, кем выдан паспорт.']);
      if (!p.passport.issued_date) e.push(['passport_issued_date', 'Укажи дату выдачи.']);
      if (!p.reg_address) e.push(['reg_address', 'Укажи адрес регистрации.']);
    }
    if (step === 4) {
      if (!o.consents.offer || !o.consents.personal_data || !o.consents.special_data || (o.mode === 'proxy' && !o.consents.proxy))
        e.push([null, 'Без согласий мы не сможем отправить запросы. Отметь все пункты.']);
    }
    return e;
  }

  function showErrors(list) {
    form.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
    var box = $('ord-error');
    if (!list.length) { box.hidden = true; return true; }
    list.forEach(function (pair) { if (pair[0] && form.elements[pair[0]]) form.elements[pair[0]].setAttribute('aria-invalid', 'true'); });
    box.textContent = list.map(function (p) { return p[1]; }).join(' ');
    box.hidden = false;
    var first = list[0][0] && form.elements[list[0][0]];
    if (first && first.focus) first.focus();
    return false;
  }

  // ── отрисовка ──────────────────────────────────────────────
  function renderPlan() {
    var o = order(), box = $('ord-plan');
    box.textContent = '';
    if (!o.applicant.birth_date) return;
    var p = plan(o);
    var ok = p.filter(function (s) { return s.evidence_status === 'проверено'; }).length;
    box.appendChild(el('h3', '', 'Нашли ' + p.length + ' ' + plural(p.length) + ' поиска' + (ok ? ' · с проверенным путём — ' + ok : '')));
    var ul = el('ul', 'cr-holders cr-locked');
    p.forEach(function (s, i) {
      var li = el('li', 'cr-holder');
      var txt = el('span', 'cr-holder-text');
      txt.appendChild(el('b', '', s.self_only ? 'Запрос от мамы' : 'Учреждение ' + (i + 1)));
      var bar = el('span', 'cr-lock-bar'); bar.style.width = (52 + (i * 17) % 40) + '%'; bar.setAttribute('aria-hidden', 'true');
      txt.appendChild(bar);
      li.appendChild(txt);
      li.appendChild(el('span', 'cr-tag ' + (s.evidence_status === 'проверено' ? 'cr-tag-ok' : 'cr-tag-check'), s.evidence_status === 'проверено' ? 'путь проверен' : 'проверим запросом'));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el('p', 'cr-lock-note', 'Названия учреждений, адреса и готовые запросы — это твой маршрут. Он откроется в трекере после оплаты, в течение 48 часов. Чем больше ты вспомнишь выше, тем точнее он будет.'));
  }

  function docBlock(title, lines, note) {
    var d = el('details', 'ord-doc');
    d.appendChild(el('summary', '', title));
    var pre = el('div', 'ord-doc-body');
    lines.forEach(function (l) { pre.appendChild(el('p', '', l)); });
    if (note) pre.appendChild(el('p', 'ord-warn', note));
    d.appendChild(pre);
    return d;
  }

  function renderDocs() {
    var o = order(), box = $('ord-docs');
    box.textContent = '';
    if (o.mode === 'proxy') {
      var x = poa(o);
      box.appendChild(docBlock('Доверенность в электронной форме', x.body, x.warning));
    }
    box.appendChild(docBlock('Запросы в учреждения — после оплаты', [
      'Список учреждений и тексты запросов мы составим в течение 48 часов после оплаты: проверим, кто хранит записи твоего года рождения сейчас, и подставим всё, что ты вспомнил.',
      o.mode === 'proxy' ? 'Каждый запрос появится в трекере до отправки — ты увидишь, куда и что уходит от твоего имени.'
                         : 'Готовые запросы с адресами придут тебе на почту и появятся в трекере — останется отправить их.'
    ]));
  }

  function renderSummary() {
    var o = order(), box = $('ord-summary');
    box.textContent = '';
    var dl = el('dl', 'ord-sum');
    [['Тариф', TITLES[o.tariff] + ' — ' + PRICES[o.tariff].toLocaleString('ru-RU') + ' ₽'],
     ['Запросы отправляет', o.mode === 'proxy' ? 'BirthTime по электронной доверенности' : 'ты сам'],
     ['Направлений поиска', String(plan(o).length) + ' — учреждения откроются после оплаты'],
     ['Результат и статусы', 'на ' + o.applicant.email]].forEach(function (r) {
      var w = el('div'); w.appendChild(el('dt', '', r[0])); w.appendChild(el('dd', '', r[1])); dl.appendChild(w);
    });
    box.appendChild(dl);
  }

  function goto(step) {
    state.step = step;
    form.querySelectorAll('.ord-step').forEach(function (s) { s.hidden = Number(s.dataset.step) !== step; });
    $('ord-steps').querySelectorAll('li').forEach(function (li, i) {
      li.className = i + 1 < step ? 'is-done' : (i + 1 === step ? 'is-now' : '');
      if (i + 1 === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('ord-back').hidden = step === 1 || !!state.created;
    var next = $('ord-next');
    next.childNodes[0].nodeValue = step === 4 ? (LIVE ? 'Подписать и перейти к оплате' : 'Подписать и оплатить') : (step === 5 ? (LIVE ? 'Подтвердить код' : 'Показать мой трекер') : 'Дальше');
    next.hidden = step === 5 && !!state.done;
    if (step === 2) renderPlan();
    if (step === 4) renderDocs();
    if (step === 5) renderSummary();
    $('ord-error').hidden = true;
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
  }

  // ── отправка: боевой режим и демо ─────────────────────────
  function api(path, body) {
    return fetch(CFG.apiBase.replace(/\/$/, '') + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Ошибка сервера'); return j; }); });
  }

  function submitOrder() {
    var o = order();
    if (!LIVE) {
      state.created = { case: 'local', demo: true };
      $('ord-sign-email').textContent = o.applicant.email;
      $('ord-sign').hidden = o.mode !== 'proxy';
      if (o.mode === 'proxy') $('f-code').placeholder = 'В демо подойдёт любой код из 6 цифр';
      goto(5);
      return;
    }
    $('ord-next').disabled = true;
    api('/orders', o).then(function (res) {
      state.created = res;
      if (res.sign_required) { $('ord-sign-email').textContent = o.applicant.email; $('ord-sign').hidden = false; goto(5); }
      else { goto(5); pay(); }
    }).catch(function (err) { showErrors([[null, err.message]]); })
      .then(function () { $('ord-next').disabled = false; });
  }

  function pay() {
    var c = state.created;
    var back = (CFG.siteUrl || location.origin) + '/status.html?case=' + c.case + '&t=' + encodeURIComponent(c.token);
    api('/orders/' + c.case + '/pay', { token: c.token, return_url: back })
      .then(function (res) { if (res.confirmation_url) location.href = res.confirmation_url; else location.href = back; })
      .catch(function (err) { showErrors([[null, err.message]]); });
  }

  function confirmStep() {
    var o = order();
    if (!LIVE) {
      if (o.mode === 'proxy' && !/^\d{6}$/.test($('f-code').value.trim())) { showErrors([['f-code', 'Введи 6 цифр кода.']]); return; }
      try { sessionStorage.setItem('birthtime-local-case', JSON.stringify(localCase(o))); } catch (e) { /* без хранилища — просто покажем пример */ }
      state.done = true;
      var fin = $('ord-final');
      fin.textContent = '';
      fin.appendChild(el('p', '', 'Готово. В боевом режиме сейчас открылась бы оплата ЮKassa, а после неё — твой трекер. В демо мы собрали трекер по твоему плану, данные остались только в этом браузере.'));
      var a = el('a', 'button button-lg', 'Открыть мой трекер'); a.href = 'status.html?case=local'; fin.appendChild(a);
      fin.hidden = false; $('ord-sign').hidden = true; $('ord-next').hidden = true;
      return;
    }
    var c = state.created;
    if (!c) return;
    if (c.sign_required && !c.signed) {
      api('/orders/' + c.case + '/sign', { token: c.token, code: $('f-code').value.trim() })
        .then(function () { c.signed = true; pay(); })
        .catch(function (err) { showErrors([['f-code', err.message]]); });
    } else { pay(); }
  }

  function localCase(o) {
    var today = new Date().toISOString().slice(0, 10);
    var p = plan(o);
    return {
      case: 'DEMO', example: true, label: o.applicant.birth_city + ' · рождение в ' + o.applicant.birth_date.slice(0, 4) + ' году',
      plan: TITLES[o.tariff], as_of: today, stage: 'route', next_update: '',
      requests: p.map(function (s, i) {
        return { holder: s.self_only ? 'Запрос от мамы' : 'Учреждение ' + (i + 1) + ' — уточняем в маршруте', document: 'Название, адрес и текст запроса появятся, когда маршрут будет готов',
                 channel: '—', status: 'routing', deadline_days: s.expected_reply_days };
      }),
      events: [{ date: today, text: 'Заявка оформлена (демо). Маршрут готовится — до 48 часов после оплаты.' }]
    };
  }

  // ── события ────────────────────────────────────────────────
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (state.step === 5) { confirmStep(); return; }
    var o = order();
    if (!showErrors(errorsFor(state.step, o))) return;
    if (state.step === 4) { submitOrder(); return; }
    goto(state.step + 1);
  });
  $('ord-back').addEventListener('click', function () { if (state.step > 1) goto(state.step - 1); });
  $('f-fio-changed').addEventListener('change', function () { $('w-fio-birth').hidden = !this.checked; });
  $('f-city').addEventListener('change', function () { $('w-city-other').hidden = this.value !== 'other'; });
  form.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'mode') {
      $('w-proxy').hidden = t.value !== 'proxy';
      $('w-c-proxy').hidden = t.value !== 'proxy';
    }
    if (t.name === 'mode' || t.name === 'tariff') {
      form.querySelectorAll('input[name="' + t.name + '"]').forEach(function (r) { r.closest('.ord-card').classList.toggle('is-picked', r.checked); });
    }
    if (t.name === 'home_docs') $('ord-hint-home').hidden = !form.querySelector('input[name="home_docs"]:checked');
    if (state.step === 2) renderPlan();
  });
  $('ord-resend').addEventListener('click', function () {
    if (!LIVE || !state.created) { this.textContent = 'В демо код не отправляется'; return; }
    api('/orders/' + state.created.case + '/code', { token: state.created.token }).then(function () { $('ord-resend').textContent = 'Код отправлен ещё раз'; });
  });

  // ── старт ──────────────────────────────────────────────────
  $('ord-demo').hidden = LIVE;
  var params = new URLSearchParams(location.search);
  if (PRICES[params.get('tariff')]) {
    var r = form.querySelector('input[name="tariff"][value="' + params.get('tariff') + '"]');
    if (r) { r.checked = true; form.querySelectorAll('input[name="tariff"]').forEach(function (x) { x.closest('.ord-card').classList.toggle('is-picked', x.checked); }); }
  }
  $('f-date').max = new Date().toISOString().slice(0, 10);
  Promise.all([fetch('data/directions.json').then(function (r) { return r.json(); }), fetch('data/poa.json').then(function (r) { return r.json(); })])
    .then(function (res) { state.directions = res[0]; state.poa = res[1]; })
    .catch(function () { showErrors([[null, 'Не удалось загрузить справочники. Обнови страницу.']]); });
})();
