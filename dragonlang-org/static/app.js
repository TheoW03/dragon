// Dragon Docs - minimal client-side JS.
//
// Single responsibility: theme toggle. Persists user choice in localStorage
// and applies it before first paint by reading the stored value as early as
// possible. Everything else (layout, navigation, sidebar) is server-rendered
// and works fine without JS.

(function () {
    var KEY = 'dragon-docs-theme';
    var root = document.documentElement;

    // Restore saved theme as soon as the script runs (script tag is at the
    // end of <body>, so first paint already happened with the default
    // light theme - for stricter no-flash we'd inline this in <head>).
    try {
        var saved = localStorage.getItem(KEY);
        if (saved === 'light' || saved === 'dark') {
            root.setAttribute('data-theme', saved);
        }
    } catch (_) {}

    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    function refreshIcon() {
        // Sun for light mode (you're in it; icon hints "press for dark"
        // wouldn't be intuitive, so use the current state's icon - Rust
        // Book uses a paintbrush, we use the literal sun/moon glyph).
        var current = root.getAttribute('data-theme') || 'light';
        btn.textContent = current === 'dark' ? '☽' : '☀';
    }

    btn.addEventListener('click', function () {
        var current = root.getAttribute('data-theme') || 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (_) {}
        refreshIcon();
    });

    refreshIcon();
})();

// Sidebar chapter folds. The server renders every chapter expanded and tags
// the chapter containing the current page with data-active. We persist the
// reader's manual collapses in localStorage (keyed by chapter index) and
// reapply them on each page - but never collapse the active chapter, so the
// page you're reading is always visible in the sidebar.
(function () {
    var FKEY = 'dragon-docs-folds';
    function load() {
        try { return JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; }
        catch (_) { return {}; }
    }
    function save(f) {
        try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch (_) {}
    }

    var folds = load();
    var chapters = document.querySelectorAll('details.sb-chapter');
    Array.prototype.forEach.call(chapters, function (d) {
        var id = d.getAttribute('data-ch');
        var isActive = d.hasAttribute('data-active');
        // Reapply a saved collapse for non-active chapters; the active chapter
        // stays open regardless of saved state.
        if (!isActive && Object.prototype.hasOwnProperty.call(folds, id)) {
            d.open = !!folds[id];
        }
        d.addEventListener('toggle', function () {
            folds[id] = d.open;
            save(folds);
        });
    });

    // Sidebar scroll position: preserve it across page navigations so clicking
    // a link doesn't bounce the TOC back to the top and force the reader to
    // scroll back. The scrolling container is the nav list (.sb-list) - the
    // brand heading and search box are pinned above it and never scroll - so we
    // stash .sb-list's scrollTop in sessionStorage on scroll and restore it on
    // load. Only when there is no saved position (the first docs page this tab
    // visits) do we fall back to scrolling the active entry into view.
    var sb = document.querySelector('.sb-list') || document.querySelector('.sidebar');
    if (sb) {
        var SKEY = 'dragon-docs-sb-scroll';
        var restored = false;
        try {
            var savedTop = sessionStorage.getItem(SKEY);
            if (savedTop !== null && savedTop !== '') {
                sb.scrollTop = parseInt(savedTop, 10) || 0;
                restored = true;
            }
        } catch (_) {}

        if (!restored) {
            var active = document.querySelector('.sidebar .sb-active');
            if (active && active.scrollIntoView) {
                active.scrollIntoView({ block: 'nearest' });
            }
        }

        sb.addEventListener('scroll', function () {
            try { sessionStorage.setItem(SKEY, String(sb.scrollTop)); } catch (_) {}
        }, { passive: true });
    }
})();

