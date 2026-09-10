/**
 * Installs window.qa — measurement helpers for QA runs.
 *
 *   playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/probes.js"
 *
 * Installed on the current page and re-installed on every subsequent navigation,
 * so it survives reloads. Every probe returns a plain object; call them through
 * `playwright-cli --raw eval "JSON.stringify(qa.something())"`.
 */
async page => {
  const install = () => {
    const S = (el) => getComputedStyle(el);
    const px = (v) => Math.round(v);

    const parseColor = (s) => {
      if (!s || s === 'transparent') return null;
      const m = s.match(/[\d.]+/g);
      if (!m) return null;
      const a = m.length > 3 ? parseFloat(m[3]) : 1;
      return { r: +m[0], g: +m[1], b: +m[2], a };
    };

    const over = (fg, bg) =>
      fg.a >= 1 ? fg : {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      };

    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };

    const rgb = (c) => `rgb(${px(c.r)}, ${px(c.g)}, ${px(c.b)})`;
    const one = (sel) => (typeof sel === 'string' ? document.querySelector(sel) : sel);
    const all = (sel) => (typeof sel === 'string' ? [...document.querySelectorAll(sel)] : [sel]);

    const qa = {
      /** Bounding box plus the centre point — feed cx/cy straight to `mousemove`. */
      box(sel) {
        const el = one(sel);
        if (!el) return { error: 'not found', sel };
        const r = el.getBoundingClientRect();
        return {
          x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height),
          cx: px(r.x + r.width / 2), cy: px(r.y + r.height / 2),
          inViewport: r.bottom > 0 && r.top < innerHeight && r.width > 0,
          visible: r.width > 0 && r.height > 0 && S(el).visibility !== 'hidden',
        };
      },

      /**
       * WCAG contrast for an element's text.
       * Walks ancestors for the first opaque background colour. If it meets a
       * gradient, image or nothing at all, it says so instead of guessing —
       * a canvas or gradient backdrop has to be judged from a screenshot.
       */
      contrast(sel) {
        const el = one(sel);
        if (!el) return { error: 'not found', sel };
        const st = S(el);
        const fg = parseColor(st.color);
        if (!fg) return { error: 'no text colour' };

        const rect = el.getBoundingClientRect();

        // Off-screen elements cannot be judged: fixed backdrops only overlap
        // what is currently in the viewport, so measuring here silently reports
        // the wrong backdrop. Scroll it into view first.
        if (rect.bottom <= 0 || rect.top >= innerHeight || rect.width === 0) {
          return {
            reliable: false,
            reason: 'element is outside the viewport',
            hint: 'scrollIntoView({block:"center"}) first, then measure — a fixed backdrop only covers what is on screen',
            box: { y: px(rect.y), h: px(rect.height) },
          };
        }

        // Anything positioned that paints behind the text is invisible to an
        // ancestor walk — a fixed gradient or a canvas backdrop, typically.
        // Ignoring those is how a probe reports "passes AA" over an unreadable
        // background, so their presence makes the result unreliable by design.
        const ancestors = new Set();
        for (let p = el; p; p = p.parentElement) ancestors.add(p);
        const overlays = [...document.querySelectorAll('body *')].filter((e) => {
          if (ancestors.has(e) || e.contains(el)) return false;
          const s = S(e);
          if (!['fixed', 'absolute'].includes(s.position)) return false;
          if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
          const bg = parseColor(s.backgroundColor);
          const paints = e.tagName === 'CANVAS' || e.tagName === 'IMG' ||
            (s.backgroundImage && s.backgroundImage !== 'none') || (bg && bg.a > 0);
          if (!paints) return false;
          const r = e.getBoundingClientRect();
          return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom;
        }).map((e) => e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : ''));

        let node = el, backdrop = null, kind = 'solid', painted = [];
        while (node && node !== document.documentElement.parentNode) {
          const ns = S(node);
          if (ns.backgroundImage && ns.backgroundImage !== 'none') {
            kind = /gradient/.test(ns.backgroundImage) ? 'gradient' : 'image';
            painted.push(node.tagName + (node.className ? '.' + String(node.className).split(' ')[0] : ''));
            break;
          }
          const bg = parseColor(ns.backgroundColor);
          if (bg && bg.a > 0) {
            if (bg.a >= 0.95) { backdrop = bg; break; }
            painted.push(`${node.tagName} bg alpha ${bg.a}`);
          }
          node = node.parentElement;
        }

        if (!backdrop || kind !== 'solid' || overlays.length) {
          return {
            reliable: false,
            reason: overlays.length ? 'positioned layers paint behind this text'
              : kind !== 'solid' ? `backdrop is a ${kind}`
              : 'no opaque background found',
            behind: overlays.length ? overlays.slice(0, 5) : painted,
            textColor: st.color,
            fontSize: st.fontSize,
            hint: 'not measurable from CSS alone — sample the rendered pixels from a screenshot, or interpolate the gradient/scene colour at this element\'s own position',
            box: { cx: px(rect.x + rect.width / 2), cy: px(rect.y + rect.height / 2) },
          };
        }

        const eff = over(fg, backdrop);
        const ratio = +(((Math.max(lum(eff), lum(backdrop)) + 0.05) / (Math.min(lum(eff), lum(backdrop)) + 0.05)).toFixed(2));
        const size = parseFloat(st.fontSize);
        const large = size >= 24 || (size >= 18.66 && +st.fontWeight >= 700);
        return {
          reliable: true, ratio, large,
          AA: ratio >= (large ? 3 : 4.5),
          AAA: ratio >= (large ? 4.5 : 7),
          textColor: rgb(eff), backdrop: rgb(backdrop),
          fontSize: st.fontSize,
        };
      },

      /** Ancestor chain with the properties that hide things — the "find the mechanism" probe. */
      chain(sel) {
        let el = one(sel);
        if (!el) return { error: 'not found', sel };
        const out = [];
        while (el && el.tagName !== 'HTML') {
          const s = S(el);
          out.push({
            tag: el.tagName,
            cls: String(el.className || '').split(' ')[0].slice(0, 24),
            display: s.display, visibility: s.visibility, opacity: s.opacity,
            overflow: s.overflow, pointerEvents: s.pointerEvents,
            h: px(el.getBoundingClientRect().height),
          });
          el = el.parentElement;
        }
        return out;
      },

      /** Navigation timing, page weight and the resources that dominate it. */
      perf(heavyKB = 300) {
        const n = performance.getEntriesByType('navigation')[0] || {};
        const r = performance.getEntriesByType('resource');
        const paint = performance.getEntriesByType('paint');
        const total = r.reduce((s, x) => s + (x.transferSize || 0), 0);
        return {
          ttfb: px(n.responseStart), fcp: px(paint.find((p) => p.name === 'first-contentful-paint')?.startTime || 0),
          domInteractive: px(n.domInteractive), loadEnd: px(n.loadEventEnd),
          requests: r.length, totalMB: +(total / 1048576).toFixed(2),
          heaviest: r.filter((x) => (x.transferSize || 0) > heavyKB * 1024)
            .sort((a, b) => b.transferSize - a.transferSize)
            .map((x) => ({ url: x.name.split('/').pop().slice(0, 48), MB: +(x.transferSize / 1048576).toFixed(2), ms: px(x.duration) })),
          externalHosts: [...new Set(r.filter((x) => !x.name.startsWith(location.origin)).map((x) => { try { return new URL(x.name).host; } catch { return null; } }).filter(Boolean))],
        };
      },

      /** Broken media, alt coverage, lazy-loading. */
      media() {
        const imgs = [...document.images];
        const vids = [...document.querySelectorAll('video')];
        return {
          images: imgs.length,
          broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc.split('/').pop()),
          missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
          emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
          lazy: imgs.filter((i) => i.loading === 'lazy').length,
          formats: [...new Set(imgs.map((i) => (i.currentSrc || '').split('.').pop().split('?')[0]).filter(Boolean))],
          videos: vids.length,
          videosErrored: vids.filter((v) => v.error).map((v) => v.error.code),
        };
      },

      /** Same-origin links, and whether each in-page anchor actually resolves. */
      links() {
        const as = [...document.querySelectorAll('a[href]')];
        const internal = [...new Set(as.map((a) => a.href).filter((h) => h.startsWith(location.origin)))];
        const anchors = as
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && h.startsWith('#') && h.length > 1)
          .map((h) => ({ anchor: h, resolves: !!document.getElementById(h.slice(1)) }));
        return {
          total: as.length, internal,
          placeholders: as.filter((a) => ['#', ''].includes(a.getAttribute('href')))
            .map((a) => ({ text: a.textContent.trim().slice(0, 40) || null, label: a.getAttribute('aria-label') })),
          anchors,
          noAccessibleName: as.filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')).length,
        };
      },

      /** Dialog / modal semantics and focus placement. */
      dialog(sel) {
        const el = one(sel);
        if (!el) return { error: 'not found', sel };
        const a = document.activeElement;
        return {
          role: el.getAttribute('role'),
          ariaModal: el.getAttribute('aria-modal'),
          labelled: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'),
          nativeDialog: el.tagName === 'DIALOG',
          focusInside: el.contains(a),
          activeElement: a ? a.tagName + '.' + String(a.className || '').split(' ')[0] : null,
          bodyOverflow: S(document.body).overflow,
          htmlOverflow: S(document.documentElement).overflow,
        };
      },

      /** The element the wheel will actually scroll — move the mouse here first. */
      scroller(within) {
        const root = within ? one(within) : document.body;
        if (!root) return { error: 'not found', sel: within };
        const found = [root, ...root.querySelectorAll('*')].filter((e) => {
          const s = S(e);
          return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 8;
        }).slice(0, 4).map((e) => {
          const r = e.getBoundingClientRect();
          return {
            tag: e.tagName, cls: String(e.className || '').split(' ')[0].slice(0, 24),
            scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, scrollTop: px(e.scrollTop),
            cx: px(r.x + r.width / 2), cy: px(r.y + r.height / 2),
          };
        });
        return { pageScrolls: document.documentElement.scrollHeight > innerHeight, containers: found };
      },

      /** Horizontal overflow and what is sticking out. */
      overflow() {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll('body *')].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && S(e).position !== 'fixed';
        }).slice(0, 8).map((e) => ({
          tag: e.tagName, cls: String(e.className || '').split(' ')[0].slice(0, 24),
          left: px(e.getBoundingClientRect().left), right: px(e.getBoundingClientRect().right),
        }));
        return { viewport: innerWidth, scrollWidth: de.scrollWidth, overflows: de.scrollWidth > innerWidth, culprits: wide };
      },

      /** WebGL health. Never read pixels back — confirm rendering with a screenshot. */
      webgl(sel = 'canvas') {
        return all(sel).map((c) => {
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          const r = c.getBoundingClientRect();
          return {
            id: c.id || null,
            context: gl ? (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1') : 'none',
            contextLost: gl ? gl.isContextLost() : null,
            cssSize: [px(r.width), px(r.height)],
            buffer: [c.width, c.height],
            ratio: r.width ? +(c.width / r.width).toFixed(2) : null,
            matchesViewport: px(r.width) === innerWidth,
          };
        });
      },

      /** Landmarks and heading outline — a quick read of the accessibility tree. */
      outline() {
        const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          .filter((h) => !h.closest('[aria-hidden="true"]'))
          .map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) }));
        const landmarks = [...document.querySelectorAll('main,nav,header,footer,aside,[role]')]
          .filter((e) => !e.closest('[aria-hidden="true"]'))
          .map((e) => e.getAttribute('role') || e.tagName.toLowerCase());
        return {
          headings: hs,
          h1Count: hs.filter((h) => h.level === 1).length,
          landmarks: [...new Set(landmarks)],
          ariaHidden: document.querySelectorAll('[aria-hidden="true"]').length,
          focusable: [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
            .filter((e) => { const r = e.getBoundingClientRect(); return S(e).visibility !== 'hidden' && r.width > 0; }).length,
        };
      },

      /**
       * Everything worth knowing about the current page, in one call.
       * Use it per route when sweeping several pages — one round trip instead
       * of four, which matters once you are walking ten of them.
       */
      sweep() {
        const p = qa.perf();
        const o = qa.outline();
        const m = qa.media();
        const l = qa.links();
        return {
          url: location.pathname + location.search,
          title: document.title,
          lang: document.documentElement.lang || null,
          weightMB: p.totalMB, requests: p.requests, fcp: p.fcp,
          headings: o.headings.length, h1Count: o.h1Count,
          landmarks: o.landmarks, focusable: o.focusable,
          images: m.images, brokenImages: m.broken, missingAlt: m.missingAlt,
          links: l.total, placeholders: l.placeholders.length,
          brokenAnchors: l.anchors.filter((a) => !a.resolves).map((a) => a.anchor),
          overflowsX: qa.overflow().overflows,
          canvases: document.querySelectorAll('canvas').length,
          forms: document.querySelectorAll('form').length,
        };
      },

      /** Scroll to a fraction of the page and report what changed there. */
      at(fraction, readers = {}) {
        scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * fraction));
        const out = { scrollY: px(scrollY), fraction };
        for (const [k, sel] of Object.entries(readers)) {
          const el = one(sel);
          out[k] = el ? el.textContent.trim() : null;
        }
        return out;
      },
    };

    Object.defineProperty(window, 'qa', { value: qa, configurable: true });
    return Object.keys(qa);
  };

  await page.addInitScript(install);   // survives reloads and navigations
  const probes = await page.evaluate(install); // and works on the page already open
  return `qa installed: ${probes.join(', ')}`;
}
