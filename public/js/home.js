var navItems = document.querySelectorAll('[data-tab]:not([data-tab="create"])');
var pages = document.querySelectorAll('.page');

/* ---- barras de pestañas: chat y perfil, cada una independiente ---- */
var moves = [];

document.querySelectorAll('.tabs').forEach(function (bar) {
  var scope = bar.parentElement;
  var tabs = bar.querySelectorAll('.tab');
  var indicator = bar.querySelector('.tab-indicator');

  function move(animate) {
    var active = bar.querySelector('.tab.active');
    if (!indicator || !active || !active.offsetWidth) { return; }

    var text = active.querySelector('.tab-text');
    if (!animate) { indicator.style.transition = 'none'; }
    indicator.style.width = text.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + text.offsetLeft + 'px)';
    if (!animate) {
      void indicator.offsetHeight;
      indicator.style.transition = '';
    }
  }
  moves.push(move);

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tabpanel;

      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      move(true);

      scope.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.dataset.panel === target);
      });

      var first = scope.querySelector('.tab-panel[data-panel="' + target + '"] .row');
      if (first) { selectRow(first); }
    });
  });
});

function moveIndicators() { moves.forEach(function (m) { m(false); }); }

navItems.forEach(function (item) {
  item.addEventListener('click', function () {
    var target = item.dataset.tab;

    navItems.forEach(function (i) { i.classList.toggle('active', i.dataset.tab === target); });

    pages.forEach(function (p) {
      p.classList.toggle('active', p.dataset.page === target);
    });

    document.body.classList.remove('thread-open', 'info-open');

    moveIndicators();
    window.scrollTo(0, 0);
  });
});

window.addEventListener('resize', function () { moveIndicators(); });

/* ---- selección de fila: alimenta la conversación y el panel de info ---- */
var AV = ['av-blue', 'av-orange', 'av-pink', 'av-green', 'av-purple', 'av-teal'];
var TYPE_BY_PANEL = { chat: 'person', mensajes: 'person', grupos: 'group', comunidad: 'community' };

function selectRow(row) {
  var panel = row.closest('.tab-panel');
  var type = TYPE_BY_PANEL[panel.dataset.panel];
  var avatar = row.querySelector('.row-avatar');
  var color = AV.filter(function (c) { return avatar.classList.contains(c); })[0] || 'av-blue';
  var name = row.querySelector('.row-title').textContent;

  panel.querySelectorAll('.row').forEach(function (r) { r.classList.remove('selected'); });
  row.classList.add('selected');

  document.querySelectorAll('.js-peer-avatar').forEach(function (el) {
    AV.forEach(function (c) { el.classList.remove(c); });
    el.classList.add(color);
    el.textContent = avatar.textContent;
  });
  document.querySelectorAll('.js-peer-name').forEach(function (el) { el.textContent = name; });
  document.querySelectorAll('.js-peer-sub').forEach(function (el) { el.textContent = row.dataset.sub || ''; });

  document.querySelectorAll('.th-body, .info-block').forEach(function (el) {
    el.classList.toggle('on', el.dataset.for === type);
  });

  document.querySelector('.chat-thread').classList.add('has-peer');
  document.querySelector('.chat-info').classList.add('has-peer');
}

document.querySelectorAll('.tab-panel .row').forEach(function (row) {
  row.addEventListener('click', function () {
    selectRow(row);
    document.body.classList.add('thread-open');
  });
});

var thBack = document.querySelector('.th-back');
if (thBack) {
  thBack.addEventListener('click', function () {
    document.body.classList.remove('thread-open', 'info-open');
  });
}

var thPeer = document.querySelector('.th-peer');
if (thPeer) {
  thPeer.addEventListener('click', function () {
    document.body.classList.add('info-open');
  });
}

var infoBack = document.querySelector('.info-back');
if (infoBack) {
  infoBack.addEventListener('click', function () {
    document.body.classList.remove('info-open');
  });
}

document.querySelectorAll('[data-off][data-on]').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var done = btn.classList.toggle('done');
    btn.textContent = done ? btn.dataset.on : btn.dataset.off;
  });
});

document.querySelectorAll('.empty-link[data-goto]').forEach(function (link) {
  link.addEventListener('click', function () {
    var nav = document.querySelector('.bn-item[data-tab="' + link.dataset.goto + '"]');
    if (nav) { nav.click(); }
  });
});

document.querySelectorAll('.post-like').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var n = btn.querySelector('.post-n');
    var on = btn.classList.toggle('liked');
    n.textContent = parseInt(n.textContent, 10) + (on ? 1 : -1);
  });
});

var firstRow = document.querySelector('.tab-panel[data-panel="chat"] .row');
if (firstRow) { selectRow(firstRow); }