// Download page: highlight the card matching the visitor's OS. The server
// already picks one from the User-Agent; this refines it client-side using
// navigator.platform (more reliable behind proxies) and reveals the
// "Recommended for your system" badge on the matched card.
(function () {
    var grid = document.querySelector('.dl-grid');
    if (!grid) return;
    try {
        var hint = (navigator.platform || '') + ' ' + (navigator.userAgent || '');
        var os = '';
        if (/Win/i.test(hint)) os = 'windows';
        else if (/Mac|Darwin|iP(hone|ad|od)/i.test(hint)) os = 'macos';
        else if (/Linux|X11|Android|CrOS/i.test(hint)) os = 'linux';
        if (!os) return;

        var match = grid.querySelector('.dl-card[data-os="' + os + '"]');
        if (!match) return;

        Array.prototype.forEach.call(grid.querySelectorAll('.dl-card'), function (card) {
            var isMatch = card === match;
            card.classList.toggle('featured', isMatch);
            var badge = card.querySelector('.dl-rec');
            if (badge) badge.style.display = isMatch ? '' : 'none';
        });
    } catch (_) {}
})();

// Download page: clipboard-copy on the install command, plus the macOS
// "Install via curl" button that scrolls to the command box and pulses it.
// The trigger is a real #dl-quick anchor, and the copy button falls back to
// execCommand where the async clipboard API is absent
(function () {
    var box = document.querySelector('.dl-quick');
    if (!box) return;
    var cmd = box.querySelector('.dl-cmd');

    function fallbackCopy(text, done) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (_) {}
    }

    var copyBtn = box.querySelector('.dl-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', function () {
            var target = document.getElementById(copyBtn.getAttribute('data-copy'));
            var text = target ? target.textContent : '';
            var done = function () {
                copyBtn.classList.add('copied');
                copyBtn.setAttribute('title', 'Copied');
                setTimeout(function () {
                    copyBtn.classList.remove('copied');
                    copyBtn.setAttribute('title', 'Copy');
                }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
            } else {
                fallbackCopy(text, done);
            }
        });
    }

    function glow() {
        if (!cmd) return;
        cmd.classList.remove('dl-glow');
        void cmd.offsetWidth;   // reflow so the animation restarts on repeat clicks
        cmd.classList.add('dl-glow');
    }
    Array.prototype.forEach.call(document.querySelectorAll('.dl-curl-trigger'), function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { box.scrollIntoView(); }
            glow();
        });
    });
})();

