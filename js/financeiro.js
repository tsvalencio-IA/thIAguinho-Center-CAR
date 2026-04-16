/**
 * JARVIS ERP — financeiro.js
 * Gestão Financeira, DRE, Fluxo de Caixa e Visão de Comissões da Equipe
 */
'use strict';

window.renderFinanceiro = function() {
  const tb = document.getElementById('tbFinanceiro'); if(!tb) return;
  const filtroTipo = _v('filtroFinTipo');
  const filtroStatus = _v('filtroFinStatus');
  // 🔴 O erro estava AQUI: $v ao invés de _v. Corrigido!
  const filtroMes = _v('filtroFinMes'); 

  let list = J.financeiro || [];

  if (filtroTipo) list = list.filter(x => x.tipo === filtroTipo);
  if (filtroStatus) list = list.filter(x => (window.STATUS_LEGADO && window.STATUS_LEGADO[x.status] ? window.STATUS_LEGADO[x.status] : x.status) === filtroStatus);
  if (filtroMes) list = list.filter(x => (x.venc||x.data||'').startsWith(filtroMes));

  list.sort((a,b) => new Date(b.venc||b.data||0) - new Date(a.venc||a.data||0));

  let dreEnt = 0, dreSai = 0;
  list.forEach(f => {
    if (f.status === 'Pago' || f.status === 'Liquidado') {
      if (f.tipo === 'Entrada') dreEnt += parseFloat(f.valor||0);
      if (f.tipo === 'Saída') dreSai += parseFloat(f.valor||0);
    }
  });
  const dreSal = dreEnt - dreSai;

  _st('dreEntradas', window.moeda ? moeda(dreEnt) : dreEnt);
  _st('dreSaidas', window.moeda ? moeda(dreSai) : dreSai);
  _st('dreSaldo', window.moeda ? moeda(dreSal) : dreSal);

  const elSaldo = document.getElementById('dreSaldo');
  if(elSaldo) elSaldo.style.color = dreSal >= 0 ? 'var(--success)' : 'var(--danger)';

  if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty">Nenhum lançamento encontrado.</td></tr>'; return; }

  tb.innerHTML = list.map(f => {
    const isEntrada = f.tipo === 'Entrada';
    const isPago = f.status === 'Pago' || f.status === 'Liquidado';
    const corValor = isEntrada ? 'var(--success)' : 'var(--danger)';
    const badgeStatus = isPago ? '<span class="badge badge-success">PAGO</span>' : '<span class="badge badge-warn">PENDENTE</span>';
    
    return `<tr>
      <td class="font-mono">${window.dtBr ? dtBr(f.venc||f.data) : (f.venc||f.data||'—')}</td>
      <td><span class="badge ${isEntrada?'badge-brand':'badge-neutral'}">${f.tipo}</span></td>
      <td><div style="font-family:var(--fd);font-weight:700">${f.desc||'—'}</div></td>
      <td>${f.pgto||'—'}</td>
      <td class="font-mono" style="color:${corValor};font-weight:700">${window.moeda ? moeda(f.valor) : f.valor}</td>
      <td>${badgeStatus}</td>
      <td><button class="btn btn-outline btn-sm" onclick="prepFin('edit','${f.id}');abrirModal('modalFin')">Detalhes</button></td>
    </tr>`;
  }).join('');
};

window.prepFin = function(mode, id=null) {
  const campos = ['finId','finTipo','finStatus','finDesc','finValor','finPgto','finData'];
  campos.forEach(f => window._sv && _sv(f,''));
  
  if (mode === 'edit' && id) {
    const f = J.financeiro.find(x => x.id === id); if(!f) return;
    _sv('finId', f.id); _sv('finTipo', f.tipo||'Entrada'); _sv('finStatus', f.status||'Pendente');
    _sv('finDesc', f.desc||''); _sv('finValor', f.valor||''); _sv('finPgto', f.pgto||'');
    _sv('finData', f.venc||f.data||'');
  } else {
    _sv('finTipo', 'Entrada'); _sv('finStatus', 'Pago');
    _sv('finData', new Date().toISOString().split('T')[0]);
  }
};

window.salvarFin = async function() {
  const id = _v('finId');
  const desc = _v('finDesc');
  const valor = parseFloat(_v('finValor')||0);
  
  if(!desc || isNaN(valor) || valor <= 0) { window.toastWarn && toastWarn('Descrição e Valor são obrigatórios'); return; }

  const payload = {
    tenantId: J.tid, tipo: _v('finTipo'), status: _v('finStatus'),
    desc: desc, valor: valor, pgto: _v('finPgto'), venc: _v('finData'),
    updatedAt: new Date().toISOString()
  };

  try {
    const btn = document.querySelector('#modalFin .btn-brand');
    if(btn){ btn.disabled=true; btn.innerText='Salvando...'; }

    if(id){
      await J.db.collection('financeiro').doc(id).update(payload);
      window.toastOk && toastOk('Lançamento atualizado!');
      window.audit && audit('FINANCEIRO', `Editou Lançamento: ${desc}`);
    } else {
      payload.createdAt = new Date().toISOString();
      await J.db.collection('financeiro').add(payload);
      window.toastOk && toastOk('Novo lançamento registrado!');
      window.audit && audit('FINANCEIRO', `Criou Lançamento: ${desc}`);
    }
    window.fecharModal && fecharModal('modalFin');
  } catch(e) {
    window.toastErr && toastErr('Erro: ' + e.message);
  } finally {
    const btn = document.querySelector('#modalFin .btn-brand');
    if(btn){ btn.disabled=false; btn.innerText='SALVAR MOVIMENTO'; }
  }
};

window.renderComissoes = function(list) {
  const box = document.getElementById('boxComissoes'); if(!box) return;
  if (!list || !list.length) { box.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:.85rem;text-align:center">Nenhuma comissão pendente.</div>'; return; }
  
  let total = 0;
  const itens = list.map(c => {
    total += parseFloat(c.valor||0);
    return `<div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05)">
      <div>
        <div style="font-family:var(--fd);font-weight:700;font-size:.85rem">${c.desc||'Comissão'}</div>
        <div style="font-family:var(--fm);font-size:.65rem;color:var(--text-muted)">OS Vinculada: ${c.osId||c.desc?.split('OS ')[1]?.split(' ')[0]||'—'} | ${window.dtBr?dtBr(c.venc||c.data):(c.venc||c.data)}</div>
      </div>
      <div style="font-family:var(--fm);font-weight:700;color:var(--success)">${window.moeda?moeda(c.valor):c.valor}</div>
    </div>`;
  }).join('');
  
  box.innerHTML = itens + `<div style="padding:16px;background:rgba(34,211,160,.1);text-align:right">
    <span style="font-size:.7rem;color:var(--text-muted)">TOTAL A RECEBER:</span>
    <span style="font-family:var(--fd);font-size:1.2rem;font-weight:700;color:var(--success);margin-left:8px">${window.moeda?moeda(total):total}</span>
  </div>`;
};
