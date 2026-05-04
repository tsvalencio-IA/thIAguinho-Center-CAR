/**
 * thIAguinho ERP — TEMA CLARO/ESCURO GLOBAL
 *
 * Persiste em localStorage. Aplica ANTES da renderização para
 * evitar flash de tema errado. Funciona em login, superadmin,
 * jarvis, equipe, cliente, clienteOficial, selecionar-perfil.
 *
 * Powered by thIAguinho Soluções Digitais
 */
(function() {
  'use strict';

  const KEY = 'thiaguinho_theme';
  const valid = ['dark', 'light'];

  // ─── Aplicação imediata (executa ANTES do <body>) ────────────
  function getStored() {
    try {
      const v = localStorage.getItem(KEY);
      return valid.includes(v) ? v : null;
    } catch (e) { return null; }
  }

  function getSystemPref() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }

  function apply(theme, withTransition) {
    if (!valid.includes(theme)) theme = 'dark';
    const html = document.documentElement;
    if (withTransition) {
      html.classList.add('theme-transition');
      setTimeout(() => html.classList.remove('theme-transition'), 350);
    }
    html.setAttribute('data-theme', theme);
    // Atualiza meta theme-color para PWA / barra de status do celular
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'light' ? '#F8FAFC' : '#080C14';
  }

  function getCurrent() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function set(theme) {
    if (!valid.includes(theme)) return;
    apply(theme, true);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  function toggle() {
    set(getCurrent() === 'dark' ? 'light' : 'dark');
  }

  // Aplicação inicial — usa preferência salva, ou do sistema, ou dark
  apply(getStored() || getSystemPref(), false);

  // API global
  window.thiTheme = {
    get: getCurrent,
    set: set,
    toggle: toggle
  };

  // ─── Botão de toggle automático ──────────────────────────────
  // Qualquer elemento com data-theme-toggle vira um toggle.
  // Se nenhum existir, injeta um no header se houver.
  function wireToggleButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.classList.add('theme-toggle');
      btn.title = 'Alternar tema claro/escuro';
      btn.setAttribute('aria-label', 'Alternar tema');
      if (!btn.innerHTML.trim()) {
        btn.innerHTML = '<span class="icon-moon">🌙</span><span class="icon-sun">☀️</span>';
      }
      btn.addEventListener('click', e => { e.preventDefault(); toggle(); });
    });
  }

  // Auto-injeta toggle no header da topbar / brand-bar quando existir
  function autoInject() {
    if (document.querySelector('[data-theme-toggle]')) {
      wireToggleButtons();
      return;
    }
    // Pontos preferenciais (em ordem) onde o toggle pode ser injetado
    const targets = [
      '.topbar .topbar-actions',
      '.topbar .topbar-right',
      '.topbar',
      '.brand-bar .brand-actions',
      '.brand-bar',
      '.gov-header',
      '.cliente-header',
      'header.app-header',
      'header'
    ];
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (el) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-theme-toggle', '1');
        btn.style.marginLeft = '8px';
        // Insere antes do último filho se for grupo de ações, senão adiciona
        if (sel.includes('actions') || sel.includes('right')) {
          el.appendChild(btn);
        } else {
          el.insertBefore(btn, el.firstChild?.nextSibling || null);
          btn.style.position = 'absolute';
          btn.style.top = '12px';
          btn.style.right = '64px';
          btn.style.zIndex = '50';
          if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        }
        wireToggleButtons();
        return;
      }
    }
    // Fallback: botão flutuante canto superior direito
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.setAttribute('data-theme-toggle', '1');
    fab.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9999;';
    document.body.appendChild(fab);
    wireToggleButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInject);
  } else {
    autoInject();
  }

  // Observer para reagir a novos botões dinâmicos
  if (typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver(() => wireToggleButtons());
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }
})();

/* Powered by thIAguinho Soluções Digitais */
