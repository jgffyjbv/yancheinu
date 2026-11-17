/* Scripts for the /admin screens (messages, pages list, and the editor for free guides and blog articles). */
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

  if (page === 'messages') {
    var testBtn = document.querySelector('[data-test-mail]');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        testBtn.disabled = true;
        say('Sending…');
        post('/admin/api/test-mail', {}).then(function (r) {
          testBtn.disabled = false;
          if (!r.ok) { fail(r); return; }
          say(r.message || 'Sent.');
        }).catch(function () { testBtn.disabled = false; say('No connection. Please try again.', true); });
      });
    }
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

  if (page === 'post' || page === 'guide') {
    // one editor for both: a free guide has an introduction and gets a PDF; an article has a summary and a Google description
    var guide = page === 'guide';
    var cfg = guide
      ? { api: '/admin/api/guide', del: '/admin/api/guide-delete', edit: '/admin/guides/edit?slug=', list: '/admin/guides', thing: 'guide', where: 'the Free Guides page', summary: 'f-intro', summaryName: 'an introduction', fields: ['f-title', 'f-intro', 'f-audience', 'f-body'] }
      : { api: '/admin/api/post', del: '/admin/api/post-delete', edit: '/admin/blog/edit?slug=', list: '/admin/blog', thing: 'article', where: 'the Blog page', summary: 'f-teaser', summaryName: 'a summary', fields: ['f-title', 'f-teaser', 'f-description', 'f-audience', 'f-body', 'f-date'] };
    var live = !!document.querySelector('[data-action="unpublish"]');
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
      if (cmd === 'checklist') {
        // a bulleted list that shows a box to tick on each line
        document.execCommand('insertUnorderedList', false, null);
        var node = window.getSelection && window.getSelection().anchorNode;
        while (node && node !== body && node.nodeName !== 'UL') { node = node.parentNode; }
        if (node && node.nodeName === 'UL') { node.className = 'checklist'; }
      } else if (cmd === 'link') {
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
    // f-date (the date an article shows) is only there once the article is published
    cfg.fields.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) { return; }
      el.addEventListener('input', function () { dirty = true; });
      el.addEventListener('change', function () { dirty = true; });
    });
    window.addEventListener('beforeunload', function (ev) { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
    var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-action]'));
    var busy = function (on) { buttons.forEach(function (x) { x.disabled = on; }); };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var action = b.getAttribute('data-action');
        if (action === 'delete') {
          if (!window.confirm('Delete this ' + cfg.thing + ' for good? This cannot be undone.')) { return; }
          busy(true);
          post(cfg.del, { original: data.slug }).then(function (r) { busy(false); if (r.ok) { dirty = false; location.href = cfg.list; } else { fail(r); } })
            .catch(function () { busy(false); say('No connection. Nothing was deleted – please try again.', true); });
          return;
        }
        if (action === 'pdf') {
          if (dirty && !window.confirm('You have changes that are not saved. Make the PDF from the guide as it was last saved?')) { return; }
          say('Making the PDF… this takes about 15 seconds.');
          busy(true);
          post('/admin/api/guide-pdf', { original: data.slug }).then(function (r) {
            busy(false);
            if (!r.ok) { fail(r); return; }
            dirty = false;
            location.href = cfg.edit + encodeURIComponent(r.slug) + '&saved=pdf';
          }).catch(function () { busy(false); say('No connection. Please try again.', true); });
          return;
        }
        if (action === 'publish') {
          if (!document.getElementById(cfg.summary).value.trim() || !body.textContent.trim()) { say('Please add ' + cfg.summaryName + ' and the ' + cfg.thing + ' text before publishing.', true); return; }
          if (!window.confirm('Publish this ' + cfg.thing + '? It will appear on ' + cfg.where + ' for everyone.')) { return; }
        }
        var slow = guide && (action === 'publish' || (live && action === 'save'));
        say(slow ? 'Saving and making the PDF download… this takes about 15 seconds.' : 'Saving…');
        busy(true);   // one click, one save: a second click on a new one would otherwise create a copy
        var fields = { original: data.slug, action: action, title: document.getElementById('f-title').value, audience: document.getElementById('f-audience').value, body: body.innerHTML };
        if (guide) { fields.intro = document.getElementById('f-intro').value; }
        else {
          fields.teaser = document.getElementById('f-teaser').value; fields.description = document.getElementById('f-description').value;
          var shown = document.getElementById('f-date');
          if (shown) { fields.published = shown.value; }
        }
        post(cfg.api, fields).then(function (r) {
          busy(false);
          if (!r.ok) { fail(r); return; }
          dirty = false;
          var note = guide && r.status === 'published' && r.pdf === false ? 'nopdf' : action;
          location.href = cfg.edit + encodeURIComponent(r.slug) + '&saved=' + note;
        }).catch(function () { busy(false); say('No connection. Your text is still here – please try again.', true); });
      });
    });
    var saved = /[?&]saved=([a-z]+)/.exec(location.search);
    if (saved) {
      var done = { publish: 'Published. It is on ' + cfg.where + ' now' + (guide ? ', with its PDF download.' : '.'), unpublish: 'Taken offline. It is a draft again.', pdf: 'Done — a fresh PDF download is ready.' };
      if (saved[1] === 'nopdf') { say('Saved and online — but the PDF download could not be made just now. Please press "Make the PDF again" in a few minutes.', true); }
      else { say(done[saved[1]] || 'Saved. Press View to see it as visitors will.'); }
    }
  }
})();
