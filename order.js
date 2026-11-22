/* Оформление поиска BirthTime.
   Документы формируются из тех же шаблонов, что использует сервер
   (data/templates.json, data/holders.json), поэтому превью совпадает с отправкой.
   В демо-режиме данные не покидают браузер. */
(function () {
  'use strict';

  var CFG = window.BIRTHTIME_CONFIG || { mode: 'demo', apiBase: '' };
  var LIVE = CFG.mode === 'live' && !!CFG.apiBase;
  var PRICES = { route: 4900, support: 7900, full: 11900 };
  var TITLES = { route: 'Маршрут за 48 часов', support: 'Сопровождение до ответа', full: 'Под ключ' };
  var PRIORITY = { child_card: 0, zags_basis: 1, facility_record: 2, facility_successor: 3, enterprise_medical_unit: 4, mother_record: 5 };

  var state = { step: 1, holders: [], templates: null, created: null };
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

  // ── план: те же правила, что registry/holders.py ─────────
  function plan(o) {
    var year = parseInt(o.applicant.birth_date.slice(0, 4), 10);
    var q = norm(o.applicant.birth_city || '');
    return state.holders.filter(function (h) {
      if (h.city !== '*' && norm(h.city) !== q) return false;
      if (h.birth_years.from !== null && year < h.birth_years.from) return false;
      if (h.birth_years.to !== null && year > h.birth_years.to) return false;
      return true;
    }).sort(function (a, b) { return (PRIORITY[a.holder_type] - PRIORITY[b.holder_type]) || (a.id < b.id ? -1 : 1); })
      .map(function (h) {
        return { holder_id: h.id, holder: h.name, holder_type: h.holder_type, document: h.document, email: h.email || null,
                 evidence_status: h.evidence_status, expected_days: h.expected_reply_days, only_self: h.holder_type === 'mother_record' };
      });
  }

  // ── документы: те же формулировки, что server/documents.py ──
  function fill(text, v) { return text.replace(/\{\{(\w+)\}\}/g, function (_, k) { return v[k] || ''; }); }
  function phrases(o) {
    var m = o.memory, poly;
    if (m.polyclinic) poly = ', в детской поликлинике ' + m.polyclinic + '.';
    else if (m.family_address) poly = ' Номер детской поликлиники неизвестен; в первые годы семья жила по адресу: ' + m.family_address + '. Прошу провести поиск по фамилии, имени, отчеству и дате рождения.';
    else poly = ' Номер детской поликлиники неизвестен; прошу провести поиск по фамилии, имени, отчеству и дате рождения.';
    return {
      hospital_phrase: m.hospital ? ' в учреждении: ' + m.hospital : ', наименование родильного дома неизвестно',
      polyclinic_phrase: poly,
      mother_phrase: m.mother_fio ? ' Мать: ' + m.mother_fio + '.' : '',
      registry_phrase: m.registry_office ? ' (' + m.registry_office + ')' : ''
    };
  }
  function letter(o, step) {
    var T = state.templates, spec = T.letters[step.holder_type], a = o.applicant, rep = T.representative;
    var proxy = o.mode === 'proxy' && !step.only_self;
    var v = { applicant_fio: a.fio, birth_date: ruDate(a.birth_date), birth_city: a.birth_city,
              subject: proxy ? 'доверителя — ' + a.fio : 'меня, ' + a.fio,
              subject_gen: proxy ? 'доверителя — ' + a.fio : 'моё',
              subject_cap: proxy ? 'Доверитель, ' + a.fio + ',' : 'Я' };
    var ph = phrases(o); for (var k in ph) v[k] = ph[k];
    var today = new Date().toISOString().slice(0, 10);
    return {
      to: step.holder, title: spec.title, only_self: step.only_self, email: step.email,
      sender: proxy ? 'от ' + a.fio + ', ' + v.birth_date + ' г. р., в лице представителя — ' + rep.name + ' (ИНН ' + rep.inn + '), действующего по доверенности в электронной форме от ' + ruDate(today)
                    : (step.only_self ? 'от матери — [ФИО мамы]' : 'от ' + a.fio + ', ' + v.birth_date + ' г. р.'),
      body: spec.body.map(function (line) { return fill(line, v); }),
      basis: 'Основание: ' + T.legal_basis,
      reply: proxy ? 'Ответ прошу направить представителю: ' + rep.reply_email + '.' : 'Ответ прошу направить: ' + (step.only_self ? '[адрес мамы]' : a.email) + '.'
    };
  }
  function poa(o) {
    var T = state.templates, spec = T.power_of_attorney, a = o.applicant, p = o.proxy, rep = T.representative;
    var v = { place: a.birth_city, date: ruDate(new Date().toISOString().slice(0, 10)), applicant_fio: a.fio, birth_date: ruDate(a.birth_date),
              passport: p.passport.series + ' ' + p.passport.number + ', выдан ' + p.passport.issued_by + ' ' + p.passport.issued_date,
              reg_address: p.reg_address, rep_name: rep.name, rep_inn: rep.inn, rep_ogrnip: rep.ogrnip };
    return { title: spec.title, body: spec.body.map(function (l) { return fill(l, v); }), warning: spec.warning };
  }

  // ── проверка шагов ─────────────────────────────────────────
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
    box.appendChild(el('h3', '', 'План поиска: ' + p.length + ' ' + (p.length === 1 ? 'адресат' : (p.length < 5 ? 'адресата' : 'адресатов'))));
    var ul = el('ul', 'ord-plan-list');
    p.forEach(function (s) {
      var li = el('li');
      li.appendChild(el('b', '', s.holder));
      li.appendChild(el('span', '', s.only_self ? 'Отправляет мама — подготовим письмо для неё' : s.document));
      li.appendChild(el('em', 'cr-tag ' + (s.evidence_status === 'проверено' ? 'cr-tag-ok' : 'cr-tag-check'), s.evidence_status === 'проверено' ? 'путь проверен' : 'проверим запросом'));
      ul.appendChild(li);
    });
    box.appendChild(ul);
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
    plan(o).forEach(function (s) {
      var L = letter(o, s);
      var who = L.only_self ? ' — отправляет мама' : (o.mode === 'self' ? ' — отправляешь ты' : (L.email ? ' — отправим на ' + L.email : ' — отправим почтой'));
      box.appendChild(docBlock(L.to + who, [L.sender, L.title].concat(L.body, [L.basis, L.reply])));
    });
    box.appendChild(el('p', 'note', 'Пометки в квадратных скобках заполняются после проверки юриста — с ними письма не уходят.'));
  }

  function renderSummary() {
    var o = order(), box = $('ord-summary');
    box.textContent = '';
    var dl = el('dl', 'ord-sum');
    [['Тариф', TITLES[o.tariff] + ' — ' + PRICES[o.tariff].toLocaleString('ru-RU') + ' ₽'],
     ['Запросы отправляет', o.mode === 'proxy' ? 'BirthTime по электронной доверенности' : 'ты сам'],
     ['Адресатов', String(plan(o).length)],
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
      requests: p.map(function (s) {
        return { holder: s.holder, document: s.document, channel: s.email ? 'Электронная почта' : 'Почта или канал учреждения',
                 status: (s.only_self || o.mode === 'self') ? 'self_send' : 'prepared', deadline_days: s.expected_days };
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
  Promise.all([fetch('data/holders.json').then(function (r) { return r.json(); }), fetch('data/templates.json').then(function (r) { return r.json(); })])
    .then(function (res) { state.holders = res[0]; state.templates = res[1]; })
    .catch(function () { showErrors([[null, 'Не удалось загрузить справочники. Обнови страницу.']]); });
})();
