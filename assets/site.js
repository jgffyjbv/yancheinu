// Yancheinu — shared behavior
(function () {
  var header = document.querySelector('.site-header');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = document.querySelector('.nav__toggle');
  var links = document.querySelector('.nav__links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // hero road: send the pasuk driving, and let the scene drift with the pointer
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!calm) {
    ['pasukRun', 'pasukFade', 'pasukSize'].forEach(function (id) {
      var a = document.getElementById(id);
      if (a && a.beginElement) { try { a.beginElement(); } catch (e) {} }
    });
  }

  var hero = document.querySelector('.hero');
  var scene = document.querySelector('.hero__scene');
  if (hero && scene && !calm &&
      window.matchMedia('(min-width: 921px)').matches &&
      window.matchMedia('(pointer: fine)').matches) {
    var dx = 0, dy = 0, queued = 0;
    var apply = function () {
      queued = 0;
      scene.style.setProperty('--drift-x', dx.toFixed(1) + 'px');
      scene.style.setProperty('--drift-y', dy.toFixed(1) + 'px');
    };
    var queue = function () { if (!queued) queued = requestAnimationFrame(apply); };
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      dx = ((e.clientX - r.left) / r.width - 0.5) * -30;
      dy = ((e.clientY - r.top) / r.height - 0.5) * -18;
      queue();
    });
    hero.addEventListener('pointerleave', function () { dx = 0; dy = 0; queue(); });
  }

  // ---------- receptionist chat ----------
  (function () {
    var GREETING = 'Hello. I can answer questions about Yancheinu — the coaching, ' +
      'the courses, and how to book. What would you like to know?';
    var CHIPS = ['How do sessions work?', 'What is the free intake?', 'Tell me about the courses'];
    var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    var fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = ICON + '<span>Ask a question</span>';

    var panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ask Yancheinu');
    panel.innerHTML =
      '<div class="chat-head">' +
        '<img src="assets/img/pin-cream.png" alt="">' +
        '<span class="chat-head__t"><b>Ask Yancheinu</b><span>Questions about the practice</span></span>' +
        '<button class="chat-x" type="button" aria-label="Close">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="chat-log" role="log" aria-live="polite"></div>' +
      '<div class="chat-chips"></div>' +
      '<p class="chat-note">Answers about the practice — not coaching advice. ' +
        'For anything personal, <a href="book.html">book a free intake</a>.</p>' +
      '<form class="chat-form">' +
        '<input type="text" autocomplete="off" placeholder="Type your question…" aria-label="Your question" maxlength="600">' +
        '<button class="chat-send" type="submit" aria-label="Send">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</button>' +
      '</form>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var log   = panel.querySelector('.chat-log');
    var chips = panel.querySelector('.chat-chips');
    var form  = panel.querySelector('.chat-form');
    var input = panel.querySelector('input');
    var send  = panel.querySelector('.chat-send');
    var history = [];
    var busy = false;
    var started = false;

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // The model is told to name pages, not URLs — turn those names into real links.
    function linkify(text) {
      return esc(text)
        .replace(/Book a Session page|Book a Session|booking page/gi, '<a href="book.html">$&</a>')
        .replace(/Free Guides page|free guide(?! for)/gi, '<a href="calm-before-a-meeting.html">$&</a>')
        .replace(/Contact page/gi, '<a href="contact.html">$&</a>')
        .replace(/Kallah Coaching page/gi, '<a href="kallahs.html">$&</a>')
        .replace(/(347-766-2269|718-926-4773)/g, '<a href="tel:+1$1">$1</a>')
        .replace(/(yancheinucoaching@gmail\.com)/g, '<a href="mailto:$1">$1</a>');
    }

    function bubble(who, html) {
      var el = document.createElement('div');
      el.className = 'chat-msg chat-msg--' + who;
      el.innerHTML = html;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    function drawChips() {
      chips.innerHTML = '';
      CHIPS.forEach(function (t) {
        var b = document.createElement('button');
        b.className = 'chat-chip';
        b.type = 'button';
        b.textContent = t;
        b.addEventListener('click', function () { ask(t); });
        chips.appendChild(b);
      });
    }

    function ask(text) {
      if (busy || !text) return;
      busy = true;
      send.disabled = true;
      chips.innerHTML = '';
      bubble('me', esc(text));
      history.push({ role: 'user', content: text });
      input.value = '';

      var wait = bubble('bot', '<span class="chat-dots"><i></i><i></i><i></i></span>');

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var reply = (d && d.reply) || '';
          wait.innerHTML = linkify(reply);
          history.push({ role: 'assistant', content: reply });
        })
        .catch(function () {
          wait.innerHTML = 'Sorry — something went wrong. Please call or text ' +
            '<a href="tel:+13477662269">347-766-2269</a>.';
        })
        .then(function () {
          busy = false;
          send.disabled = false;
          log.scrollTop = log.scrollHeight;
          input.focus();
        });
    }

    function open() {
      panel.hidden = false;
      fab.hidden = true;
      fab.setAttribute('aria-expanded', 'true');
      if (!started) { started = true; bubble('bot', esc(GREETING)); drawChips(); }
      input.focus();
    }
    function close() {
      panel.hidden = true;
      fab.hidden = false;
      fab.setAttribute('aria-expanded', 'false');
      fab.focus();
    }

    fab.addEventListener('click', open);
    panel.querySelector('.chat-x').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input.value.trim());
    });
  })();

  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(function (el) { io.observe(el); });
})();
