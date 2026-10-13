/* Scripts for the /admin screens (pages list and the blog editor). */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-page');
  var dataEl = document.getElementById('data');
  var data = dataEl ? JSON.parse(dataEl.textContent) : null;
  var statusEl = document.getElementById('status');
  function say(text, bad) { if (statusEl) { statusEl.textContent = text || ''; statusEl.className = 'status ' + (bad ? 'err' : 'ok'); } }
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); });
  }
  // Signed out: do NOT tell her to reload (that would throw away what she typed). Sign in in another tab instead.
  function fail(r) {
    if (r && r.status === 401 && statusEl) {
      statusEl.textContent = 'You were signed out. Your text is still here: ';
      var a = document.createElement('a');
      a.href = '/admin'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'sign in in a new tab';
      statusEl.appendChild(a);
      statusEl.appendChild(document.createTextNode(', then come back to this tab and press the button again.'));
      statusEl.className = 'status err';
      return;
    }
    say((r && r.message) || 'That did not work. Please try again.', true);
  }

  if (page === 'pages') {
    document.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var path = b.getAttribute('data-reset');
        var shared = path === '*shared*';
        if (!window.confirm(shared
          ? 'Put the menu and the footer back exactly as they were built? Your wording changes to them will be removed. This cannot be undone.'
          : 'Put this page back exactly as it was built? All your text changes on this page, and the title and Google description you set for it, will be removed. This cannot be undone.')) { return; }
        post('/admin/api/page-reset', { path: path }).then(function (r) {
          if (!r.ok) { fail(r); return; }
          // forget the copy this browser keeps of a just-saved change, or the page would still show it for two minutes
          try { var all = JSON.parse(localStorage.getItem('yn-pending') || '{}'); delete all[shared ? '*' : path]; localStorage.setItem('yn-pending', JSON.stringify(all)); } catch (e) { /* ignore */ }
          location.reload();
        }).catch(function () { say('No connection. Please try again.', true); });
      });
    });
  }

  if (page === 'post') {
    var body = document.getElementById('f-body');
    var dirty = false;
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }
    // an empty article starts inside a paragraph, so the very first line is a paragraph too
    if (!body.textContent.trim() && !body.querySelector('p,h2,h3,ul,ol,blockquote')) { body.innerHTML = '<p><br></p>'; }
    document.getElementById('rte-bar').addEventListener('mousedown', function (ev) { if (ev.target.closest('button')) { ev.preventDefault(); } });
    document.getElementById('rte-bar').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) { return; }
      body.focus();
      var cmd = b.getAttribute('data-cmd');
      if (cmd === 'link') {
        var url = window.prompt('Paste the web address (for a page on this site, start with / — for example /book)', 'https://');
        if (url && /^(\/|#|https?:\/\/|mailto:|tel:)/i.test(url.trim())) { document.execCommand('createLink', false, url.trim()); }
        else if (url) { window.alert('A link has to start with https:// or with / for a page on this site.'); }
      } else { document.execCommand(cmd, false, b.getAttribute('data-arg') || null); }
      dirty = true;
    });
    body.addEventListener('paste', function (ev) {
      // keep the structure from Word or Google Docs (headings, lists, bold, links) but none of their styling
      var html = (ev.clipboardData || window.clipboardData).getData('text/html');
      var text = (ev.clipboardData || window.clipboardData).getData('text/plain');
      ev.preventDefault();
      if (html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html.replace(/<!--[\s\S]*?-->/g, '');
        tmp.querySelectorAll('style,script,meta,link,title,xml,base,iframe,object,embed,form,input,button,img,svg,video,audio').forEach(function (n) { n.remove(); });
        tmp.querySelectorAll('span,font').forEach(function (n) {
          var st = (n.getAttribute('style') || '').toLowerCase();
          var bold = /font-weight:\s*(bold|[6-9]00)/.test(st);
          var ital = /font-style:\s*italic/.test(st);
          var inner = document.createDocumentFragment();
          while (n.firstChild) { inner.appendChild(n.firstChild); }
          var wrap = inner;
          if (ital) { var i = document.createElement('i'); i.appendChild(wrap); wrap = i; }
          if (bold) { var b = document.createElement('b'); b.appendChild(wrap); wrap = b; }
          n.replaceWith(wrap);
        });
        tmp.querySelectorAll('*').forEach(function (n) {
          Array.prototype.slice.call(n.attributes).forEach(function (a) {
            var keep = a.name === 'href' && n.tagName === 'A' && /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(a.value);
            if (!keep) { n.removeAttribute(a.name); }
          });
        });
        tmp.querySelectorAll('h1').forEach(function (h) { var h2 = document.createElement('h2'); h2.innerHTML = h.innerHTML; h.replaceWith(h2); });
        tmp.querySelectorAll('p,b,i,h2,h3,li').forEach(function (n) { if (!n.textContent.trim() && !n.querySelector('br')) { n.remove(); } });
        document.execCommand('insertHTML', false, tmp.innerHTML);
      } else { document.execCommand('insertText', false, text); }
      dirty = true;
    });
    ['f-title', 'f-teaser', 'f-description', 'f-audience', 'f-body'].forEach(function (id) { document.getElementById(id).addEventListener('input', function () { dirty = true; }); });
    window.addEventListener('beforeunload', function (ev) { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-action]'));
    var busy = function (on) { buttons.forEach(function (x) { x.disabled = on; }); };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var action = b.getAttribute('data-action');
        if (action === 'delete') {
          if (!window.confirm('Delete this article for good? This cannot be undone.')) { return; }
          busy(true);
          post('/admin/api/post-delete', { original: data.slug }).then(function (r) { busy(false); if (r.ok) { dirty = false; location.href = '/admin/blog'; } else { fail(r); } })
            .catch(function () { busy(false); say('No connection. Nothing was deleted – please try again.', true); });
          return;
        }
        if (action === 'publish') {
          if (!document.getElementById('f-teaser').value.trim() || !body.textContent.trim()) { say('Please add a summary and the article text before publishing.', true); return; }
          if (!window.confirm('Publish this article? It will appear on the Blog page for everyone.')) { return; }
        }
        say('Saving…');
        busy(true);   // one click, one article: a second click on a new article would otherwise create a copy
        post('/admin/api/post', {
          original: data.slug, action: action,
          title: document.getElementById('f-title').value, audience: document.getElementById('f-audience').value,
          teaser: document.getElementById('f-teaser').value,
          description: document.getElementById('f-description').value, body: body.innerHTML
        }).then(function (r) {
          busy(false);
          if (!r.ok) { fail(r); return; }
          dirty = false;
          location.href = '/admin/blog/edit?slug=' + encodeURIComponent(r.slug) + '&saved=' + action;
        }).catch(function () { busy(false); say('No connection. Your text is still here – please try again.', true); });
      });
    });
    var saved = /[?&]saved=([a-z]+)/.exec(location.search);
    if (saved) { say(saved[1] === 'publish' ? 'Published. It is on the Blog page now.' : saved[1] === 'unpublish' ? 'Taken offline. It is a draft again.' : 'Saved. Press View to see it as visitors will.'); }
  }
})();
