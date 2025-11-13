/* script.js
   For: Magisto Techy — renders feed and latest uploads (with animations)
   Usage:
     - Place next to index.html and style.css
     - Add <script src="script.js" defer></script> before </body>
     - Call addPost({...}) or MagistoFeed.addPost({...}) to add posts dynamically
     - This file injects a small amount of animation CSS at runtime (no manual CSS edit needed)
*/

(() => {
  const feedEl = document.getElementById('feed');
  const emptyEl = document.getElementById('emptyState');
  const latestList = document.getElementById('latestList');
  const STORAGE_KEY = 'magisto_posts_v1';

  // inject animation CSS (keeps styling changes local to this script)
  injectAnimationStyles();

  // posts loaded from storage (no seed/example templates included)
  let posts = loadPosts() || [];

  // DOM ready wiring
  document.addEventListener('DOMContentLoaded', () => {
    renderFeed();
    wireClearButton();
    initObservers();
  });

  // Public API: addPost
  window.addPost = function (postObj = {}) {
    const safePost = {
      title: sanitizeString(postObj.title, 'Untitled'),
      thumb: sanitizeString(postObj.thumb, 'https://picsum.photos/800/450'),
      url: sanitizeString(postObj.url, '#'),
      duration: sanitizeString(postObj.duration, ''),
      excerpt: sanitizeString(postObj.excerpt, ''),
      channelName: sanitizeString(postObj.channelName, ''),
      channelAvatar: sanitizeString(postObj.channelAvatar, 'https://picsum.photos/seed/av/100/100'),
      meta: sanitizeString(postObj.meta, ''),
      tag: sanitizeString(postObj.tag, '')
    };

    // Add and animate
    posts.unshift(safePost); // newest first
    savePosts();
    renderFeed({ highlightNew: true });
  };

  // Render feed and latest list
  function renderFeed(options = {}) {
    if (!feedEl || !latestList || !emptyEl) return;

    // empty feed
    if (!posts || posts.length === 0) {
      feedEl.innerHTML = '';
      emptyEl.classList.add('show');
      latestList.textContent = 'No uploads';
      return;
    }
    emptyEl.classList.remove('show');

    // render main feed (use fragment for performance)
    const frag = document.createDocumentFragment();
    posts.forEach((p, idx) => {
      const card = document.createElement('article');
      card.className = 'card anim-card'; // anim-card toggled by observer
      // add data attribute so we can identify newest item for pop animation
      if (options.highlightNew && idx === 0) card.dataset.new = '1';

      card.innerHTML = `
        <a class="thumb" href="${escapeHtml(p.url)}" aria-label="${escapeHtml(p.title)}" rel="noopener noreferrer">
          <img src="${escapeHtml(p.thumb)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <div class="duration">${escapeHtml(p.duration)}</div>
        </a>
        <div class="meta">
          <a class="title" href="${escapeHtml(p.url)}" rel="noopener noreferrer">${escapeHtml(p.title)}</a>
          ${p.excerpt ? `<p class="excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
          <div class="meta-row">
            <div class="channel">
              <img src="${escapeHtml(p.channelAvatar)}" alt="${escapeHtml(p.channelName)}">
              <div style="display:flex;flex-direction:column">
                <strong style="font-size:13px">${escapeHtml(p.channelName)}</strong>
                <span style="font-size:12px;color:var(--muted)">${escapeHtml(p.meta)}</span>
              </div>
            </div>
            <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.tag)}</div>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });
    feedEl.innerHTML = '';
    feedEl.appendChild(frag);

    // render latest uploads (top 5) with stagger class
    latestList.innerHTML = '';
    posts.slice(0, 5).forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'latest-item';
      // stagger delay via inline style (kept small)
      item.style.animationDelay = `${i * 80}ms`;
      item.innerHTML = `
        <img src="${escapeHtml(p.thumb)}" style="width:80px;height:48px;object-fit:cover;border-radius:6px" alt="${escapeHtml(p.title)}">
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${escapeHtml(p.title)}</div>
          <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.meta)}</div>
        </div>
      `;
      latestList.appendChild(item);
    });

    // re-init observers (cards replaced)
    if (window._magistoObserver) {
      window._magistoObserver.disconnect();
      initObservers(); // reconnect
    }

    // if highlight requested, apply quick pop animation to newest
    if (options.highlightNew) {
      const firstCard = feedEl.querySelector('.card[data-new="1"]');
      if (firstCard) {
        firstCard.classList.add('pop-new');
        // remove marker and class after animation completes
        setTimeout(() => {
          firstCard.removeAttribute('data-new');
          firstCard.classList.remove('pop-new');
        }, 550);
      }
    }
  }

  // wire clear button
  function wireClearButton() {
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('Clear saved posts? This cannot be undone.')) return;
        posts = [];
        savePosts();
        renderFeed();
      });
    }
  }

  // IntersectionObserver to reveal cards with animation when they scroll into view
  function initObservers() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // don't animate on reduced-motion preference
      document.querySelectorAll('.anim-card').forEach(el => el.classList.add('visible'));
      document.querySelectorAll('.latest-item').forEach(el => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          // we can unobserve after visible
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, threshold: 0.12 });

    document.querySelectorAll('.anim-card').forEach((el, i) => {
      // slight stagger based on index (so a column of cards don't all jump at once)
      el.style.transitionDelay = `${(i % 6) * 40}ms`;
      observer.observe(el);
    });

    document.querySelectorAll('.latest-item').forEach(item => {
      observer.observe(item);
    });

    // keep a global reference so we can disconnect later
    window._magistoObserver = observer;

    // subtle parallax on mouse move for background elements (if present)
    setupPointerParallax();
  }

  // localStorage helpers
  function savePosts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch (e) {
      // ignore failures (e.g., private mode)
      console.warn('Failed to save posts to localStorage', e);
    }
  }

  function loadPosts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load posts from localStorage', e);
      return null;
    }
  }

  // utilities
  function sanitizeString(val, fallback = '') {
    if (val === null || val === undefined) return fallback;
    return String(val);
  }

  // HTML-escape to avoid injection in inserted HTML
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // pointer parallax for decorative background items (#bg .bg-item)
  function setupPointerParallax() {
    const bg = document.getElementById('bg');
    if (!bg) return;
    const items = Array.from(bg.querySelectorAll('.bg-item'));
    if (!items.length) return;

    // don't run heavy pointer effects on touch devices or reduced-motion
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      return;
    }

    let lastX = 0, lastY = 0;
    window.addEventListener('pointermove', (e) => {
      const w = window.innerWidth, h = window.innerHeight;
      // normalized -1..1
      const nx = (e.clientX / w) * 2 - 1;
      const ny = (e.clientY / h) * 2 - 1;

      // apply small transform per item based on index
      items.forEach((it, idx) => {
        const depth = (idx % 3) * 6 + 6; // different depths
        const tx = nx * depth;
        const ty = ny * depth * -1;
        // smooth via small lerp
        lastX = lerp(lastX, tx, 0.12);
        lastY = lerp(lastY, ty, 0.12);
        it.style.transform = `translate3d(${lastX}px, ${lastY}px, 0) ${getComputedStyle(it).getPropertyValue('transform').includes('rotate') ? '' : ''}`;
      });
    });
  }

  // small linear interpolation helper
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Inject animation CSS into head to keep everything together (safe and small)
  function injectAnimationStyles() {
    if (document.getElementById('magisto-anim-styles')) return;
    const css = `
/* Magisto animation helpers (injected) */
@media (prefers-reduced-motion: reduce) {
  .anim-card, .latest-item, .pop-new, .thumb img, .card:hover { transition: none !important; animation: none !important; transform: none !important; }
}

/* entrance (fade + slide up) */
.anim-card {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 420ms cubic-bezier(.2,.9,.3,1), transform 420ms cubic-bezier(.2,.9,.3,1);
  will-change: opacity, transform;
}
.anim-card.visible {
  opacity: 1;
  transform: translateY(0);
}

/* pop for newly added */
.pop-new {
  animation: popIn 520ms cubic-bezier(.2,.9,.3,1);
}
@keyframes popIn {
  0% { transform: scale(.96); opacity: 0 }
  60% { transform: scale(1.03); opacity: 1 }
  100% { transform: scale(1); opacity: 1 }
}

/* thumbnail hover microinteraction */
.thumb img {
  transition: transform 420ms cubic-bezier(.2,.9,.3,1), filter 320ms;
  will-change: transform, filter;
}
.card:hover .thumb img,
.card:focus-within .thumb img {
  transform: scale(1.06);
  filter: saturate(1.05) contrast(1.02);
}

/* card hover lift */
.card {
  transition: transform 280ms cubic-bezier(.2,.9,.3,1), box-shadow 280ms;
}
.card:hover, .card:focus-within {
  transform: translateY(-6px);
  box-shadow: 0 12px 30px rgba(2,6,23,0.45);
}

/* latest uploads staggered reveal */
.latest-item {
  opacity: 0;
  transform: translateX(-8px);
  transition: opacity 380ms ease, transform 380ms ease;
}
.latest-item.visible {
  opacity: 1;
  transform: translateX(0);
}

/* subtle shimmer for duration badge (keeps low-key) */
.duration {
  transition: background-color 300ms, color 300ms;
  background: rgba(0,0,0,0.55);
  border-radius: 6px;
  padding: 3px 6px;
}

/* minimal focus outline for keyboard users */
.card:focus-within {
  outline: 2px solid rgba(6,182,212,0.12);
  outline-offset: 4px;
}

/* small responsiveness when cards appear in a column */
@media (max-width:900px) {
  .anim-card { transition-duration: 360ms; }
  .thumb img { transition-duration: 300ms; }
}
`;
    const style = document.createElement('style');
    style.id = 'magisto-anim-styles';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // Expose a small API for future use
  window.MagistoFeed = {
    addPost: window.addPost,
    getPosts: () => posts.slice(),
    clearPosts: () => { posts = []; savePosts(); renderFeed(); }
  };

})();