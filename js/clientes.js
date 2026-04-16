/**
 * JARVIS ERP — clientes.js
 * CRM Clientes, Veículos, Estoque, Equipe, Fornecedores, Agenda
 */
'use strict';

// ── CLIENTES ───────────────────────────────────────────────
window.renderClientes = function() {
  const tb = document.getElementById('tbClientes'); if (!tb) return;
  if (!J.clientes.length) { tb.innerHTML = tableEmpty(5,'👥','Nenhum cliente cadastrado'); return; }
  tb.innerHTML = J.clientes.map(c => {
    const nVeics = J.veiculos.filter(v => v.clienteId === c.id).length;
    const totalOS = J.os.filter(o => o.clienteId===c.id && ['Pronto','Entregue'].includes(o.status))
                       .reduce((a,o)=>a+(o.total||0), 0);
    return `<tr>
      <td>
        <div style="font-weight:600">${c.nome}</div>
        <div style="font-family:var(--fm);font-size:0.65rem;color:var(--text-muted)">${c.doc||''}</div>
      </td>
      <td style="font-family:var(--fm);font-size:0.78rem">${c.wpp||'—'}</td>
      <td><span class="badge badge-brand">${nVeics}</span></td>
      <td style="font-family:var(--fm);font-size:0.78rem;color:var(--success)">${window.moeda?moeda(totalOS):totalOS}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="prepCliente('edit','${c.id}');abrirModal('modalCliente')" style="margin-right:4px">✏</button>
        ${c.wpp?`<button class="btn btn-success btn-sm" onclick="abrirWpp('${c.wpp}','Olá ${c.nome}! Aqui é a ${J.tnome}.')" title="WhatsApp" style="margin-right:4px">💬</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deletarCliente('${c.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
};

window.prepCliente = function(mode='add', id=null) {
  ['cliId','cliNome','cliWpp','cliDoc','cliEmail','cliLogin','cliPin','cliCep','cliRua','cliNum','cliBairro','cliCidade']
    .forEach(f => _sv(f,''));
  
  if (mode === 'add') {
    _sv('cliPin', window.randId ? randId(6).toUpperCase() : Math.random().toString(36).slice(-6).toUpperCase());
  }

  if (mode==='edit' && id) {
    const c = J.clientes.find(x=>x.id===id); if (!c) return;
    _sv('cliId', c.id); _sv('cliNome', c.nome||''); _sv('cliWpp', c.wpp||'');
    _sv('cliDoc', c.doc||''); _sv('cliEmail', c.email||'');
    _sv('cliLogin', c.login||''); _sv('cliPin', c.pin||'');
    _sv('cliCep', c.cep||''); _sv('cliRua', c.rua||'');
    _sv('cliNum', c.num||''); _sv('cliBairro', c.bairro||'');
    _sv('cliCidade', c.cidade||'');
  }
};

window.salvarCliente = async function() {
  const nome = _v('cliNome');
  if (!nome) { window.toastWarn && toastWarn('⚠ Nome é obrigatório'); return; }

  const doc  = _v('cliDoc');
  const wpp  = _v('cliWpp');
  const email= _v('cliEmail');
  const id   = _v('cliId');
  if (doc) {
    const dup = J.clientes.find(c => c.doc===doc && c.id!==id);
    if (dup) { window.toastWarn && toastWarn(`⚠ CPF já cadastrado para: ${dup.nome}`); return; }
  }

  // CORREÇÃO (BUG 1): Garantir que Login e Senha (PIN) do cliente sejam SEMPRE salvos,
  // criando defaults seguros caso a oficina não os digite.
  let loginDefinitivo = _v('cliLogin');
  let pinDefinitivo   = _v('cliPin');

  if (!loginDefinitivo) {
    loginDefinitivo = email || doc || wpp || (nome.split(' ')[0].toLowerCase() + Math.floor(Math.random()*10000));
  }
  if (!pinDefinitivo) {
    pinDefinitivo = window.randId ? randId(6).toUpperCase() : Math.random().toString(36).slice(-6).toUpperCase();
  }

  _sv('cliLogin', loginDefinitivo);
  _sv('cliPin', pinDefinitivo);

  const p = {
    tenantId: J.tid, nome, wpp, doc, email: email,
    login: loginDefinitivo, pin: pinDefinitivo,
    cep: _v('cliCep'), rua: _v('cliRua'), num: _v('cliNum'),
    bairro: _v('cliBairro'), cidade: _v('cliCidade'),
    updatedAt: new Date().toISOString()
  };

  if (id) await J.db.collection('clientes').doc(id).update(p);
  else { p.createdAt = new Date().toISOString(); await J.db.collection('clientes').add(p); }

  window.toastOk && toastOk('✓ Cliente salvo!');
  window.fecharModal && fecharModal('modalCliente');
  window.audit && audit('CLIENTES', `Salvou cliente ${nome}`);
};

window.deletarCliente = async function(id) {
  const ok = await confirmar('Deletar este cliente? Veículos vinculados serão mantidos.', 'Atenção');
  if (!ok) return;
  await J.db.collection('clientes').doc(id).delete();
  window.toastOk && toastOk('✓ Cliente removido');
  window.audit && audit('CLIENTES', `Deletou cliente ${id}`);
};

// ── VEÍCULOS ───────────────────────────────────────────────
window.renderVeiculos = function() {
  const tb = document.getElementById('tbVeiculos'); if (!tb) return;
  if (!J.veiculos.length) { tb.innerHTML = tableEmpty(6,'🚗','Nenhum veículo cadastrado'); return; }
  tb.innerHTML = J.veiculos.map(v => {
    const c = J.clientes.find(x => x.id === v.clienteId);
    return `<tr>
      <td><span class="placa">${v.placa||'—'}</span></td>
      <td>${window.badgeTipo?badgeTipo(v.tipo||'carro'):v.tipo}</td>
      <td>
        <div style="font-weight:600">${v.modelo||'—'}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${v.ano||''} ${v.cor?'· '+v.cor:''}</div>
      </td>
      <td>${c?.nome||'—'}</td>
      <td style="font-family:var(--fm);font-size:0.78rem">${v.km ? Number(v.km).toLocaleString('pt-BR')+' km' : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="prepVeiculo('edit','${v.id}');abrirModal('modalVeiculo')" style="margin-right:4px">✏</button>
        <button class="btn btn-danger btn-sm" onclick="deletarVeiculo('${v.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
};

window.prepVeiculo = function(mode='add', id=null) {
  ['veicId','veicPlaca','veicModelo','veicAno','veicCor','veicKm','veicObs'].forEach(f=>_sv(f,''));
  _sv('veicTipo','carro');
  window.popularSelects && popularSelects();
  if (mode==='edit' && id) {
    const v = J.veiculos.find(x=>x.id===id); if (!v) return;
    _sv('veicId',v.id); _sv('veicTipo',v.tipo||'carro');
    _sv('veicDono',v.clienteId||''); _sv('veicPlaca',v.placa||'');
    _sv('veicModelo',v.modelo||''); _sv('veicAno',v.ano||'');
    _sv('veicCor',v.cor||''); _sv('veicKm',v.km||''); _sv('veicObs',v.obs||'');
  }
};

window.salvarVeiculo = async function() {
  if (!_v('veicPlaca')||!_v('veicModelo')) { window.toastWarn && toastWarn('⚠ Placa e modelo são obrigatórios'); return; }
  const p = {
    tenantId:J.tid, tipo:_v('veicTipo'), clienteId:_v('veicDono'),
    placa:_v('veicPlaca').toUpperCase().replace(/[\s-]/g,''),
    modelo:_v('veicModelo'), ano:_v('veicAno'), cor:_v('veicCor'),
    km:_v('veicKm'), obs:_v('veicObs'), updatedAt:new Date().toISOString()
  };
  const id=_v('veicId');
  if(id) await J.db.collection('veiculos').doc(id).update(p);
  else { p.createdAt=new Date().toISOString(); await J.db.collection('veiculos').add(p); }
  window.toastOk && toastOk('✓ Veículo salvo!'); window.fecharModal && fecharModal('modalVeiculo');
  window.audit && audit('VEÍCULOS',`Salvou ${p.placa}`);
};

window.deletarVeiculo = async function(id) {
  const ok = await confirmar('Deletar este veículo?'); if (!ok) return;
  await J.db.collection('veiculos').doc(id).delete();
  window.toastOk && toastOk('✓ Veículo removido');
};

// ── ESTOQUE ────────────────────────────────────────────────
window.renderEstoque = function() {
  const tb = document.getElementById('tbEstoque'); if (!tb) return;
  if (!J.estoque.length) { tb.innerHTML = tableEmpty(8,'📦','Nenhum item no estoque'); return; }
  tb.innerHTML = J.estoque.map(p => {
    const crit  = (p.qtd||0) <= (p.min||0);
    const marg  = p.custo>0 ? (((p.venda-p.custo)/p.custo)*100).toFixed(0) : 0;
    return `<tr class="${crit?'row-critical':''}">
      <td style="font-family:var(--fm);font-size:0.7rem;color:var(--text-muted)">${p.codigo||'—'}</td>
      <td>
        <div style="font-weight:600">${p.desc}</div>
        <div style="font-size:0.65rem;color:var(--text-muted)">${p.und||'UN'}</div>
      </td>
      <td style="font-family:var(--fm)">${window.moeda?moeda(p.custo):p.custo}</td>
      <td style="font-family:var(--fm);color:var(--success)">${window.moeda?moeda(p.venda):p.venda}</td>
      <td style="font-family:var(--fm);font-size:0.72rem;color:${parseFloat(marg)>=20?'var(--success)':parseFloat(marg)>=0?'var(--warn)':'var(--danger)'}">${marg}%</td>
      <td style="font-family:var(--fm);font-weight:700;color:${crit?'var(--danger)':'var(--text)'}">${p.qtd||0}</td>
      <td style="font-family:var(--fm);color:var(--text-muted)">${p.min||0}</td>
      <td>${crit?'<span class="badge badge-danger">CRÍTICO</span>':'<span class="badge badge-success">OK</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="prepPeca('edit','${p.id}');abrirModal('modalPeca')" style="margin-right:4px">✏</button>
        <button class="btn btn-danger btn-sm" onclick="deletarPeca('${p.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
};

window.prepPeca = function(mode='add', id=null) {
  ['pecaId','pecaCodigo','pecaDesc','pecaCusto','pecaVenda','pecaQtd','pecaMin'].forEach(f=>_sv(f,''));
  _sv('pecaUnd','UN'); _st('pecaMargem','—');
  if (mode==='edit' && id) {
    const p=J.estoque.find(x=>x.id===id); if(!p) return;
    _sv('pecaId',p.id); _sv('pecaCodigo',p.codigo||''); _sv('pecaDesc',p.desc||'');
    _sv('pecaCusto',p.custo||0); _sv('pecaVenda',p.venda||0);
    _sv('pecaQtd',p.qtd||0); _sv('pecaMin',p.min||0); _sv('pecaUnd',p.und||'UN');
    calcMargem();
  }
};

window.calcMargem = function() {
  const c=parseFloat(_v('pecaCusto')||0), v=parseFloat(_v('pecaVenda')||0);
  const el=document.getElementById('pecaMargem'); if (!el) return;
  if(c>0&&v>0){ const m=((v-c)/c*100).toFixed(1); el.textContent=`${m}% margem`; el.style.color=parseFloat(m)>=0?'var(--success)':'var(--danger)'; }
  else { el.textContent='—'; el.style.color='var(--text-muted)'; }
};

window.salvarPeca = async function() {
  if (!_v('pecaDesc')) { window.toastWarn && toastWarn('⚠ Descrição é obrigatória'); return; }
  const p = {
    tenantId:J.tid, codigo:_v('pecaCodigo'), desc:_v('pecaDesc'),
    custo:parseFloat(_v('pecaCusto')||0), venda:parseFloat(_v('pecaVenda')||0),
    qtd:parseInt(_v('pecaQtd')||0), min:parseInt(_v('pecaMin')||0),
    und:_v('pecaUnd'), updatedAt:new Date().toISOString()
  };
  const id=_v('pecaId');
  if(id) await J.db.collection('estoqueItems').doc(id).update(p);
  else { p.createdAt=new Date().toISOString(); await J.db.collection('estoqueItems').add(p); }
  window.toastOk && toastOk('✓ Peça salva!'); window.fecharModal && fecharModal('modalPeca');
  window.audit && audit('ESTOQUE',`Salvou ${p.desc}`);
};

window.deletarPeca = async function(id) {
  const ok=await confirmar('Deletar esta peça do estoque?'); if(!ok) return;
  await J.db.collection('estoqueItems').doc(id).delete();
  window.toastOk && toastOk('✓ Peça removida');
};

// ── EQUIPE ─────────────────────────────────────────────────
window.renderEquipe = function() {
  const tb=document.getElementById('tbEquipe'); if (!tb) return;
  if (!J.equipe.length) { tb.innerHTML=tableEmpty(5,'👷','Nenhum colaborador cadastrado'); return; }
  tb.innerHTML = J.equipe.map(f => `<tr>
    <td>
      <div style="font-weight:600">${f.nome}</div>
      <div style="font-family:var(--fm);font-size:0.65rem;color:var(--text-muted)">${f.wpp||''}</div>
    </td>
    <td><span class="badge badge-brand">${window.JARVIS_CONST && JARVIS_CONST.CARGOS[f.cargo]?JARVIS_CONST.CARGOS[f.cargo]:(f.cargo||'—')}</span></td>
    <td style="font-family:var(--fm);font-size:0.72rem">${f.usuario||'—'}</td>
    <td>
      <span style="font-family:var(--fm);font-size:0.75rem;color:var(--success)">
        MO: ${f.comissaoServico||f.comissao||0}%<br>Peça: ${f.comissaoPeca||0}%
      </span>
    </td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" onclick="prepFunc('edit','${f.id}');abrirModal('modalFunc')" style="margin-right:4px">✏</button>
      <button class="btn btn-danger btn-sm" onclick="deletarFunc('${f.id}')">🗑</button>
    </td>
  </tr>`).join('');
};

window.prepFunc = function(mode='add', id=null) {
  ['funcId','funcNome','funcWpp','funcComissaoServico','funcComissaoPeca','funcUser','funcPass'].forEach(f=>_sv(f,''));
  _sv('funcCargo','mecanico');
  if (mode==='edit' && id) {
    const f=J.equipe.find(x=>x.id===id); if(!f) return;
    _sv('funcId',f.id); _sv('funcNome',f.nome||''); _sv('funcWpp',f.wpp||'');
    _sv('funcCargo',f.cargo||'mecanico');
    _sv('funcComissaoServico',f.comissaoServico||f.comissao||0);
    _sv('funcComissaoPeca',f.comissaoPeca||0);
    _sv('funcUser',f.usuario||''); _sv('funcPass',f.senha||'');
  }
};

window.salvarFunc = async function() {
  if (!_v('funcNome')||!_v('funcUser')||!_v('funcPass')) { window.toastWarn && toastWarn('⚠ Nome, usuário e senha são obrigatórios'); return; }
  const p = {
    tenantId:J.tid, nome:_v('funcNome'), wpp:_v('funcWpp'), cargo:_v('funcCargo'),
    comissaoServico:parseFloat(_v('funcComissaoServico')||0),
    comissaoPeca:parseFloat(_v('funcComissaoPeca')||0),
    usuario:_v('funcUser'), senha:_v('funcPass'),
    updatedAt:new Date().toISOString()
  };
  const id=_v('funcId');
  if(id) await J.db.collection('funcionarios').doc(id).update(p);
  else { p.createdAt=new Date().toISOString(); await J.db.collection('funcionarios').add(p); }
  window.toastOk && toastOk('✓ Colaborador salvo!'); window.fecharModal && fecharModal('modalFunc');
  window.audit && audit('EQUIPE',`Salvou ${p.nome}`);
};

window.deletarFunc = async function(id) {
  const ok=await confirmar('Remover este colaborador? O acesso será revogado.','Atenção'); if(!ok) return;
  await J.db.collection('funcionarios').doc(id).delete();
  window.toastOk && toastOk('✓ Colaborador removido');
  window.audit && audit('EQUIPE',`Removeu colaborador ${id}`);
};

// ── COMISSÕES ──────────────────────────────────────────────
window.calcComissoes = function() {
  const box = document.getElementById('boxComissoes'); if (!box) return;
  const comissoes = {};
  J.equipe.forEach(f => { comissoes[f.id]={nome:f.nome,val:0}; });
  J.financeiro.filter(f=>f.isComissao&&f.mecId&&f.status==='Pendente').forEach(f=>{
    if (comissoes[f.mecId]) comissoes[f.mecId].val += f.valor||0;
  });
  const lista = Object.values(comissoes).filter(c=>c.val>0);
  box.innerHTML = lista.length ? lista.map(c=>`
    <div class="com-card">
      <div><div class="com-nome">${c.nome}</div><div style="font-family:var(--fm);font-size:0.6rem;color:var(--text-muted)">A PAGAR</div></div>
      <div class="com-val">${window.moeda?moeda(c.val):c.val}</div>
    </div>`).join('') : '<div style="text-align:center;color:var(--text-muted);padding:24px;font-family:var(--fm);font-size:0.75rem">Sem comissões pendentes</div>';
};

// ── FORNECEDORES ───────────────────────────────────────────
window.renderFornecedores = function() {
  const tb=document.getElementById('tbFornec'); if(!tb) return;
  if(!J.fornecedores.length){tb.innerHTML=tableEmpty(4,'🏭','Nenhum fornecedor');return;}
  tb.innerHTML=J.fornecedores.map(f=>`<tr>
    <td><div style="font-weight:600">${f.nome}</div></td>
    <td style="font-size:0.78rem;color:var(--text-secondary)">${f.segmento||'—'}</td>
    <td style="font-family:var(--fm);font-size:0.78rem">${f.wpp||'—'}</td>
    <td style="white-space:nowrap">
      ${f.wpp?`<button class="btn btn-success btn-sm" onclick="abrirWpp('${f.wpp}','')" style="margin-right:4px">💬</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="prepFornec('edit','${f.id}');abrirModal('modalFornec')" style="margin-right:4px">✏</button>
      <button class="btn btn-danger btn-sm" onclick="deletarFornec('${f.id}')">🗑</button>
    </td>
  </tr>`).join('');
};

window.prepFornec = function(mode='add', id=null) {
  ['fornecId','fornecNome','fornecSeg','fornecWpp','fornecEmail'].forEach(f=>_sv(f,''));
  if (mode==='edit'&&id) {
    const f=J.fornecedores.find(x=>x.id===id); if(!f) return;
    _sv('fornecId',f.id); _sv('fornecNome',f.nome||''); _sv('fornecSeg',f.segmento||'');
    _sv('fornecWpp',f.wpp||''); _sv('fornecEmail',f.email||'');
  }
};

window.salvarFornec = async function() {
  if (!_v('fornecNome')) { window.toastWarn && toastWarn('⚠ Nome é obrigatório'); return; }
  const p={tenantId:J.tid,nome:_v('fornecNome'),segmento:_v('fornecSeg'),wpp:_v('fornecWpp'),email:_v('fornecEmail'),updatedAt:new Date().toISOString()};
  const id=_v('fornecId');
  if(id) await J.db.collection('fornecedores').doc(id).update(p);
  else { p.createdAt=new Date().toISOString(); await J.db.collection('fornecedores').add(p); }
  window.toastOk && toastOk('✓ Fornecedor salvo!'); window.fecharModal && fecharModal('modalFornec');
};

window.deletarFornec = async function(id) {
  const ok=await confirmar('Deletar este fornecedor?'); if(!ok) return;
  await J.db.collection('fornecedores').doc(id).delete();
  window.toastOk && toastOk('✓ Fornecedor removido');
};

// ── AGENDA ─────────────────────────────────────────────────
window.renderAgenda = function() {
  const tb=document.getElementById('tbAgenda'); if(!tb) return;
  const lista=[...J.agendamentos].sort((a,b)=>a.data>b.data?1:-1);
  if(!lista.length){tb.innerHTML=tableEmpty(7,'📅','Nenhum agendamento');return;}
  const hoje=new Date().toISOString().split('T')[0];
  tb.innerHTML=lista.map(a=>{
    const c=J.clientes.find(x=>x.id===a.clienteId);
    const v=J.veiculos.find(x=>x.id===a.veiculoId);
    const m=J.equipe.find(x=>x.id===a.mecId);
    const vencido=a.data<hoje&&a.status==='Agendado';
    return `<tr style="${vencido?'background:rgba(255,59,59,0.04);':''}">
      <td style="font-family:var(--fm)">${window.dtBr?dtBr(a.data):a.data} ${a.hora||''}</td>
      <td>${c?.nome||'—'}</td>
      <td><span class="placa">${v?.placa||'—'}</span></td>
      <td>${a.servico||'—'}</td>
      <td>${m?.nome||'—'}</td>
      <td>${vencido?'<span class="badge badge-danger">VENCIDO</span>':'<span class="badge badge-brand">AGENDADO</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="prepAgenda('edit','${a.id}');abrirModal('modalAgenda')" style="margin-right:4px">✏</button>
        <button class="btn btn-brand btn-sm" onclick="converterAgendaOS('${a.id}')" style="font-size:0.65rem;">→ O.S.</button>
      </td>
    </tr>`;
  }).join('');
};

window.prepAgenda = function(mode='add', id=null) {
  ['agdId','agdServico'].forEach(f=>_sv(f,''));
  _sv('agdData',new Date().toISOString().split('T')[0]); _sv('agdHora','09:00');
  window.popularSelects && popularSelects();
  if(mode==='edit'&&id){
    const a=J.agendamentos.find(x=>x.id===id); if(!a) return;
    _sv('agdId',a.id); _sv('agdCliente',a.clienteId||'');
    window.filtrarVeicsAgenda && filtrarVeicsAgenda();
    setTimeout(()=>_sv('agdVeiculo',a.veiculoId||''),80);
    _sv('agdData',a.data||''); _sv('agdHora',a.hora||'');
    _sv('agdServico',a.servico||''); _sv('agdMec',a.mecId||'');
  }
};

window.salvarAgenda = async function() {
  if (!_v('agdCliente')||!_v('agdData')) { window.toastWarn && toastWarn('⚠ Cliente e data são obrigatórios'); return; }
  const p={tenantId:J.tid,clienteId:_v('agdCliente'),veiculoId:_v('agdVeiculo'),data:_v('agdData'),hora:_v('agdHora'),servico:_v('agdServico'),mecId:_v('agdMec'),status:'Agendado',updatedAt:new Date().toISOString()};
  const id=_v('agdId');
  if(id) await J.db.collection('agendamentos').doc(id).update(p);
  else { p.createdAt=new Date().toISOString(); await J.db.collection('agendamentos').add(p); }
  window.toastOk && toastOk('✓ Agendamento salvo!'); window.fecharModal && fecharModal('modalAgenda');
  window.audit && audit('AGENDA',`Agendou ${p.servico||'serviço'}`);
};

window.converterAgendaOS = async function(agdId) {
  const a=J.agendamentos.find(x=>x.id===agdId); if(!a) return;
  await J.db.collection('agendamentos').doc(agdId).update({status:'Convertido',updatedAt:new Date().toISOString()});
  window.prepOS && prepOS('add');
  setTimeout(()=>{
    _sv('osCliente',a.clienteId||''); window.filtrarVeiculosOS && filtrarVeiculosOS();
    setTimeout(()=>_sv('osVeiculo',a.veiculoId||''),80);
    _sv('osDescricao',a.servico||''); _sv('osData',a.data||new Date().toISOString().split('T')[0]);
    window.abrirModal && abrirModal('modalOS');
  },80);
};

// ── AUDITORIA ──────────────────────────────────────────────
window.renderAuditoria = function() {
  const tb=document.getElementById('tbAuditoria'); if(!tb) return;
  if(!J.auditoria.length){tb.innerHTML=tableEmpty(4,'🔒','Sem registros de auditoria');return;}
  tb.innerHTML=J.auditoria.slice(0,200).map(a=>`<tr>
    <td style="font-family:var(--fm);font-size:0.7rem;color:var(--text-muted)">${window.dtHrBr?dtHrBr(a.ts):a.ts}</td>
    <td><span class="badge badge-brand">${a.modulo||'—'}</span></td>
    <td style="font-family:var(--fm);color:var(--brand)">${a.usuario||'—'}</td>
    <td>${a.acao||'—'}</td>
  </tr>`).join('');
};

// ── DASHBOARD ──────────────────────────────────────────────
const STATUS_LEGADO = {
  'Aguardando':'Triagem','patio':'Triagem','box':'Andamento',
  'aprovacao':'Orcamento_Enviado','faturado':'Pronto','cancelado':'Cancelado',
  'concluido':'Entregue','Concluido':'Entregue',
  'Triagem':'Triagem','Orcamento':'Orcamento','Orcamento_Enviado':'Orcamento_Enviado',
  'Aprovado':'Aprovado','Andamento':'Andamento','Pronto':'Pronto','Entregue':'Entregue','Cancelado':'Cancelado'
};

window.renderDashboard = function() {
  const agora=new Date(); const mes=agora.getMonth(); const ano=agora.getFullYear();

  const fat=J.os.filter(o=>['Pronto','Entregue'].includes(STATUS_LEGADO[o.status]||o.status)&&o.updatedAt)
    .reduce((acc,o)=>{ const d=new Date(o.updatedAt); return (d.getMonth()===mes&&d.getFullYear()===ano)?acc+(o.total||0):acc; },0);

  const patio=J.os.filter(o=>!['Cancelado','Entregue'].includes(STATUS_LEGADO[o.status]||o.status||'')).length;
  const stockCrit=J.estoque.filter(p=>(p.qtd||0)<=(p.min||0)).length;
  const vencidos=J.financeiro.filter(f=>f.status==='Pendente'&&f.venc&&new Date(f.venc)<agora).length;

  _st('kFat',   window.moeda?moeda(fat):fat);
  _st('kPatio', patio.toString());
  _st('kStock', stockCrit.toString());
  _st('kVenc',  vencidos.toString());

  const dashOS=document.getElementById('dashRecentOS');
  if (dashOS) {
    const recOS=[...J.os].sort((a,b)=>b.updatedAt>a.updatedAt?1:-1).slice(0,6);
    dashOS.innerHTML = recOS.map(o=>{
      const v=J.veiculos.find(x=>x.id===o.veiculoId)||{placa:o.placa};
      const c=J.clientes.find(x=>x.id===o.clienteId)||{nome:o.cliente};
      const st=STATUS_LEGADO[o.status]||o.status||'?';
      return `<tr>
        <td><span class="placa">${v?.placa||'—'}</span></td>
        <td>${c?.nome||'—'}</td>
        <td>${window.badgeStatus?badgeStatus(st):st}</td>
        <td style="font-family:var(--fm);color:var(--success);font-weight:700">${window.moeda?moeda(o.total):o.total}</td>
      </tr>`;
    }).join('') || window.tableEmpty(4,'📋','Nenhuma O.S.');
  }

  const dashStock=document.getElementById('dashAlertStock');
  if (dashStock) {
    const criticos=J.estoque.filter(p=>(p.qtd||0)<=(p.min||0)).slice(0,6);
    dashStock.innerHTML=criticos.map(p=>`<tr class="row-critical">
      <td>${p.desc}</td>
      <td style="font-family:var(--fm);color:var(--danger);font-weight:700">${p.qtd||0}</td>
      <td style="font-family:var(--fm);color:var(--text-muted)">${p.min||0}</td>
      <td><span class="badge badge-danger">CRÍTICO</span></td>
    </tr>`).join('') || window.tableEmpty(4,'✓','Estoque OK');
  }
};