// Docs search. A single input in the sidebar; the index (titles + every
// in-page heading, each with an anchor URL and a preview) is fetched once from
// /docs/search-index.json on first use and filtered entirely client-side, so
// there is no per-keystroke round-trip. Keyboard: type to filter, Up/Down to
// move, Enter to open, Esc to clear/close. Degrades to nothing without JS
// (the input is inert but the server-rendered nav still works).
(function () {
    var input = document.getElementById('docsearch');
    var box = document.getElementById('docsearch-results');
    if (!input || !box) return;

    var index = null;       // loaded lazily
    var loading = false;
    var items = [];         // current result <a> elements
    var active = -1;        // keyboard-highlighted index

    function ensureIndex(cb) {
        if (index) { cb(); return; }
        if (loading) return;
        loading = true;
        fetch('/docs/search-index.json')
            .then(function (r) { return r.json(); })
            .then(function (data) { index = data || []; loading = false; cb(); })
            .catch(function () { loading = false; });
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // Highlight each query term inside an (already-escaped) string.
    function mark(text, terms) {
        var out = escapeHtml(text);
        terms.forEach(function (t) {
            if (!t) return;
            var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
            out = out.replace(re, '<mark>$1</mark>');
        });
        return out;
    }

    // Score an entry against the query terms. Title hits outweigh body hits;
    // a title that starts with the query ranks highest. Every term must appear
    // somewhere (title or body) for the entry to qualify.
    function score(entry, terms) {
        var title = (entry.t || '').toLowerCase();
        var body = (entry.b || '').toLowerCase();
        var s = 0;
        for (var i = 0; i < terms.length; i++) {
            var term = terms[i];
            var inTitle = title.indexOf(term);
            var inBody = body.indexOf(term);
            if (inTitle < 0 && inBody < 0) return -1;   // term missing -> reject
            if (inTitle === 0) s += 100;
            else if (inTitle > 0) s += 40;
            if (inBody >= 0) s += 5;
        }
        // A heading result (has a parent page) is a more precise landing spot
        // than a whole-page result; nudge it up on ties.
        if (entry.p) s += 3;
        return s;
    }

    function render(results, terms) {
        if (results.length === 0) {
            box.innerHTML = '<div class="docsearch-empty">No matches</div>';
            box.hidden = false;
            items = [];
            active = -1;
            return;
        }
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var e = results[i];
            var page = e.p ? '<span class="docsearch-page">' + escapeHtml(e.p) + '</span>' : '';
            var snip = e.b ? '<span class="docsearch-snippet">' + mark(e.b, terms) + '</span>' : '';
            html += '<a class="docsearch-item" href="' + escapeHtml(e.u) + '">'
                 +  '<span class="docsearch-title">' + mark(e.t, terms) + page + '</span>'
                 +  snip + '</a>';
        }
        box.innerHTML = html;
        box.hidden = false;
        items = Array.prototype.slice.call(box.querySelectorAll('.docsearch-item'));
        active = -1;
    }

    function run() {
        var q = input.value.trim().toLowerCase();
        if (q.length < 2) { close(); return; }
        ensureIndex(function () {
            var terms = q.split(/\s+/).filter(Boolean);
            var scored = [];
            for (var i = 0; i < index.length; i++) {
                var sc = score(index[i], terms);
                if (sc >= 0) scored.push({ e: index[i], s: sc });
            }
            scored.sort(function (a, b) { return b.s - a.s; });
            render(scored.slice(0, 25).map(function (x) { return x.e; }), terms);
        });
    }

    function close() {
        box.hidden = true;
        box.innerHTML = '';
        items = [];
        active = -1;
    }

    function setActive(n) {
        if (active >= 0 && items[active]) items[active].classList.remove('active');
        active = n;
        if (active >= 0 && items[active]) {
            items[active].classList.add('active');
            items[active].scrollIntoView({ block: 'nearest' });
        }
    }

    var debounce;
    input.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(run, 90);
    });

    input.addEventListener('keydown', function (ev) {
        if (box.hidden || items.length === 0) {
            if (ev.key === 'Escape') { input.value = ''; close(); }
            return;
        }
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            setActive((active + 1) % items.length);
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            setActive((active - 1 + items.length) % items.length);
        } else if (ev.key === 'Enter') {
            var target = active >= 0 ? items[active] : items[0];
            if (target) { ev.preventDefault(); window.location.href = target.getAttribute('href'); }
        } else if (ev.key === 'Escape') {
            input.value = '';
            close();
        }
    });

    // Close when focus/clicks leave the search box.
    document.addEventListener('click', function (ev) {
        if (!input.contains(ev.target) && !box.contains(ev.target)) close();
    });
    input.addEventListener('focus', function () { if (input.value.trim().length >= 2) run(); });

    // "/" focuses search from anywhere (unless already typing in a field).
    document.addEventListener('keydown', function (ev) {
        if (ev.key === '/' && document.activeElement !== input) {
            var tag = (document.activeElement && document.activeElement.tagName) || '';
            if (tag !== 'INPUT' && tag !== 'TEXTAREA') { ev.preventDefault(); input.focus(); }
        }
    });
})();

// Scroll-spy for the active page's in-page sub-nav: highlight the ##/### entry
// whose section the reader is currently in. Purely visual; the links work
// without it.
(function () {
    var subs = document.querySelectorAll('.sb-subsections a[data-anchor]');
    if (!subs.length) return;
    var byAnchor = {};
    var headings = [];
    Array.prototype.forEach.call(subs, function (a) {
        var id = a.getAttribute('data-anchor');
        byAnchor[id] = a;
        var h = document.getElementById(id);
        if (h) headings.push(h);
    });
    if (!headings.length) return;

    function spy() {
        var top = 80;                 // account for the sticky topbar
        var current = headings[0];
        for (var i = 0; i < headings.length; i++) {
            if (headings[i].getBoundingClientRect().top <= top) current = headings[i];
            else break;
        }
        Array.prototype.forEach.call(subs, function (a) { a.classList.remove('sb-sub-active'); });
        var link = current && byAnchor[current.id];
        if (link) link.classList.add('sb-sub-active');
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () { spy(); ticking = false; });
    }, { passive: true });
    spy();
})();
