/* In-place editing for the signed-in owner. Loaded only when the Worker has recognised her session. */
(function () {
  'use strict';
  var bar = document.getElementById('yn-bar');
  if (!bar) { return; }
  var path = bar.getAttribute('data-path');
  var statusEl = bar.querySelector('.yn-bar__status');
  var editBtn = bar.querySelector('[data-yn="edit"]');
  var seoBtn = bar.querySelector('[data-yn="seo"]');
  var originals = new Map();
  var editing = false;
  var saveBtn, cancelBtn;
  document.body.classList.add('yn-has-bar');

  function say(text, bad) { statusEl.textContent = text || ''; statusEl.className = 'yn-bar__status' + (bad ? ' err' : ''); }
  // signed out while editing: keep her text on screen and send her to sign in in ANOTHER tab
  function saySignedOut() {
    statusEl.textContent = 'You were signed out. Your changes are still here: ';
    var a = document.createElement('a');
    a.href = '/admin'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'sign in in a new tab'; a.style.color = '#fff';
    statusEl.appendChild(a);
    statusEl.appendChild(document.createTextNode(', then come back here and press Save again.'));
    statusEl.className = 'yn-bar__status err';
  }
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); });
  }

  // Keep only what the site stores: text, line breaks, bold/italic, links and the small styled spans that were already there.
  var KEEP = { A: 1, STRONG: 1, B: 1, EM: 1, I: 1, BR: 1, SPAN: 1, SMALL: 1, SUP: 1, SUB: 1, U: 1, MARK: 1, CITE: 1, BDI: 1 };
  function escText(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, ' '); }
  function serialize(node) {
    var out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += escText(n.nodeValue); return; }
      if (n.nodeType !== 1) { return; }
      var tag = n.tagName;
      if (!KEEP[tag]) { out += serialize(n) + (/^(DIV|P|LI|H\d)$/.test(tag) ? ' ' : ''); return; }
      if (tag === 'BR') { out += '<br>'; return; }
      var attrs = '';
      var href = tag === 'A' ? (n.getAttribute('href') || '') : '';
      if (href && !/[<>"'`\s\\]/.test(href)) { attrs += ' href="' + href + '"'; }
      if (tag === 'A' && n.getAttribute('target') === '_blank') { attrs += ' target="_blank"'; }
      var cls = (n.getAttribute('class') || '').trim();
      if (cls && /^[a-zA-Z0-9 _-]+$/.test(cls)) { attrs += ' class="' + cls + '"'; }
      var dir = n.getAttribute('dir');
      if (dir) { attrs += ' dir="' + dir.replace(/[^a-z]/gi, '') + '"'; }
      var lang = n.getAttribute('lang');
      if (lang) { attrs += ' lang="' + lang.replace(/[^a-z-]/gi, '') + '"'; }
      out += '<' + tag.toLowerCase() + attrs + '>' + serialize(n) + '</' + tag.toLowerCase() + '>';
    });
    return out;
  }
  function value(el) { return serialize(el).replace(/\s+/g, ' ').replace(/(<br>\s*)+$/, '').trim(); }

  // A change saved a moment ago may not have reached this copy of the page yet: show it anyway for two minutes.
  // Menu and footer wording ("h…" and "f…") is shared by every page, so it is remembered for every page.
  var PENDING = 'yn-pending';
  function pending() { try { return JSON.parse(localStorage.getItem(PENDING) || '{}'); } catch (e) { return {}; } }
  function store(all) { try { localStorage.setItem(PENDING, JSON.stringify(all)); } catch (e) { /* private window */ } }
  function remember(changes) {
    var all = pending();
    Object.keys(changes).forEach(function (k) {
      var bucket = k.charAt(0) === 'm' ? path : '*';
      var mine = all[bucket] && Date.now() - all[bucket].at < 120000 ? all[bucket].changes : {};
      mine[k] = changes[k];
      all[bucket] = { at: Date.now(), changes: mine };
    });
    store(all);
  }
  (function applyPending() {
    var all = pending();
    var dirty = false;
    [path, '*'].forEach(function (bucket) {
      var mine = all[bucket];
      if (!mine) { return; }
      if (Date.now() - mine.at > 120000) { delete all[bucket]; dirty = true; return; }
      Object.keys(mine.changes).forEach(function (k) {
        var el = document.querySelector('[data-e="' + k + '"]');
        if (el && typeof mine.changes[k] === 'string' && mine.changes[k]) { el.innerHTML = mine.changes[k]; }
      });
    });
    if (dirty) { store(all); }
  })();

  function block(ev) { if (editing && !ev.target.closest('#yn-bar, #yn-seo')) { ev.preventDefault(); } }
  function onKey(ev) {
    if (ev.key !== 'Enter') { return; }
    ev.preventDefault();
    if (/^(P|LI|BLOCKQUOTE|TD)$/.test(ev.currentTarget.tagName)) { document.execCommand('insertLineBreak'); }
  }
  function onPaste(ev) {
    ev.preventDefault();
    var text = (ev.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, text.replace(/\s*\n+\s*/g, ' '));
  }
  function count() {
    var n = document.querySelectorAll('[data-e].yn-changed').length;
    say(n ? n + (n === 1 ? ' change' : ' changes') + ' not saved yet' : 'Click any outlined text to change its wording');
  }
  function onInput(ev) {
    var el = ev.currentTarget;
    el.classList.toggle('yn-changed', value(el) !== originals.get(el));
    count();
  }
  // Wording inside a real button cannot be typed into reliably, so it is asked for in a small box instead.
  function inButton(el) { return el.tagName === 'BUTTON' || !!el.closest('button'); }
  function onButtonText(ev) {
    if (!editing) { return; }
    ev.preventDefault();
    ev.stopPropagation();
    var el = ev.currentTarget;
    var now = window.prompt('Wording for this button:', el.textContent.replace(/\s+/g, ' ').trim());
    if (now === null) { return; }
    now = now.replace(/\s+/g, ' ').trim();
    if (!now) { return; }
    el.textContent = now;
    el.classList.toggle('yn-changed', value(el) !== originals.get(el));
    count();
  }
  function items() { return Array.prototype.slice.call(document.querySelectorAll('[data-e]')); }

  function start() {
    if (editing) { return; }
    editing = true;
    document.body.classList.add('yn-editing');
    items().forEach(function (el) {
      originals.set(el, value(el));
      if (inButton(el)) { el.addEventListener('click', onButtonText, true); return; }
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el.addEventListener('keydown', onKey);
      el.addEventListener('paste', onPaste);
      el.addEventListener('input', onInput);
    });
    editBtn.hidden = true;
    if (seoBtn) { seoBtn.hidden = true; }
    saveBtn.hidden = false;
    cancelBtn.hidden = false;
    say('Click any outlined text to change its wording');
  }
  function stop(restore) {
    editing = false;
    document.body.classList.remove('yn-editing');
    items().forEach(function (el) {
      if (restore && originals.has(el) && el.classList.contains('yn-changed')) { el.innerHTML = originals.get(el); }
      el.removeAttribute('contenteditable');
      el.classList.remove('yn-changed');
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('input', onInput);
      el.removeEventListener('click', onButtonText, true);
    });
    editBtn.hidden = false;
    if (seoBtn) { seoBtn.hidden = false; }
    saveBtn.hidden = true;
    cancelBtn.hidden = true;
  }
  function save() {
    var changes = {};
    var n = 0;
    var emptied = 0;
    items().forEach(function (el) {
      var now = value(el);
      if (now === originals.get(el)) { return; }
      // text that was deleted completely goes back to the original wording (an empty heading or bullet would stay on the page)
      if (!el.textContent.replace(/\s+/g, '')) { changes[el.getAttribute('data-e')] = null; emptied++; } else { changes[el.getAttribute('data-e')] = now; }
      n++;
    });
    if (!n) { stop(false); say('Nothing was changed'); return; }
    saveBtn.disabled = true;
    say('Saving…');
    post('/admin/api/page', { path: path, changes: changes }).then(function (r) {
      saveBtn.disabled = false;
      if (!r.ok) { if (r.status === 401) { saySignedOut(); } else { say(r.message || 'That did not save. Please try again.', true); } return; }
      remember(changes);
      stop(false);
      if (emptied) {
        say('Saved. Text you emptied goes back to the original wording – to remove something completely, send a request.');
        setTimeout(function () { location.href = location.pathname; }, 2600);
      } else { say('Saved. Visitors will see it within about a minute.'); }
    }).catch(function () { saveBtn.disabled = false; say('No connection. Your changes are still here – press Save again.', true); });
  }

  if (editBtn) {
    saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'yn-btn yn-btn--main'; saveBtn.textContent = 'Save changes'; saveBtn.hidden = true;
    cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'yn-btn'; cancelBtn.textContent = 'Cancel'; cancelBtn.hidden = true;
    bar.insertBefore(cancelBtn, editBtn.nextSibling);
    bar.insertBefore(saveBtn, cancelBtn);
    editBtn.addEventListener('click', start);
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', function () {
      var n = document.querySelectorAll('[data-e].yn-changed').length;
      if (n && !window.confirm('Discard ' + n + (n === 1 ? ' unsaved change?' : ' unsaved changes?'))) { return; }
      stop(true);
      say(n ? 'Changes discarded' : '');
    });
    // while editing, a click must place the cursor — not follow a link, send a form or jump to a field
    document.addEventListener('click', function (ev) { if (ev.target.closest('a, label, summary, button[type="submit"], input[type="submit"]')) { block(ev); } }, true);
    document.addEventListener('submit', block, true);
    window.addEventListener('beforeunload', function (ev) { if (editing && document.querySelector('[data-e].yn-changed')) { ev.preventDefault(); ev.returnValue = ''; } });
    if (/[?&]edit=1/.test(location.search)) { start(); }
  }

  // Page title and Google description
  if (seoBtn) {
    seoBtn.addEventListener('click', function () {
      var old = document.getElementById('yn-seo');
      if (old) { old.remove(); }
      var d = document.createElement('dialog');
      d.id = 'yn-seo';
      var meta = document.querySelector('meta[name="description"]');
      d.innerHTML = '<form><h2>Page title &amp; Google description</h2><p>This is what Google shows for this page: the blue title and the two lines under it. The title also appears in the browser tab.</p>' +
        '<label for="yn-t">Title</label><input id="yn-t" maxlength="120"><div class="yn-count" id="yn-tc"></div>' +
        '<label for="yn-d">Description</label><textarea id="yn-d" maxlength="320"></textarea><div class="yn-count" id="yn-dc"></div>' +
        '<div class="yn-row"><button type="button" id="yn-x">Cancel</button><button type="submit" class="go" id="yn-go">Save</button></div></form>';
      document.body.appendChild(d);
      var t = d.querySelector('#yn-t'), ds = d.querySelector('#yn-d');
      t.value = document.title;
      ds.value = meta ? meta.getAttribute('content') : '';
      function tally() {
        d.querySelector('#yn-tc').textContent = t.value.length + ' characters – Google usually shows about 60';
        d.querySelector('#yn-dc').textContent = ds.value.length + ' characters – Google usually shows about 160';
      }
      t.addEventListener('input', tally); ds.addEventListener('input', tally); tally();
      d.querySelector('#yn-x').addEventListener('click', function () { d.close(); });
      d.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        post('/admin/api/seo', { path: path, title: t.value, description: ds.value }).then(function (r) {
          if (!r.ok) { d.close(); if (r.status === 401) { saySignedOut(); } else { say(r.message || 'That did not save. Please try again.', true); } return; }
          document.title = t.value;
          if (meta) { meta.setAttribute('content', ds.value); }
          d.close();
          say('Saved. Google picks up the new title the next time it visits.');
        }).catch(function () { d.close(); say('No connection. Please try again.', true); });
      });
      if (d.showModal) { d.showModal(); } else { d.setAttribute('open', ''); }
    });
  }
})();
