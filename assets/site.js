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
