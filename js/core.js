/**
 * JARVIS ERP — core.js
 * Estado global, RBAC, listeners Firestore em tempo real, utilitários
 *
 * Powered by thIAguinho Soluções Digitais
 */
'use strict';

// ── NAMESPACE GLOBAL ───────────────────────────────────────
window.J = {
  // SESSÃO
  tid:         sessionStorage.getItem('j_tid')          || null,
  role:        sessionStorage.getItem('j_role')         || null,
  nome:        sessionStorage.getItem('j_nome')         || 'Usuário',
  tnome:       sessionStorage.getItem('j_tnome')        || 'Oficina',
  fid:         sessionStorage.getItem('j_fid')          || null,
  gemini:      sessionStorage.getItem('j_gemini')       || null,
  nicho:       sessionStorage.getItem('j_nicho')        || 'carros',
  cloudName:   sessionStorage.getItem('j_cloud_name')   || 'dmuvm1o6m',
  cloudPreset: sessionStorage.getItem('j_cloud_preset') || 'evolution',
  brand:       JSON.parse(sessionStorage.getItem('j_brand') || '{}'),

  // ESTADO FIREBASE (RESTAURADO - O MOTOR DO SISTEMA)
  db:          null,
  oficina:     null,
  clientes:    [],
  veiculos:    [],
  os:          [],
  estoque:     [],
  financeiro:  [],
  equipe:      [],
  config:      {},
  auditoria:   [],

  // RBAC — CONTROLE DE ACESSO
  pode: {
    admin:     () => J.role === 'admin' || J.role === 'superadmin',
    gestor:    () => ['admin','gestor','superadmin'].includes(J.role),
    financeiro:() => ['admin','superadmin'].includes(J.role),
    os:        () => ['admin','gestor','atendente','mecanico','superadmin'].includes(J.role),
    // IA Liberada para todos através do chat nativo
    acessarIA: (r) => ['superadmin','admin','gestor','mecanico'].includes(r || J.role)
  }
};

// ── INICIALIZAÇÃO DO ECOSSISTEMA ───────────────────────────
window.onload = async function() {
  if (typeof window.initFirebase !== 'function') return;
  J.db = window.initFirebase();
  
  if (window.location.pathname.includes('superadmin.html')) {
    if (J.role !== 'superadmin') window.location.replace('index.html');
    return;
  }

  if (!J.tid && !window.location.pathname.includes('cliente.html')) {
    window.location.replace('index.html');
    return;
  }

  if (J.tid) escutarSistema();
};

function escutarSistema() {
  J.db.collection('oficinas').doc(J.tid).onSnapshot(doc => {
    if (doc.exists) {
      J.oficina = doc.data();
      const novaChave = J.oficina.gemini || J.oficina.apiKeys?.gemini;
      if (novaChave && novaChave !== J.gemini) {
        J.gemini = novaChave;
        sessionStorage.setItem('j_gemini', novaChave);
      }
    }
  });

  J.db.collection('clientes').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.clientes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderClientes) window.renderClientes();
  });

  J.db.collection('veiculos').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.veiculos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderVeiculos) window.renderVeiculos();
  });

  J.db.collection('ordens_servico').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.os = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderKanban) window.renderKanban();
    if (window.renderOS) window.renderOS();
  });

  J.db.collection('financeiro').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.financeiro = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderFinanceiro) window.renderFinanceiro();
  });

  J.db.collection('funcionarios').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.equipe = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderEquipe) window.renderEquipe();
  });

  J.db.collection('auditoria').where('tenantId', '==', J.tid).orderBy('ts', 'desc').limit(50).onSnapshot(snap => {
    J.auditoria = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (window.renderAuditoria) window.renderAuditoria();
  });
}

// ── UTILITÁRIOS GLOBAIS ──────────────────────────────────
window.moeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

window.dtBr = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

window.dtHrBr = d => d ? new Date(d).toLocaleString('pt-BR') : '—';

window.$ = id => document.getElementById(id);

window.$v = id => {
  const el = $(id);
  return el ? el.value.trim() : '';
};

window._sh = (id, html) => {
  const el = $(id);
  if (el) el.innerHTML = html;
};

window.formatarCPF = function(cpf) {
  const c = String(cpf || '').replace(/[^\d]/g, '');
  if (c.length !== 11) return cpf || '';
  return c.substring(0,3) + '.' + c.substring(3,6) + '.' + c.substring(6,9) + '-' + c.substring(9,11);
};

window.formatarCNPJ = function(cnpj) {
  const c = String(cnpj || '').replace(/[^\d]/g, '');
  if (c.length !== 14) return cnpj || '';
  return c.substring(0,2)+'.'+c.substring(2,5)+'.'+c.substring(5,8)+'/'+c.substring(8,12)+'-'+c.substring(12,14);
};

window.validarPlaca = function(placa) {
  if (!placa) return false;
  const p = String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p.length !== 7) return false;
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);
};
