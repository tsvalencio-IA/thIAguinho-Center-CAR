/**
 * JARVIS ERP — os.js (Repositório oficina1)
 * Motor de Ordens de Serviço, Kanban Chevron 7 Etapas, WhatsApp B2C, Laudos PDF
 * INCLUI: Separação de Comissões (Peça vs Mão de Obra) exigida na diretriz.
 */

'use strict';

// ============================================================
// 1. ESCUTA E RENDERIZAÇÃO DO KANBAN CHEVRON
// ============================================================
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

function escutarOS() {
  db.collection('ordens_servico').where('tenantId', '==', J.tid).onSnapshot(snap => {
    J.os = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKanban(); 
    if(typeof renderDashboard === 'function') renderDashboard(); 
    if(typeof calcComissoes === 'function') calcComissoes();
  });
}

function renderKanban() {
  const board = $('kanbanBoard');
  if (!board) return;

  const busca = ($v('searchOS') || '').toLowerCase();
  
  board.innerHTML = KANBAN_STATUSES.map(s => {
    const osEtapa = J.os.filter(o => o.status === s);
    
    return `<div class="kanban-col" ondragover="event.preventDefault()" ondrop="dropOS(event, '${s}')">
        <div class="col-header">
            <span>${STATUS_LABELS[s]}</span>
            <span class="col-count">${osEtapa.length}</span>
        </div>
        <div class="kanban-cards">
            ${osEtapa.filter(o => {
                if (!busca) return true;
                return o.placa?.toLowerCase().includes(busca) || o.cliente?.toLowerCase().includes(busca);
            }).map(o => `
                <div class="os-card" draggable="true" ondragstart="dragOS(event, '${o.id}')" onclick="prepOS('edit', '${o.id}');abrirModal('modalOS')">
                    <div class="os-placa">${o.placa || 'S/PLACA'}</div>
                    <div class="os-veiculo">${o.veiculo || ''}</div>
                    <div class="os-cliente">${o.cliente || 'Consumidor'}</div>
                    <div class="os-footer">
                        <span class="os-price">${moeda(o.total || 0)}</span>
                        <button class="btn-success btn-sm" onclick="event.stopPropagation();enviarWppB2C('${o.id}')" title="Enviar WhatsApp" style="padding:2px 6px; font-size:10px; border-radius:3px;">💬 WPP</button>
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
    
    toast(`✓ VEÍCULO MOVIDO PARA ${novoStatus.toUpperCase()}`);
    audit('OS', `Moveu ${id} para ${novoStatus}`);
};

// ============================================================
// 2. COMUNICAÇÃO B2C (WHATSAPP + PORTAL DO CLIENTE)
// ============================================================
window.enviarWhatsAppOS = function(id) {
    const os = J.os.find(x => x.id === id); 
    if (!os) return;
    if (!os.celular) { toast('⚠ Cliente sem WhatsApp cadastrado', 'warn'); return; }
    
    const fone = os.celular.replace(/\D/g, '');
    const link = window.location.origin + '/cliente.html';
    const login = os.cpf || os.placa;
    const pin = os.pin || '1234';
    
    const msg = `Olá ${os.cliente || 'Cliente'}, seu veículo ${os.veiculo} (${os.placa}) já foi avaliado!\n\n` +
                `Acesse seu Prontuário Digital para ver fotos e valores:\n` +
                `${link}\n\n` +
                `Usuário: ${login}\n` +
                `Senha (PIN): ${pin}\n\n` +
                `Aguardamos sua aprovação pelo portal!`;
    
    window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`, '_blank');
    toast('✓ Redirecionando WhatsApp B2C');
    audit('WHATSAPP', `Enviou Link/PIN para ${os.placa}`);
}

// ============================================================
// 3. FICHA TÉCNICA E PREPARAÇÃO DO MODAL
// ============================================================
window.prepOS = function(mode, id = null) {
  ['osId', 'osPlaca', 'osVeiculo', 'osCliente', 'osCelular', 'osCpf', 'osDiagnostico', 'osRelato'].forEach(f => { if ($(f)) $(f).value = ''; });
  
  if ($('osStatus')) $('osStatus').value = 'patio';
  if ($('containerItensOS')) $('containerItensOS').innerHTML = '';
  if ($('osTotalVal')) $('osTotalVal').innerText = '0,00';
  
  window.osPecas = [];
  window.osFotos = [];

  if (mode === 'edit' && id) {
    const o = J.os.find(x => x.id === id);
    if (!o) return;

    if ($('osId')) $('osId').value = o.id;
    if ($('osPlaca')) $('osPlaca').value = o.placa || '';
    if ($('osVeiculo')) $('osVeiculo').value = o.veiculo || '';
    if ($('osCliente')) $('osCliente').value = o.cliente || '';
    if ($('osCelular')) $('osCelular').value = o.celular || '';
    if ($('osCpf')) $('osCpf').value = o.cpf || '';
    if ($('osStatus')) $('osStatus').value = o.status || 'patio';
    if ($('osDiagnostico')) $('osDiagnostico').value = o.diagnostico || '';
    if ($('osRelato')) $('osRelato').value = o.relato || '';
    
    window.osPecas = o.pecas || [];
    window.osFotos = o.fotos || [];
    
    renderItensOS();
    
    if ($('btnWppOS')) {
        $('btnWppOS').style.display = 'block';
        $('btnWppOS').onclick = () => enviarWhatsAppOS(o.id);
    }
  } else {
    if ($('btnWppOS')) $('btnWppOS').style.display = 'none';
    adicionarItemOS();
  }
}

// ============================================================
// 4. MÚLTIPLOS SERVIÇOS E PEÇAS
// ============================================================
window.adicionarItemOS = function(item = null) {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 60px 80px 80px 32px;gap:8px;align-items:center;margin-bottom:8px;';
    div.innerHTML = `
        <input class="j-input os-item-desc" value="${item ? item.desc : ''}" placeholder="Descrição">
        <input type="number" class="j-input os-item-qtd" value="${item ? item.q : 1}" min="1" oninput="calcOSTotal()">
        <input type="number" class="j-input os-item-venda" value="${item ? item.v : 0}" step="0.01" oninput="calcOSTotal()">
        <select class="j-select os-item-tipo" onchange="calcOSTotal()">
            <option value="peca" ${item && item.t === 'peca' ? 'selected' : ''}>Peça</option>
            <option value="servico" ${item && item.t === 'servico' ? 'selected' : ''}>M.O.</option>
        </select>
        <button type="button" onclick="this.parentElement.remove();calcOSTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
    `;
    $('containerItensOS').appendChild(div);
};

window.renderItensOS = function() {
    if (!$('containerItensOS')) return;
    $('containerItensOS').innerHTML = '';
    window.osPecas.forEach(p => adicionarItemOS(p));
    calcOSTotal();
};

window.calcOSTotal = function() {
    let total = 0;
    document.querySelectorAll('#containerItensOS > div').forEach(div => {
        const q = parseFloat(div.querySelector('.os-item-qtd').value || 0);
        const v = parseFloat(div.querySelector('.os-item-venda').value || 0);
        total += (q * v);
    });
    if ($('osTotalVal')) $('osTotalVal').innerText = total.toFixed(2).replace('.', ',');
};

async function salvarOS() {
  const osId = $v('osId');
  if (!$v('osPlaca') || !$v('osVeiculo')) { toast('⚠ Preencha Placa e Veículo', 'warn'); return; }

  const itens = [];
  document.querySelectorAll('#containerItensOS > div').forEach(div => {
    const desc = div.querySelector('.os-item-desc').value.trim();
    const q = parseFloat(div.querySelector('.os-item-qtd').value || 0);
    const v = parseFloat(div.querySelector('.os-item-venda').value || 0);
    const t = div.querySelector('.os-item-tipo').value;
    if (desc && q > 0) itens.push({ desc, q, v, t });
  });

  const total = parseFloat($('osTotalVal').innerText.replace(',', '.'));
  
  const payload = {
    tenantId: J.tid,
    placa: $v('osPlaca').toUpperCase(),
    veiculo: $v('osVeiculo'),
    cliente: $v('osCliente'),
    celular: $v('osCelular'),
    cpf: $v('osCpf'),
    status: $v('osStatus'),
    diagnostico: $v('osDiagnostico'),
    relato: $v('osRelato'),
    pecas: itens,
    fotos: window.osFotos || [],
    total: total,
    updatedAt: new Date().toISOString()
  };

  if (osId) {
    await db.collection('ordens_servico').doc(osId).update(payload);
    toast('✓ O.S. ATUALIZADA');
  } else {
    payload.createdAt = new Date().toISOString();
    payload.pin = Math.floor(1000 + Math.random() * 9000).toString();
    await db.collection('ordens_servico').add(payload);
    toast('✓ O.S. CRIADA');
  }

  fecharModal('modalOS');
}
