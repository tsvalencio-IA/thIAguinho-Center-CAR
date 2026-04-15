/**
 * JARVIS ERP — financeiro.js (Repositório oficina1)
 * DRE, Fluxo de Caixa, NF Entrada com Importação XML, Comissões, Exportação
 */

'use strict';

// ============================================================
// 1. DRE E FLUXO DE CAIXA
// ============================================================
window.renderFinanceiro = function() {
    const buscaTipo = $v('filtroFinTipo');
    const buscaStatus = $v('filtroFinStatus');
    const buscaMes = $v('filtroFinMes');

    let base = [...J.financeiro];
    if (buscaTipo) base = base.filter(f => f.tipo === buscaTipo);
    if (buscaStatus) base = base.filter(f => f.status === buscaStatus);
    if (buscaMes) base = base.filter(f => (f.venc || '').startsWith(buscaMes));

    base.sort((a, b) => (b.venc || '') > (a.venc || '') ? 1 : -1);

    // DRE (Calculado sobre TUDO que está Pago)
    let entradas = 0, saidas = 0;
    J.financeiro.filter(f => f.status === 'Pago').forEach(f => {
        if (f.tipo === 'Entrada') entradas += (f.valor || 0);
        else saidas += (f.valor || 0);
    });

    if ($('dreEntradas')) $('dreEntradas').innerText = moeda(entradas);
    if ($('dreSaidas')) $('dreSaidas').innerText = moeda(saidas);
    
    const saldo = entradas - saidas;
    if ($('dreSaldo')) {
        $('dreSaldo').innerText = moeda(saldo);
        $('dreSaldo').style.color = saldo >= 0 ? 'var(--cyan)' : 'var(--danger)';
    }

    // Botão de Exportação e Renderização da Tabela
    const tb = $('tbFinanceiro');
    if (!tb) return;
    
    // Injetar o botão de exportar CSV ao lado do filtro se não existir
    if(!$('btnExportCSV') && $('filtroFinMes')) {
        const btnCsv = document.createElement('button');
        btnCsv.id = 'btnExportCSV';
        btnCsv.className = 'btn-outline';
        btnCsv.innerHTML = '📄 EXPORTAR CSV';
        btnCsv.onclick = exportarFinanceiro;
        $('filtroFinMes').parentElement.appendChild(btnCsv);
    }

    tb.innerHTML = base.map(f => {
        const stCls = f.status === 'Pago' ? 'pill-green' : 'pill-warn'; 
        const tipCls = f.tipo === 'Entrada' ? 'pill-green' : 'pill-danger';
        const atrasado = f.status === 'Pendente' && f.venc && new Date(f.venc) < new Date();
        const corValor = f.tipo === 'Entrada' ? 'var(--success)' : 'var(--danger)';

        return `<tr style="${atrasado ? 'background:rgba(255,59,59,0.05);' : ''}">
            <td style="font-family:var(--fm);font-size:0.75rem">${dtBr(f.venc)}</td>
            <td><span class="pill ${tipCls}">${f.tipo}</span></td>
            <td>${f.desc}</td>
            <td style="font-family:var(--fm);font-size:0.75rem">${f.pgto || '-'}</td>
            <td style="font-family:var(--fm);font-weight:700;color:${corValor}">${moeda(f.valor)}</td>
            <td><span class="pill ${stCls}">${f.status}</span></td>
            <td>
                <button class="btn-ghost" onclick="prepFin('${f.id}');abrirModal('modalFin')" title="Editar">✏</button>
                <button class="btn-danger" onclick="toggleStatusFin('${f.id}','${f.status}')" title="${f.status === 'Pago' ? 'Marcar como Pendente' : 'Marcar como Pago'}">
                    ${f.status === 'Pago' ? '⌛' : '✓'}
                </button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">Nenhum lançamento encontrado</td></tr>';
};

window.prepFin = function(id = null) {
    ['finId', 'finDesc', 'finValor', 'finNota'].forEach(f => { if ($(f)) $(f).value = ''; });
    
    if ($('finTipo')) $('finTipo').value = 'Entrada'; 
    if ($('finStatus')) $('finStatus').value = 'Pago'; 
    if ($('finPgto')) $('finPgto').value = 'PIX'; 
    if ($('finVenc')) $('finVenc').value = new Date().toISOString().split('T')[0];

    if (id) {
        const f = J.financeiro.find(x => x.id === id); 
        if (!f) return;
        
        if ($('finId')) $('finId').value = f.id; 
        if ($('finDesc')) $('finDesc').value = f.desc || ''; 
        if ($('finValor')) $('finValor').value = f.valor || 0;
        if ($('finTipo')) $('finTipo').value = f.tipo || 'Entrada'; 
        if ($('finStatus')) $('finStatus').value = f.status || 'Pago';
        if ($('finPgto')) $('finPgto').value = f.pgto || 'PIX'; 
        if ($('finVenc')) $('finVenc').value = f.venc || ''; 
        if ($('finNota')) $('finNota').value = f.nota || '';
    }
};

window.salvarFin = async function() {
    if (!$v('finDesc') || !$v('finValor')) { toast('⚠ Preencha descrição e valor', 'warn'); return; }
    
    const payload = {
        tenantId: J.tid, 
        tipo: $v('finTipo'), 
        desc: $v('finDesc'), 
        valor: parseFloat($v('finValor') || 0), 
        pgto: $v('finPgto'), 
        venc: $v('finVenc'), 
        status: $v('finStatus'), 
        nota: $v('finNota'), 
        updatedAt: new Date().toISOString()
    };
    
    const id = $v('finId');
    if (id) {
        await db.collection('financeiro').doc(id).update(payload);
        toast('✓ LANÇAMENTO ATUALIZADO'); 
        audit('FINANCEIRO', 'Editou ' + payload.tipo + ': ' + payload.desc);
    } else { 
        payload.createdAt = new Date().toISOString(); 
        await db.collection('financeiro').add(payload); 
        toast('✓ LANÇAMENTO REGISTRADO'); 
        audit('FINANCEIRO', 'Lançou ' + payload.tipo + ': ' + payload.desc);
    }
    
    fecharModal('modalFin');
};

window.toggleStatusFin = async function(id, status) {
    const novoStatus = status === 'Pago' ? 'Pendente' : 'Pago';
    await db.collection('financeiro').doc(id).update({ status: novoStatus, updatedAt: new Date().toISOString() }); 
    toast(`✓ STATUS ALTERADO PARA ${novoStatus.toUpperCase()}`);
};

// ============================================================
// 2. ENTRADA DE NF (XML + MANUAL) E INTEGRAÇÃO DE ESTOQUE
// ============================================================
window.prepNF = function() {
    if ($('nfData')) $('nfData').value = new Date().toISOString().split('T')[0]; 
    if ($('nfNumero')) $('nfNumero').value = ''; 
    if ($('containerItensNF')) $('containerItensNF').innerHTML = '';
    if ($('nfTotal')) $('nfTotal').innerText = '0,00'; 
    if ($('nfPgtoForma')) $('nfPgtoForma').value = 'Dinheiro'; 
    
    if (typeof popularSelects === 'function') popularSelects(); 
    adicionarItemNF();
    checkPgtoNF();

    // Injeta Botão de XML NFe e o Input File (Invisível) no modal, caso não exista
    if (!$('btnLoadXmlNfe') && $('containerItensNF')) {
        const container = $('containerItensNF').parentElement;
        const btnHtml = `
        <div style="display:flex;gap:10px;margin-bottom:14px;background:rgba(255,184,0,0.05);padding:10px;border:1px dashed var(--warn);border-radius:3px;">
            <input type="file" id="xmlInputFile" accept=".xml" style="display:none" onchange="lerXMLNFe(event)">
            <button type="button" id="btnLoadXmlNfe" class="btn-warn" onclick="document.getElementById('xmlInputFile').click()">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:middle;margin-right:4px;"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/></svg>
                IMPORTAR NOTA FISCAL (XML)
            </button>
            <span style="font-family:var(--fm);font-size:0.6rem;color:var(--muted);align-self:center;">Extrai automaticamente Produtos, NF e Data</span>
        </div>`;
        container.insertAdjacentHTML('beforebegin', btnHtml);
    }
};

window.lerXMLNFe = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

            // Parse Cabeçalho (Nº da Nota e Data de Emissão)
            const nNF = xmlDoc.querySelector("nNF")?.textContent || '';
            const dhEmi = xmlDoc.querySelector("dhEmi")?.textContent || '';
            if (nNF && $('nfNumero')) $('nfNumero').value = nNF;
            if (dhEmi && $('nfData')) $('nfData').value = dhEmi.split('T')[0];

            // Parse Fornecedor
            const nomeEmit = xmlDoc.querySelector("emit > xNome")?.textContent || '';

            // Parse Itens (Produtos detalhados no XML)
            const detNodes = xmlDoc.querySelectorAll("det");
            if (detNodes.length > 0 && $('containerItensNF')) {
                $('containerItensNF').innerHTML = ''; // Limpa os itens manuais existentes
                
                detNodes.forEach(det => {
                    const xProd = det.querySelector("xProd")?.textContent || '';
                    const qCom = parseFloat(det.querySelector("qCom")?.textContent || 1);
                    const vUnCom = parseFloat(det.querySelector("vUnCom")?.textContent || 0);

                    // Busca no estoque se a peça já existe para sugerir valor de venda (Margem Padrão 50% se não achar)
                    const pecaExistente = J.estoque.find(p => p.desc.toLowerCase() === xProd.toLowerCase());
                    const vVenda = pecaExistente ? (pecaExistente.venda || 0) : (vUnCom * 1.5);

                    const div = document.createElement('div');
                    div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 90px 90px 32px;gap:8px;align-items:center;margin-bottom:8px;';
                    div.innerHTML = `
                        <input class="j-input nf-desc" value="${xProd}" placeholder="Descrição do item">
                        <input type="number" class="j-input nf-qtd" value="${qCom}" min="1" oninput="calcNFTotal()">
                        <input type="number" class="j-input nf-custo" value="${vUnCom.toFixed(2)}" step="0.01" placeholder="Custo" oninput="calcNFTotal()">
                        <input type="number" class="j-input nf-venda" value="${vVenda.toFixed(2)}" step="0.01" placeholder="Venda" oninput="calcNFTotal()">
                        <button type="button" onclick="this.parentElement.remove();calcNFTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
                    `;
                    $('containerItensNF').appendChild(div);
                });
                
                calcNFTotal();
                toast('✓ XML IMPORTADO COM SUCESSO');
                audit('ESTOQUE/NF', `Importou XML da NFe ${nNF} de ${nomeEmit}`);
            } else {
                toast('⚠ Nenhum produto encontrado no XML', 'warn');
            }
        } catch(err) {
            toast('✕ Arquivo XML inválido ou corrompido', 'err');
            console.error(err);
        }
        
        // Reseta o input para permitir importar o mesmo arquivo se houver correção
        $('xmlInputFile').value = '';
    };
    reader.readAsText(file);
};

window.adicionarItemNF = function() {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 90px 90px 32px;gap:8px;align-items:center;margin-bottom:8px;';
    div.innerHTML = `
        <input class="j-input nf-desc" placeholder="Descrição do item" oninput="sugerirProdutoNF(this)">
        <input type="number" class="j-input nf-qtd" value="1" min="1" oninput="calcNFTotal()">
        <input type="number" class="j-input nf-custo" value="0" step="0.01" placeholder="Custo" oninput="calcNFTotal()">
        <input type="number" class="j-input nf-venda" value="0" step="0.01" placeholder="Venda" oninput="calcNFTotal()">
        <button type="button" onclick="this.parentElement.remove();calcNFTotal()" style="background:rgba(255,59,59,0.1);border:1px solid rgba(255,59,59,0.3);border-radius:2px;color:var(--danger);cursor:pointer;width:32px;height:32px;">✕</button>
    `;
    $('containerItensNF').appendChild(div);
};

window.calcNFTotal = function() {
    let total = 0;
    document.querySelectorAll('#containerItensNF > div').forEach(div => {
        const q = parseFloat(div.querySelector('.nf-qtd').value || 0);
        const c = parseFloat(div.querySelector('.nf-custo').value || 0);
        total += (q * c);
    });
    if ($('nfTotal')) $('nfTotal').innerText = total.toFixed(2).replace('.', ',');
};

window.salvarNF = async function() {
    const itens = [];
    document.querySelectorAll('#containerItensNF > div').forEach(div => {
        const desc = div.querySelector('.nf-desc').value.trim();
        const q = parseFloat(div.querySelector('.nf-qtd').value || 0);
        const c = parseFloat(div.querySelector('.nf-custo').value || 0);
        const v = parseFloat(div.querySelector('.nf-venda').value || 0);
        if (desc && q > 0) itens.push({ desc, q, c, v });
    });

    if (itens.length === 0) { toast('⚠ Adicione ao menos um item', 'warn'); return; }

    const batch = db.batch();
    const dataNota = $v('nfData');

    itens.forEach(it => {
        // Lógica de SOMA ao estoque existente
        const pExistente = J.estoque.find(p => p.desc.toLowerCase() === it.desc.toLowerCase());
        if (pExistente) {
            batch.update(db.collection('estoque').doc(pExistente.id), {
                qtd: firebase.firestore.FieldValue.increment(it.q),
                custo: it.c,
                venda: it.v,
                updatedAt: new Date().toISOString()
            });
        } else {
            const ref = db.collection('estoque').doc();
            batch.set(ref, {
                tenantId: J.tid,
                desc: it.desc,
                qtd: it.q,
                custo: it.c,
                venda: it.v,
                createdAt: new Date().toISOString()
            });
        }
    });

    // Financeiro (Gera a despesa de compra)
    const totalNF = parseFloat($('nfTotal').innerText.replace(',', '.'));
    const finRef = db.collection('financeiro').doc();
    batch.set(finRef, {
        tenantId: J.tid,
        tipo: 'Saída',
        desc: `Compra NF: ${$v('nfNumero') || 'S/N'}`,
        valor: totalNF,
        pgto: $v('nfPgtoForma'),
        venc: dataNota,
        status: 'Pendente',
        createdAt: new Date().toISOString()
    });

    await batch.commit();
    toast('✓ ENTRADA DE NOTA E ESTOQUE PROCESSADOS');
    fecharModal('modalNF');
    audit('ESTOQUE', `Entrada de NF ${$v('nfNumero')} - Total: ${moeda(totalNF)}`);
};

window.checkPgtoNF = function() {
    const f = $v('nfPgtoForma');
    if ($('nfDivParcelas')) $('nfDivParcelas').style.display = f === 'Boleto Parcelado' ? 'block' : 'none';
};

window.exportarFinanceiro = function() {
    let csv = 'Data;Tipo;Descricao;Pagamento;Valor;Status\n';
    J.financeiro.forEach(f => {
        csv += `${dtBr(f.venc)};${f.tipo};${f.desc};${f.pgto || ''};${f.valor.toFixed(2)};${f.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `financeiro_jarvis_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
};
