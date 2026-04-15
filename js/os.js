/**
 * JARVIS ERP — os.js
 * Motor de Ordens de Serviço, Kanban Chevron 7 Etapas, WhatsApp B2C, Laudos PDF
 */

'use strict';

const KANBAN_STATUSES = ['patio', 'orcamento', 'aprovacao', 'box', 'pronto', 'faturado', 'entregue'];
const STATUS_LABELS = {
    patio: '1. PÁTIO',
    orcamento: '2. ORÇAMENTO',
    aprovacao: '3. AGUARD. CLIENTE',
    box: '4. EM SERVIÇO',
    pronto: '5. PRONTO',
    faturado: '6. FATURAMENTO',
    entregue: '7. ENTREGUE'
};

window.escutarOS = function() {
  db.collection('ordens_servico').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.os = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if(typeof window.renderKanban === 'function') window.renderKanban(); 
    if(typeof window.renderDashboard === 'function') window.renderDashboard(); 
    if(typeof window.calcComissoes === 'function') window.calcComissoes();
  });
}

window.renderKanban = function() {
  const board = $('kanbanBoard');
  if (!board) return;

  const busca = ($v('searchOS') || '').toLowerCase();
  
  board.innerHTML = KANBAN_STATUSES.map(s => {
    const osEtapa = J.os.filter(o => o.status === s);
    
    return `<div class="kanban-col" ondragover="event.preventDefault()" ondrop="window.dropOS(event, '${s}')">
        <div class="col-header">
            <span>${STATUS_LABELS[s]}</span>
            <span class="col-count">${osEtapa.length}</span>
        </div>
        <div class="kanban-cards">
            ${osEtapa.filter(o => {
                if (!busca) return true;
                return o.placa?.toLowerCase().includes(busca) || o.cliente?.toLowerCase().includes(busca);
            }).map(o => `
                <div class="os-card" draggable="true" ondragstart="window.dragOS(event, '${o.id}')" onclick="window.prepOS('edit', '${o.id}');abrirModal('modalOS')">
                    <div class="os-placa">${o.placa || 'S/PLACA'}</div>
                    <div class="os-veiculo">${o.veiculo || ''}</div>
                    <div class="os-cliente">${o.cliente || 'Consumidor'}</div>
                    <div class="os-footer">
                        <span class="os-price">${moeda(o.total || 0)}</span>
                        <button class="btn-success btn-sm" onclick="event.stopPropagation();window.enviarWppB2C('${o.id}')" title="Enviar WhatsApp" style="padding:2px 6px; font-size:10px; border-radius:3px;">💬 WPP</button>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>`;
  }).join('');
}

window.dragOS = function(ev, id) {
    ev.dataTransfer.setData('osId', id);
};

window.dropOS = async function(ev, novoStatus) {
    const id = ev.dataTransfer.getData('osId');
    if (!id) return;
    
    await db.collection('ordens_servico').doc(id).update({ 
        status: novoStatus, 
        updatedAt: new Date().toISOString() 
    });
    
    window.toast(`✓ VEÍCULO MOVIDO PARA ${novoStatus.toUpperCase()}`);
    audit('OS', `Moveu ${id} para ${novoStatus}`);
    
    if (novoStatus === 'orcamento' || novoStatus === 'aprovacao') {
        window.enviarWppB2C(id);
    }
};

window.enviarWppB2C = function(id) {
    const os = J.os.find(x => x.id === id); 
    if (!os) return;
    
    const cel = os.celular || (J.clientes.find(x => x.id === os.clienteId)?.wpp) || '';
    const cliNome = os.cliente || (J.clientes.find(x => x.id === os.clienteId)?.nome) || 'Cliente';
    const veicObj = os.veiculo || (J.veiculos.find(x => x.id === os.veiculoId)?.modelo) || 'Veículo';
    
    if (!cel) { window.toast('⚠ Cliente sem WhatsApp cadastrado', 'warn'); return; }
    
    const fone = cel.replace(/\D/g, '');
    const link = window.location.origin + '/cliente.html';
    const loginUser = os.cpf || os.placa || cliNome.split(' ')[0].toLowerCase();
    const pin = os.pin || Math.random().toString(36).slice(-6); 
    
    let msg = `Olá ${cliNome.split(' ')[0]}! O orçamento do seu ${veicObj} está pronto na ${J.tnome}.\n\n💰 Total: R$ ${(os.total||0).toFixed(2).replace('.', ',')}\n\nAcesse seu portal para aprovar e ver a linha do tempo:\n🔗 ${link}\n👤 Usuário: ${loginUser}\n🔑 PIN: ${pin}`;
    
    try {
        if (window.JARVIS_CONST && window.JARVIS_CONST.WPP_MSGS) {
            msg = window.JARVIS_CONST.WPP_MSGS.orcamento(cliNome.split(' ')[0], veicObj, J.tnome, (os.total||0).toFixed(2).replace('.', ','), link, pin);
            msg += `\n👤 Usuário: ${loginUser}`;
        }
    } catch(e) { console.warn('Usando msg fallback', e); }
    
    window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`, '_blank');
    window.toast('✓ Redirecionando WhatsApp B2C');
    audit('WHATSAPP', `Enviou Link/PIN para ${os.placa || veicObj}`);
}

let mediaOSAtual = []; 
let timelineOSAtual = [];

window.prepOS = function(mode, id = null) {
  ['osId', 'osPlaca', 'osVeiculo', 'osCliente', 'osCelular', 'osCpf', 'osDiagnostico', 'osRelato', 'osDescricao', 'chkObs'].forEach(f => { if ($(f)) $(f).value = ''; });
  
  if ($('osStatus')) $('osStatus').value = 'Triagem';
  if ($('containerItensOS')) $('containerItensOS').innerHTML = '';
  if ($('containerServicosOS')) $('containerServicosOS').innerHTML = '';
  if ($('containerPecasOS')) $('containerPecasOS').innerHTML = '';
  if ($('osTotalVal')) $('osTotalVal').innerText = '0,00';
  
  window.osPecas = [];
  window.osFotos = [];
  if($('osTimelineData')) $('osTimelineData').value = '[]';
  window.renderTimelineOS();

  if (mode === 'edit' && id) {
    const o = J.os.find(x => x.id === id);
    if (!o) return;

    if ($('osId')) $('osId').value = o.id;
    if ($('osPlaca')) $('osPlaca').value = o.placa || '';
    if ($('osVeiculo')) $('osVeiculo').value = o.veiculo || o.veiculoId || '';
    if ($('osCliente')) $('osCliente').value = o.cliente || o.clienteId || '';
    if ($('osCelular')) $('osCelular').value = o.celular || '';
    if ($('osCpf')) $('osCpf').value = o.cpf || '';
    if ($('osStatus')) $('osStatus').value = STATUS_MAP_LEGACY[o.status] || o.status || 'Triagem';
    if ($('osDiagnostico')) $('osDiagnostico').value = o.diagnostico || '';
    if ($('osRelato')) $('osRelato').value = o.relato || '';
    if ($('osDescricao')) $('osDescricao').value = o.desc || o.relato || '';
    
    window.osPecas = o.pecas || [];
    window.osFotos = o.fotos || o.media || [];
    
    if(typeof window.renderItensOS === 'function') window.renderItensOS();
    
    if (o.servicos && o.servicos.length > 0 && typeof window.renderServicoOSRow === 'function') {
        o.servicos.forEach(s => window.renderServicoOSRow(s));
    }
    if (o.pecas && o.pecas.length > 0 && typeof window.renderPecaOSRow === 'function') {
        o.pecas.forEach(p => window.renderPecaOSRow(p));
    }

    if($('osTimelineData') && o.timeline) {
        $('osTimelineData').value = JSON.stringify(o.timeline);
        window.renderTimelineOS();
    }
    
    if ($('btnWppOS')) {
        $('btnWppOS').style.display = 'block';
        $('btnWppOS').onclick = () => window.enviarWppB2C(o.id);
    }
  } else {
    if ($('btnWppOS')) $('btnWppOS').style.display = 'none';
    if(typeof window.adicionarItemOS === 'function') window.adicionarItemOS();
    if(typeof window.adicionarServicoOS === 'function') window.adicionarServicoOS();
  }
}

window.adicionarItemOS = function(item = null) {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 60px 80px 80px 32px;gap:8px;align-items:center;margin-bottom:8px;';
    div.innerHTML = `
        <input class="j-input os-item-desc" value="${item ? item.desc : ''}" placeholder="Descrição">
        <input type="number" class="j-input os-item-qtd" value="${item ? item.q : 1}" min="1" oninput="window.calcOSTotal()">
        <input type="number" class="j-input os-item-venda" value="${item ? (item.v || item.venda) : 0}" step="0.01" oninput="window.calcOSTotal()">
        <select class="j-select os-item-tipo" onchange="window.calcOSTotal()">
            <option value="peca" ${item && item.t === 'peca' ? 'selected' : ''}>Peça</option>
            <option value="servico" ${item && item.t === 'servico' ? 'selected' : ''}>M.O.</option>
        </select>
        <button type="button" onclick="this.parentElement.remove();window.calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
    `;
    if($('containerItensOS')) $('containerItensOS').appendChild(div);
};

window.renderItensOS = function() {
    if (!$('containerItensOS')) return;
    $('containerItensOS').innerHTML = '';
    window.osPecas.forEach(p => window.adicionarItemOS(p));
    window.calcOSTotal();
};

window.adicionarServicoOS = function() {
  const sel = document.createElement('div');
  sel.style.cssText = 'display:grid;grid-template-columns:1fr 100px 32px;gap:8px;align-items:center;margin-bottom:8px;';
  sel.innerHTML = `
    <input type="text" class="j-input serv-desc" placeholder="Ex: Alinhamento, Troca de Freio..." oninput="window.calcOSTotal()">
    <input type="number" class="j-input serv-valor" value="0" step="0.01" placeholder="R$ 0,00" oninput="window.calcOSTotal()">
    <button type="button" onclick="this.parentElement.remove();window.calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
  `;
  if($('containerServicosOS')) $('containerServicosOS').appendChild(sel);
}

window.renderServicoOSRow = function(s) {
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 100px 32px;gap:8px;align-items:center;margin-bottom:8px;';
  div.innerHTML = `
    <input type="text" class="j-input serv-desc" value="${s.desc || ''}" placeholder="Descrição do Serviço" oninput="window.calcOSTotal()">
    <input type="number" class="j-input serv-valor" value="${s.valor || 0}" step="0.01" placeholder="R$ 0,00" oninput="window.calcOSTotal()">
    <button type="button" onclick="this.parentElement.remove();window.calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
  `;
  if($('containerServicosOS')) $('containerServicosOS').appendChild(div);
}

window.adicionarPecaOS = function() {
  const sel = document.createElement('div');
  sel.style.cssText = 'display:grid;grid-template-columns:1fr 80px 90px 90px 32px;gap:8px;align-items:center;';
  const opts = '<option value="">Selecionar peça...</option>' + J.estoque.filter(p => (p.qtd || 0) > 0).map(p => `<option value="${p.id}" data-venda="${p.venda || 0}" data-desc="${p.desc || ''}">[${p.qtd}un] ${p.desc} — ${moeda(p.venda)}</option>`).join('');
  sel.innerHTML = `
    <select class="j-select peca-sel" onchange="window.selecionarPecaOS(this)">${opts}</select>
    <input type="number" class="j-input peca-qtd" value="1" min="1" placeholder="Qtd" oninput="window.calcOSTotal()">
    <input type="number" class="j-input peca-custo" value="0" step="0.01" placeholder="Custo" oninput="window.calcOSTotal()">
    <input type="number" class="j-input peca-venda" value="0" step="0.01" placeholder="Venda" oninput="window.calcOSTotal()">
    <button type="button" onclick="this.parentElement.remove();window.calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
  `;
  if($('containerPecasOS')) $('containerPecasOS').appendChild(sel); window.calcOSTotal();
}

window.renderPecaOSRow = function(p) {
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 90px 90px 32px;gap:8px;align-items:center;';
  const opts = '<option value="">' + p.desc + '</option>' + J.estoque.filter(x => (x.qtd || 0) > 0 || x.id === p.estoqueId).map(x => `<option value="${x.id}" data-venda="${x.venda || 0}" data-desc="${x.desc || ''}" ${x.id === p.estoqueId ? 'selected' : ''}>[${x.qtd}un] ${x.desc}</option>`).join('');
  div.innerHTML = `
    <select class="j-select peca-sel" onchange="window.selecionarPecaOS(this)">${opts}</select>
    <input type="number" class="j-input peca-qtd" value="${p.qtd || p.q || 1}" min="1" oninput="window.calcOSTotal()">
    <input type="number" class="j-input peca-custo" value="${p.custo || p.c || 0}" step="0.01" oninput="window.calcOSTotal()">
    <input type="number" class="j-input peca-venda" value="${p.venda || p.v || 0}" step="0.01" oninput="window.calcOSTotal()">
    <button type="button" onclick="this.parentElement.remove();window.calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
  `;
  if($('containerPecasOS')) $('containerPecasOS').appendChild(div);
}

window.selecionarPecaOS = function(sel) {
  const opt = sel.options[sel.selectedIndex];
  sel.parentElement.querySelector('.peca-venda').value = opt.dataset.venda || 0;
  window.calcOSTotal();
}

window.calcOSTotal = function() {
    let total = 0;
    
    document.querySelectorAll('#containerItensOS > div').forEach(div => {
        const q = parseFloat(div.querySelector('.os-item-qtd')?.value || 0);
        const v = parseFloat(div.querySelector('.os-item-venda')?.value || 0);
        total += (q * v);
    });

    document.querySelectorAll('#containerServicosOS > div').forEach(row => {
        total += parseFloat(row.querySelector('.serv-valor')?.value || 0);
    });
  
    document.querySelectorAll('#containerPecasOS > div').forEach(row => {
        const qtd = parseFloat(row.querySelector('.peca-qtd')?.value || 0);
        const venda = parseFloat(row.querySelector('.peca-venda')?.value || 0);
        total += qtd * venda;
    });

    if ($('osTotalVal')) $('osTotalVal').innerText = total.toFixed(2).replace('.', ',');
    if ($('osTotalHidden')) $('osTotalHidden').value = total;
};

window.verificarStatusOS = function() {
  const s = $v('osStatus');
  if($('areaPgtoOS')) $('areaPgtoOS').style.display = (s === 'Pronto' || s === 'Entregue' || s === 'pronto' || s === 'entregue') ? 'block' : 'none';
  if($('btnEnviarWppOS')) $('btnEnviarWppOS').style.display = (s === 'Orcamento_Enviado' || s === 'orcamento' || s === 'aprovacao') && $v('osId') ? 'flex' : 'none';
}

window.checkPgtoOS = function() {
  const f = $v('osPgtoForma');
  if($('divParcelasOS')) $('divParcelasOS').style.display = (f === 'Crédito Parcelado' || f === 'Boleto') ? 'block' : 'none';
}

window.salvarOS = async function() {
  const osId = $v('osId');
  if ($('osPlaca') && !$v('osPlaca')) { window.toast('⚠ Preencha a Placa', 'warn'); return; }
  if ($('osCliente') && $('osVeiculo') && !$v('osCliente') && !$v('osVeiculo')) { window.toast('⚠ Selecione cliente e veículo', 'warn'); return; }

  const itens = [];
  document.querySelectorAll('#containerItensOS > div').forEach(div => {
    const desc = div.querySelector('.os-item-desc').value.trim();
    const q = parseFloat(div.querySelector('.os-item-qtd').value || 0);
    const v = parseFloat(div.querySelector('.os-item-venda').value || 0);
    const t = div.querySelector('.os-item-tipo').value;
    if (desc && q > 0) itens.push({ desc, q, v, t });
  });

  const servicos = []; 
  let totalMaoObra = 0;
  document.querySelectorAll('#containerServicosOS > div').forEach(row => {
    const desc = row.querySelector('.serv-desc')?.value || '';
    const valor = parseFloat(row.querySelector('.serv-valor')?.value || 0);
    if (desc || valor > 0) { servicos.push({ desc, valor }); totalMaoObra += valor; }
  });

  const pecas = [];
  let totalPecas = 0;
  document.querySelectorAll('#containerPecasOS > div').forEach(row => {
    const sel = row.querySelector('.peca-sel'); 
    const opt = sel?.options[sel.selectedIndex];
    const qtd = parseFloat(row.querySelector('.peca-qtd')?.value || 1);
    const venda = parseFloat(row.querySelector('.peca-venda')?.value || 0);
    const custo = parseFloat(row.querySelector('.peca-custo')?.value || 0);
    totalPecas += (qtd * venda);
    
    pecas.push({
      estoqueId: sel?.value, 
      desc: opt?.dataset.desc || opt?.text || '',
      qtd: qtd, custo: custo, venda: venda
    });
  });

  const totalFormatado = $('osTotalVal') ? $('osTotalVal').innerText.replace(',', '.') : 0;
  const total = parseFloat(totalFormatado);
  
  const payload = {
    tenantId: J.tid,
    status: $v('osStatus'),
    total: total,
    updatedAt: new Date().toISOString()
  };

  if ($v('osPlaca')) payload.placa = $v('osPlaca').toUpperCase();
  if ($v('osVeiculo')) payload.veiculo = $v('osVeiculo');
  if ($('osVeiculo') && $('osVeiculo').tagName === 'SELECT') payload.veiculoId = $v('osVeiculo');
  if ($v('osCliente')) payload.cliente = $v('osCliente');
  if ($('osCliente') && $('osCliente').tagName === 'SELECT') payload.clienteId = $v('osCliente');
  if ($v('osCelular')) payload.celular = $v('osCelular');
  if ($v('osCpf')) payload.cpf = $v('osCpf');
  if ($v('osDiagnostico')) payload.diagnostico = $v('osDiagnostico');
  if ($v('osRelato')) payload.relato = $v('osRelato');
  if ($v('osDescricao')) payload.desc = $v('osDescricao');
  if ($v('osMec')) payload.mecId = $v('osMec');
  
  if (itens.length > 0) payload.pecasLegacy = itens;
  if (servicos.length > 0) payload.servicos = servicos;
  if (pecas.length > 0) payload.pecas = pecas;
  payload.maoObra = totalMaoObra;

  const tl = JSON.parse($('osTimelineData')?.value || '[]');
  tl.push({ dt: new Date().toISOString(), user: J.nome, acao: `${osId ? 'Editou' : 'Abriu'} O.S. — Status: ${$v('osStatus')}` });
  payload.timeline = tl;

  if (($v('osStatus') === 'Pronto' || $v('osStatus') === 'Entregue' || $v('osStatus') === 'pronto' || $v('osStatus') === 'entregue') && payload.mecId) {
      const mec = J.equipe.find(f => f.id === payload.mecId);
      if (mec) {
        const percServico = parseFloat(mec.comissaoServico || mec.comissao || 0);
        const percPeca = parseFloat(mec.comissaoPeca || 0);
        
        const valComServico = totalMaoObra * (percServico / 100);
        const valComPeca = totalPecas * (percPeca / 100);
        const valComTotal = valComServico + valComPeca;

        if (valComTotal > 0) {
            db.collection('financeiro').add({
                tenantId: J.tid, tipo: 'Saída', status: 'Pendente',
                desc: `Comissão (Serv: ${moeda(valComServico)} | Peça: ${moeda(valComPeca)}) — O.S. ${payload.placa || ''}`,
                valor: valComTotal, pgto: 'A Combinar', venc: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString(), isComissao: true, mecId: payload.mecId
            });
        }
      }
  }

  if (osId) {
    await db.collection('ordens_servico').doc(osId).update(payload);
    window.toast('✓ O.S. ATUALIZADA');
    audit('OS', `Editou OS ${osId.slice(-6)}`);
  } else {
    payload.createdAt = new Date().toISOString();
    payload.pin = Math.floor(1000 + Math.random() * 9000).toString(); 
    const ref = await db.collection('ordens_servico').add(payload);
    window.toast('✓ O.S. CRIADA');
    audit('OS', `Criou OS para ${payload.placa || payload.cliente}`);
  }

  if(typeof window.fecharModal === 'function') window.fecharModal('modalOS');
}

window.uploadOsMedia = async function() {
  const f = $('osFileInput')?.files[0]; if (!f) return;
  const btn = $('btnUploadMedia'); btn.innerText = 'ENVIANDO...'; btn.disabled = true;
  try {
    const fd = new FormData(); fd.append('file', f); fd.append('upload_preset', J.cloudPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${J.cloudName}/auto/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.secure_url) {
      const media = JSON.parse($('osMediaArray').value || '[]');
      media.push({ url: data.secure_url, type: data.resource_type });
      $('osMediaArray').value = JSON.stringify(media); window.renderMediaOS(); window.toast('✓ UPLOAD CONCLUÍDO');
    }
  } catch (e) { window.toast('✕ ERRO UPLOAD', 'err'); }
  btn.innerText = 'UPLOAD'; btn.disabled = false;
}

window.renderMediaOS = function() {
  const media = JSON.parse($('osMediaArray')?.value || '[]');
  if($('osMediaGrid')) {
      $('osMediaGrid').innerHTML = media.map((m, i) => `
        <div class="media-item">
          ${m.type === 'video' ? `<video src="${m.url}" controls></video>` : `<img src="${m.url}" onclick="window.open('${m.url}')" style="cursor:zoom-in">`}
          <button class="media-del" onclick="window.removerMediaOS(${i})">✕</button>
        </div>`).join('');
  }
}

window.removerMediaOS = function(idx) {
  const media = JSON.parse($('osMediaArray').value || '[]');
  media.splice(idx, 1); $('osMediaArray').value = JSON.stringify(media); window.renderMediaOS();
}

window.renderTimelineOS = function() {
  if(!$('osTimeline')) return;
  const tl = JSON.parse($('osTimelineData')?.value || '[]');
  $('osTimeline').innerHTML = [...tl].reverse().map(e => `<div class="tl-item"><div class="tl-date">${dtHrBr(e.dt)}</div><div class="tl-user">${e.user}</div><div class="tl-action">${e.acao}</div></div>`).join('');
}
