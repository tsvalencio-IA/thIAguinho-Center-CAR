/**
 * thIAguinho ERP — Tabela Tempária SINDIREPA-SP
 *
 * Carrega o JSON completo e fornece busca rápida.
 * Indexação em memória para pesquisa instantânea.
 *
 * APIs públicas:
 *   - window.tempaCarregar()       → baixa JSON do GitHub Pages
 *   - window.tempaPesquisar()      → executa busca da UI (Jarvis tela)
 *   - window.tempaBuscarPorTexto() → API programática usada pela IA e pela O.S.
 *   - window.tempaSugerirTempo()   → adiciona tempo da Tabela à OS aberta
 *
 * Powered by thIAguinho Soluções Digitais
 */
(function() {
  'use strict';

  // Estado global do módulo
  const TT = {
    carregada: false,
    carregando: false,
    dados: null,         // { _metadata, sistemas, itens }
    indice: null,        // mapa palavra-chave → array de itens (busca rápida)
    erro: null
  };
  window._tabelaTempa = TT;

  // ───────────────────────────────────────────────────────────────
  // CARREGAMENTO LAZY (só baixa quando o gestor abre a aba)
  // ───────────────────────────────────────────────────────────────
  window.tempaCarregar = async function() {
    if (TT.carregada || TT.carregando) return TT.dados;
    TT.carregando = true;
    try {
      // Tenta primeiro a versão minificada (mais rápida)
      const resp = await fetch('data/tabela-tempa.min.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      TT.dados = await resp.json();
      TT.carregada = true;
      _construirIndice(TT.dados.itens);
      console.log('[TabelaTempa] Carregada:', TT.dados._metadata.totalItens, 'itens');
      return TT.dados;
    } catch (e) {
      TT.erro = e.message;
      console.error('[TabelaTempa] Falha ao carregar:', e);
      throw e;
    } finally {
      TT.carregando = false;
    }
  };

  function _construirIndice(itens) {
    // Tokeniza tudo em minúsculas removendo acentos para busca rápida
    TT.indice = itens.map(it => ({
      ref: it,
      busca: _norm(it.sistema) + ' ' + _norm(it.operacao) + ' ' + _norm(it.item) + ' ' + it.codigo
    }));
  }

  function _norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // remove acentos
      .replace(/[^a-z0-9 ]/g, ' ')        // remove pontuação
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _preferenciasSistemaVeiculo(veiculo) {
    const txt = _norm([
      veiculo?.tipo,
      veiculo?.marca,
      veiculo?.modelo,
      veiculo?.combustivel,
      veiculo?.obs
    ].filter(Boolean).join(' '));
    if (/\b(onibus|microonibus|caminhao|caminhoes|truck|carreta)\b/.test(txt)) return ['caminhao', 'onibus', 'microonibus'];
    if (/\b(suv|duster|tracker|renegade|compass|ecosport|hr v|hrv|t cross|tcross|nivus)\b/.test(txt)) return ['suv'];
    if (/\b(utilitario|saveiro|strada|fiorino|montana|oro ch|oroch|kangoo|doblo|van)\b/.test(txt)) return ['utilitario'];
    if (/\b(sedan|voyage|virtus|prisma|cobalt|corolla|civic|versa|logan|city)\b/.test(txt)) return ['sedan', 'hatch', 'compacto'];
    if (/\b(gol|up|mobi|kwid|uno|ka|celta|clio|fox|march|hb20|argo|onix|polo|sandero)\b/.test(txt)) return ['compacto', 'hatch', 'automovel'];
    return ['compacto', 'hatch', 'sedan', 'automovel'];
  }

  // ───────────────────────────────────────────────────────────────
  // API DE BUSCA (programática — usada pela IA e pela OS)
  // ───────────────────────────────────────────────────────────────
  window.tempaBuscarPorTexto = function(texto, opts) {
    if (!TT.carregada || !TT.indice) return [];
    opts = opts || {};
    const limite = opts.limite == null ? 0 : Number(opts.limite || 0);
    const sistemaFiltro = opts.sistema || '';
    const preferenciasVeiculo = opts.veiculo ? _preferenciasSistemaVeiculo(opts.veiculo) : [];
    const stop = new Set(['servico','servicos','troca','trocar','substituir','remover','instalar','retirar','colocar','de','da','do','das','dos','em','para','com','sem','uma','um','e']);
    const termos = _norm(texto).split(' ').filter(t => t.length >= 3 && !stop.has(t));
    if (termos.length === 0 && !sistemaFiltro) return [];

    const resultados = [];
    for (const entry of TT.indice) {
      // Filtro por sistema se especificado
      if (sistemaFiltro && entry.ref.sistema !== sistemaFiltro) continue;
      let score = 0;
      let termScore = 0;
      for (const t of termos) {
        if (entry.busca.includes(t)) termScore += t.length;
      }
      score += termScore;
      preferenciasVeiculo.forEach((pref, idx) => {
        if (entry.busca.includes(pref)) score += Math.max(6, 22 - (idx * 4));
      });
      if (preferenciasVeiculo.includes('compacto') && /\b(caminhao|onibus|microonibus|utilitario|suv)\b/.test(entry.busca)) score -= 18;
      const frase = _norm(texto);
      if (frase && entry.busca.includes(frase)) score += 50;
      if (termScore > 0 || (!termos.length && sistemaFiltro)) {
        resultados.push({ item: entry.ref, score });
      }
    }
    const ordenados = resultados
      .sort((a, b) => b.score - a.score || a.item.item.length - b.item.item.length);
    return (limite > 0 ? ordenados.slice(0, limite) : ordenados).map(r => r.item);
  };

  // ───────────────────────────────────────────────────────────────
  // UI DA TELA TABELA TEMPÁRIA NO JARVIS
  // ───────────────────────────────────────────────────────────────
  window.tempaInicializarTela = async function() {
    const tbody = document.getElementById('tempaTbody');
    const cont = document.getElementById('tempaContador');
    const sel = document.getElementById('tempaSistema');
    if (!tbody) return;

    if (!TT.carregada) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--cyan);">⏳ Carregando Tabela Tempária SINDIREPA-SP completa...</td></tr>';
      try {
        await window.tempaCarregar();
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger);">⚠ Erro ao carregar: ${e.message}<br><small>Verifique se o arquivo data/tabela-tempa.min.json está no GitHub Pages.</small></td></tr>`;
        if (cont) cont.textContent = 'Erro';
        return;
      }
    }

    if (cont) cont.textContent = `${TT.dados._metadata.totalItens.toLocaleString('pt-BR')} itens · ${TT.dados._metadata.totalSistemas} sistemas`;

    // Popula select de sistemas (uma vez só)
    if (sel && sel.options.length <= 1) {
      const optsHTML = ['<option value="">Todos os sistemas</option>']
        .concat(TT.dados.sistemas.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`))
        .join('');
      sel.innerHTML = optsHTML;
    }

    window.tempaPesquisar();
  };

  window.tempaPesquisar = function() {
    if (!TT.carregada) {
      window.tempaInicializarTela();
      return;
    }

    const tbody = document.getElementById('tempaTbody');
    const status = document.getElementById('tempaStatus');
    const inp = document.getElementById('tempaSearch');
    const sel = document.getElementById('tempaSistema');

    const termo = inp ? inp.value.trim() : '';
    const sistema = sel ? sel.value : '';

    let resultados;
    if (!termo && !sistema) {
      resultados = TT.dados.itens.slice(0, 100);  // primeiros 100
    } else {
      resultados = window.tempaBuscarPorTexto(termo, { sistema, limite: 200 });
    }

    if (status) {
      if (!termo && !sistema) {
        status.textContent = `Mostrando 100 itens iniciais. Use a busca para filtrar nos ${TT.dados._metadata.totalItens.toLocaleString('pt-BR')} itens.`;
      } else {
        status.textContent = `${resultados.length} resultado(s) encontrado(s)`;
      }
    }

    if (resultados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">Nenhum item encontrado. Tente outros termos.</td></tr>`;
      return;
    }

    tbody.innerHTML = resultados.map(it => {
      const tempoFmt = it.tempo.toFixed(2).replace('.', ',');
      const tempoHHmm = _hToHHmm(it.tempo);
      return `<tr>
        <td><span class="pill pill-cyan" style="font-family:var(--fm);font-size:0.65rem;">${_esc(it.codigo)}</span></td>
        <td style="font-size:0.78rem;color:var(--text);">${_esc(it.sistema)}</td>
        <td><span style="font-family:var(--fm);font-size:0.7rem;color:var(--warn);">${_esc(it.operacao)}</span></td>
        <td style="font-size:0.8rem;">${_esc(it.item)}</td>
        <td style="text-align:right;font-family:var(--fm);font-weight:700;color:var(--success);">${tempoFmt}h<br><small style="color:var(--muted);font-weight:400;">${tempoHHmm}</small></td>
        <td style="text-align:center;">
          <button class="btn-ghost" style="font-size:0.65rem;padding:5px 10px;" onclick='window.tempaCopiarItem(${JSON.stringify(it).replace(/'/g, "&apos;")})' title="Copiar para a área de transferência">📋</button>
        </td>
      </tr>`;
    }).join('');
  };

  // ───────────────────────────────────────────────────────────────
  // FERRAMENTAS AUXILIARES
  // ───────────────────────────────────────────────────────────────
  window.tempaCopiarItem = function(it) {
    const txt = `${it.sistema} | ${it.operacao} | ${it.item} | ${it.tempo.toFixed(2).replace('.', ',')}h`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        if (window.toast) window.toast('✓ Item copiado: ' + txt.substring(0, 60), 'ok');
      });
    } else {
      if (window.toast) window.toast('Item: ' + txt, 'ok');
    }
  };

  // ───────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COM A IA — chamada quando o gestor pergunta tempo
  // Detecta intenções tipo "quanto tempo para trocar pastilha"
  // e devolve resposta enriquecida com dados reais da tabela.
  // ───────────────────────────────────────────────────────────────
  window.tempaConsultarParaIA = async function(textoPergunta) {
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) { return null; }
    }
    const resultados = window.tempaBuscarPorTexto(textoPergunta, { limite: 8 });
    if (resultados.length === 0) return null;
    return {
      total: resultados.length,
      itens: resultados,
      resumo: resultados.map(it =>
        `• [${it.codigo}] ${it.operacao} ${it.item} (${it.sistema}): ${it.tempo.toFixed(2).replace('.', ',')}h`
      ).join('\n')
    };
  };

  const _inlineTimers = new WeakMap();

  async function _garantirTempaCarregada() {
    if (TT.carregada) return true;
    try { await window.tempaCarregar(); return true; }
    catch(e) { if (window.toast) window.toast('Tabela Temparia nao carregou.', 'err'); return false; }
  }

  function _ehViaturaOS() {
    return typeof window._osClienteGovernamental === 'function' && window._osClienteGovernamental();
  }

  function _veiculoOS() {
    return typeof window._osVeiculoAtual === 'function' ? window._osVeiculoAtual() : {};
  }

  function _secaoItemOS(item) {
    const UOS = window.JOS || window.JarvisOSUtils || {};
    return _ehViaturaOS() && UOS.inferPMSPValorHora ? UOS.inferPMSPValorHora(item, { veiculo: _veiculoOS() }) : null;
  }

  function _aplicarItemTempaNaLinha(row, item, opts) {
    if (!row || !item) return false;
    const op = opts || {};
    const inputDesc = row.querySelector('.serv-desc');
    const inputTempo = row.querySelector('.serv-tempo');
    const inputValor = row.querySelector('.serv-valor');
    const inputHora = row.querySelector('.serv-valor-hora');
    const UOS = window.JOS || window.JarvisOSUtils || {};
    const secaoInfo = _secaoItemOS(item);
    const valorHoraPadrao = (UOS.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(
      window._tempaValorHora || window._osValorHoraCliente?.() || window.J?.valorHoraMecanica || 120
    );

    if (inputDesc) inputDesc.value = `${item.operacao} ${item.item}`.trim();
    if (inputTempo) inputTempo.value = item.tempo.toFixed(2).replace('.', ',');

    row.dataset.tempoTabela = item.tempo;
    row.dataset.codigoTabela = item.codigo;
    row.dataset.sistemaTabela = item.sistema;
    row.dataset.tempaManual = '';

    if (_ehViaturaOS()) {
      if (secaoInfo && typeof window.aplicarSecaoMaoObraOS === 'function') {
        window.aplicarSecaoMaoObraOS(row, secaoInfo.key, { recalcular: true });
      } else {
        if (typeof window.aplicarSecaoMaoObraOS === 'function') window.aplicarSecaoMaoObraOS(row, '', { recalcular: false });
        if (inputHora && row.dataset.valorHoraManual !== '1') inputHora.value = '';
        if (inputValor && row.dataset.valorManual !== '1') inputValor.value = '0,00';
      }
      row.dataset.secaoHora = secaoInfo?.key || '';
      row.dataset.secaoHoraLabel = secaoInfo?.label || '';
      row.dataset.valorHoraSecao = secaoInfo?.valor || '';
    } else if (op.aplicarValor !== false && inputValor) {
      const atual = (UOS.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(inputValor.value || 0);
      if (inputHora && row.dataset.valorHoraManual !== '1') inputHora.value = valorHoraPadrao.toFixed(2).replace('.', ',');
      if (atual <= 0 || op.forcarValor) inputValor.value = (item.tempo * valorHoraPadrao).toFixed(2).replace('.', ',');
    }

    if (typeof window.atualizarValorServicoPorHora === 'function' && inputHora) {
      window.atualizarValorServicoPorHora(row);
    }
    if (typeof window.calcOSTotal === 'function') window.calcOSTotal();
    return true;
  }

  function _marcarLinhaManual(row) {
    if (!row) return;
    row.dataset.tempaManual = '1';
    row.querySelector('.tempa-inline-box')?.remove();
    if (typeof window.aplicarSecaoMaoObraOS === 'function') window.aplicarSecaoMaoObraOS(row, '', { recalcular: true });
  }

  window.tempaSugerirInlineOS = async function(row) {
    if (!row || row.dataset.tempaManual === '1') return;
    const input = row.querySelector('.serv-desc');
    const termo = (input?.value || '').trim();
    row.querySelector('.tempa-inline-box')?.remove();
    if (termo.length < 3) return;
    if (!await _garantirTempaCarregada()) return;

    const resultados = window.tempaBuscarPorTexto(termo, { veiculo: _veiculoOS() });
    const box = document.createElement('div');
    box.className = 'tempa-inline-box';
    if (!resultados.length) {
      box.innerHTML = `<button type="button" class="tempa-inline-option tempa-inline-none" data-tempa-none="1">
        <span>Nenhuma alternativa - manter manual</span><small>Voce continua preenchendo TMO, secao e valor na OS</small>
      </button>`;
    } else {
      box.innerHTML = `
        ${resultados.map((it, idx) => {
          const secao = _secaoItemOS(it);
          const secaoTxt = _ehViaturaOS()
            ? (secao ? `${_esc(secao.label)} - R$ ${Number(secao.valor || 0).toFixed(2).replace('.', ',')}/h` : 'Sem secao oficial automatica')
            : `${it.tempo.toFixed(2).replace('.', ',')}h`;
          return `<button type="button" class="tempa-inline-option" data-tempa-idx="${idx}">
            <span><b>${_esc(it.operacao)} ${_esc(it.item)}</b><br><small>${_esc(it.sistema)} - cod. ${_esc(it.codigo)} - ${_esc(secaoTxt)}</small></span>
            <strong>${it.tempo.toFixed(2).replace('.', ',')}h</strong>
          </button>`;
        }).join('')}
        <button type="button" class="tempa-inline-option tempa-inline-none" data-tempa-none="1">
          <span>Nenhuma alternativa - preencher manualmente</span><small>Nao aplica nenhuma sugestao nesta linha</small>
        </button>`;
    }
    box._tempaResultados = resultados;
    row.appendChild(box);
  };

  document.addEventListener('input', ev => {
    const alvo = ev.target;
    if (!alvo?.classList?.contains('serv-desc')) return;
    const row = alvo.closest('#containerServicosOS > div');
    if (!row) return;
    clearTimeout(_inlineTimers.get(row));
    const timer = setTimeout(() => window.tempaSugerirInlineOS(row), 280);
    _inlineTimers.set(row, timer);
  });

  document.addEventListener('click', ev => {
    const btn = ev.target.closest?.('[data-tempa-idx],[data-tempa-none]');
    if (btn) {
      const box = btn.closest('.tempa-inline-box');
      const row = box?.closest('#containerServicosOS > div');
      if (btn.dataset.tempaNone) {
        _marcarLinhaManual(row);
        if (window.toast) window.toast('Linha mantida para preenchimento manual.', 'ok');
        return;
      }
      const item = box?._tempaResultados?.[parseInt(btn.dataset.tempaIdx, 10)];
      if (_aplicarItemTempaNaLinha(row, item, { aplicarValor: true, forcarValor: false })) {
        box.remove();
        if (window.toast) window.toast('Sugestao da Tabela aplicada.', 'ok');
      }
      return;
    }
    if (!ev.target.closest?.('.tempa-inline-box') && !ev.target.closest?.('.serv-desc')) {
      document.querySelectorAll('.tempa-inline-box').forEach(el => el.remove());
    }
  });

  // ───────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COM A O.S. — Modal único com seleção por serviço
  // ───────────────────────────────────────────────────────────────
  // Comportamento:
  //   1. Lê todos os serviços lançados na OS
  //   2. Para CADA serviço, faz uma busca na Tabela e mostra TODAS as ocorrências
  //   3. Gestor seleciona qual usar via radio button
  //   4. Checkbox global: "Aplicar valor da hora-mecânica?" (default: ligado)
  //   5. Se aplicar: preenche TMO+valor (tempo × R$/h)
  //   6. Se não aplicar (cliente governo): preenche só horas, valor fica em branco
  //   7. Se não encontrou nada na Tabela: deixa o serviço como está
  // ───────────────────────────────────────────────────────────────
  window.tempaSugerirParaOS = async function() {
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) {
        if (window.toast) window.toast('⚠ Tabela Tempária não carregou. Verifique se data/tabela-tempa.min.json está no GitHub Pages.', 'err');
        return;
      }
    }

    // 1. Lê serviços lançados
    const linhas = document.querySelectorAll('#containerServicosOS > div');
    if (linhas.length === 0) {
      if (window.toast) window.toast('⚠ Adicione pelo menos um serviço antes de sugerir tempos.', 'warn');
      return;
    }

    // 2. Detecta tipo de cliente e valor/hora do cadastro do cliente/oficina
    const ehViatura = window._osClienteGovernamental && window._osClienteGovernamental();
    const dadosGov = ehViatura && window._osDadosGovernamental ? window._osDadosGovernamental() : null;
    const valorHoraOficina = (window.JOS?.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(
      dadosGov?.valorHora || window.J?.valorHoraMecanica || 120
    );
    const UOS = window.JOS || window.JarvisOSUtils || {};
    const veiculoAtual = window._osVeiculoAtual ? window._osVeiculoAtual() : {};
    const fmtHora = v => (UOS.parseNumberBR ? UOS.parseNumberBR(v) : parseFloat(String(v || 0).replace(',', '.')) || 0).toFixed(2).replace('.', ',');
    const secaoPorItem = it => ehViatura && UOS.inferPMSPValorHora ? UOS.inferPMSPValorHora(it, { veiculo: veiculoAtual }) : null;

    // 3. Para cada linha, busca na Tabela
    const buscas = [];
    linhas.forEach((row, idx) => {
      const inputDesc = row.querySelector('.serv-desc');
      const inputValor = row.querySelector('.serv-valor');
      if (!inputDesc) return;
      const desc = (inputDesc.value || '').trim();
      if (!desc) return;
      const resultados = window.tempaBuscarPorTexto(desc, { veiculo: veiculoAtual });
      buscas.push({
        idx,
        rowEl: row,
        descOriginal: desc,
          valorAtual: (window.JOS?.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(inputValor?.value || 0),
        resultados
      });
    });

    if (buscas.length === 0) {
      if (window.toast) window.toast('Nenhum serviço com descrição.', 'warn');
      return;
    }

    // 4. Monta modal único
    let modal = document.getElementById('modalTempaSugest');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalTempaSugest';
      modal.className = 'overlay';
      document.body.appendChild(modal);
    }

    const seccoesHTML = buscas.map((b, i) => {
      if (b.resultados.length === 0) {
        return `<div class="tempa-sec" style="margin-bottom:18px;padding:12px;background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.25);border-radius:4px;">
          <div style="font-family:var(--fm);font-size:0.7rem;color:var(--warn);margin-bottom:4px;">⚠ SERVIÇO ${i+1} — NÃO ENCONTRADO NA TABELA</div>
          <div style="font-size:0.85rem;color:var(--text);">"${_esc(b.descOriginal)}"</div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:6px;font-style:italic;">Permanece como está, edite manualmente.</div>
        </div>`;
      }

      const opcoes = `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.28);border-radius:3px;margin-bottom:6px;cursor:pointer;font-size:0.78rem;">
            <input type="radio" name="tempaSel${i}" value="__none__" style="cursor:pointer;flex-shrink:0;">
            <div style="flex:1;">
              <div style="color:var(--warn);font-weight:700;">Nenhuma alternativa / preencher manualmente</div>
              <small style="color:var(--muted);font-family:var(--fm);font-size:0.65rem;">Nao aplica TMO nem valor nesta linha.</small>
            </div>
          </label>
        ` + b.resultados.map((it, j) => {
        const secao = secaoPorItem(it);
        const secaoHtml = ehViatura
          ? `<br><small style="color:${secao ? 'var(--success)' : 'var(--warn)'};font-family:var(--fm);font-size:0.62rem;">${secao ? `${_esc(secao.label)} · R$ ${fmtHora(secao.valor)}/h` : 'SEM SECAO OFICIAL AUTOMATICA · usuario escolhe/preenche na OS'}</small>`
          : '';
        return `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(0,212,255,0.04);border:1px solid var(--border);border-radius:3px;margin-bottom:4px;cursor:pointer;font-size:0.78rem;">
            <input type="radio" name="tempaSel${i}" value="${j}" ${j === 0 ? 'checked' : ''} style="cursor:pointer;flex-shrink:0;">
            <div style="flex:1;">
              <div style="color:var(--text);font-weight:600;">${_esc(it.operacao)} ${_esc(it.item)}</div>
              <small style="color:var(--muted);font-family:var(--fm);font-size:0.65rem;">${_esc(it.sistema)} · cód. ${_esc(it.codigo)}</small>${secaoHtml}
            </div>
            <div style="font-family:var(--fm);font-weight:700;color:var(--success);font-size:0.85rem;text-align:right;flex-shrink:0;min-width:70px;">
              ${it.tempo.toFixed(2).replace('.', ',')}h
              <br><small style="color:var(--muted);font-weight:400;">${_hToHHmm(it.tempo)}</small>
            </div>
          </label>
        `;
      }).join('');

      return `<div class="tempa-sec" data-idx="${b.idx}" style="margin-bottom:20px;">
        <div style="font-family:var(--fm);font-size:0.75rem;color:var(--cyan);margin-bottom:6px;letter-spacing:0.5px;">
          SERVIÇO ${i+1}: <span style="color:var(--text);">"${_esc(b.descOriginal)}"</span>
        </div>
        <div style="font-size:0.65rem;color:var(--muted);margin-bottom:8px;">
          ${b.resultados.length} ocorrência(s) na Tabela — selecione a que se aplica:
        </div>
        ${opcoes}
      </div>`;
    }).join('');

    modal.innerHTML = `
      <div class="modal" style="max-width:780px;width:96%;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-head">
          <div class="modal-title">📖 SUGERIR TEMPOS — TABELA TEMPÁRIA SINDIREPA</div>
          <button class="modal-close" onclick="document.getElementById('modalTempaSugest').classList.remove('open')">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:18px;">
          <div style="background:${ehViatura ? 'rgba(167,139,250,0.08)' : 'rgba(0,212,255,0.06)'};border:1px solid ${ehViatura ? 'var(--purple, #A78BFA)' : 'var(--cyan)'};border-radius:4px;padding:12px;margin-bottom:18px;">
            ${ehViatura ?
              `<div style="font-family:var(--fm);font-size:0.7rem;color:var(--purple,#A78BFA);font-weight:700;margin-bottom:6px;">🛡 CLIENTE GOVERNAMENTAL DETECTADO</div>
              <div style="font-size:0.78rem;color:var(--text);line-height:1.5;">
                Este orçamento é para viatura/órgão público. As horas (TMO) virão da Tabela Tempária e o valor/hora será sugerido pela seção oficial PMSP quando houver correspondência. Se não houver seção segura, fica sem seleção para preenchimento manual na O.S.
              </div>` :
              `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" id="tempaAplicarValor" checked style="width:18px;height:18px;cursor:pointer;">
                <div>
                  <div style="font-family:var(--fm);font-size:0.7rem;color:var(--cyan);font-weight:700;">APLICAR VALOR DA HORA-MECÂNICA: R$ ${valorHoraOficina.toFixed(2)}/h</div>
                  <div style="font-size:0.7rem;color:var(--muted);margin-top:2px;">
                    Desmarque se este serviço usa tabela externa de preços (você preenche depois manualmente).
                  </div>
                </div>
              </label>`
            }
          </div>

          ${seccoesHTML}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="document.getElementById('modalTempaSugest').classList.remove('open')">CANCELAR</button>
          <button class="btn-primary" onclick="window._tempaAplicarSelecionados()">✓ APLICAR SELECIONADOS</button>
        </div>
      </div>
    `;

    // Guarda dados pra aplicação
    window._tempaBuscasAtivas = buscas;
    window._tempaEhViatura = ehViatura;
    window._tempaValorHora = valorHoraOficina;
    window._tempaVeiculoAtual = veiculoAtual;

    modal.classList.add('open');
  };

  // Aplica as seleções escolhidas pelo usuário
  window._tempaAplicarSelecionados = function() {
    const buscas = window._tempaBuscasAtivas || [];
    const ehViatura = window._tempaEhViatura;
    const valorHora = window._tempaValorHora;
    const aplicarValor = ehViatura ? true : (document.getElementById('tempaAplicarValor')?.checked ?? true);

    let aplicados = 0;
    let semOpcao = 0;
    let semSecao = 0;

    buscas.forEach((b, i) => {
      if (b.resultados.length === 0) {
        semOpcao++;
        return;
      }
      const sel = document.querySelector(`input[name="tempaSel${i}"]:checked`);
      if (!sel) return;
      if (sel.value === '__none__') {
        semOpcao++;
        b.rowEl.dataset.tempaManual = '1';
        return;
      }
      const itemEscolhido = b.resultados[parseInt(sel.value)];
      if (!itemEscolhido) return;

      const inputDesc = b.rowEl.querySelector('.serv-desc');
      const inputValor = b.rowEl.querySelector('.serv-valor');
      const inputTempo = b.rowEl.querySelector('.serv-tempo'); // novo campo TMO
      const inputHora = b.rowEl.querySelector('.serv-valor-hora');

      // P5: substitui descrição com nome oficial da Tabela (editável depois)
      if (inputDesc) {
        inputDesc.value = itemEscolhido.operacao + ' ' + itemEscolhido.item;
      }
      // Preenche TMO (horas) sempre
      if (inputTempo) {
        inputTempo.value = itemEscolhido.tempo.toFixed(2).replace('.', ',');
      }
      const UOS = window.JOS || window.JarvisOSUtils || {};
      const secaoInfo = ehViatura && UOS.inferPMSPValorHora ? UOS.inferPMSPValorHora(itemEscolhido, { veiculo: window._tempaVeiculoAtual || {} }) : null;

      if (ehViatura) {
        if (secaoInfo && typeof window.aplicarSecaoMaoObraOS === 'function') {
          window.aplicarSecaoMaoObraOS(b.rowEl, secaoInfo.key, { recalcular: true });
        } else {
          semSecao++;
          if (typeof window.aplicarSecaoMaoObraOS === 'function') window.aplicarSecaoMaoObraOS(b.rowEl, '', { recalcular: false });
          if (inputHora && b.rowEl.dataset.valorHoraManual !== '1') inputHora.value = '';
          if (inputValor && b.rowEl.dataset.valorManual !== '1') inputValor.value = '0,00';
        }
      } else if (aplicarValor && inputValor) {
        // Só sobrescreve se está zerado (não machuca valor manual)
        const atual = (window.JOS?.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(inputValor.value || 0);
        if (atual <= 0) {
          inputValor.value = (itemEscolhido.tempo * valorHora).toFixed(2).replace('.', ',');
        }
      }
      // Garante metadados da tabela para exportação/detalhamento
      b.rowEl.dataset.tempoTabela = itemEscolhido.tempo;
      b.rowEl.dataset.codigoTabela = itemEscolhido.codigo;
      b.rowEl.dataset.sistemaTabela = itemEscolhido.sistema;
      b.rowEl.dataset.secaoHora = secaoInfo?.key || b.rowEl.dataset.secaoHora || '';
      b.rowEl.dataset.secaoHoraLabel = secaoInfo?.label || b.rowEl.dataset.secaoHoraLabel || '';
      b.rowEl.dataset.valorHoraSecao = secaoInfo?.valor || b.rowEl.dataset.valorHoraSecao || '';

      aplicados++;
    });

    if (typeof window.calcOSTotal === 'function') window.calcOSTotal();

    if (aplicados > 0) {
      const txt = ehViatura
        ? `✓ ${aplicados} serviço(s) com TMO aplicado. Valor/hora oficial preenchido quando a seção foi identificada.`
        : (aplicarValor
          ? `✓ ${aplicados} serviço(s) preenchido(s) com TMO + valor (R$ ${valorHora.toFixed(2)}/h)`
          : `✓ ${aplicados} serviço(s) com TMO preenchido. Valores em branco para preenchimento manual.`);
      if (window.toast) window.toast(txt, 'ok');
    }
    if (semOpcao > 0 && window.toast) {
      window.toast(`⚠ ${semOpcao} serviço(s) não encontrado(s) na Tabela. Permaneceram editáveis.`, 'warn');
    }
    if (semSecao > 0 && window.toast) {
      window.toast(`⚠ ${semSecao} serviço(s) ficaram sem seção oficial automática. Selecione ou preencha manualmente na O.S.`, 'warn');
    }

    document.getElementById('modalTempaSugest').classList.remove('open');
  };

  // Reseta valor da hora (caso queira mudar)
  window.tempaResetarValorHora = function() {
    sessionStorage.removeItem('thiaguinho_valorHoraMec');
    if (window.toast) window.toast('Valor da hora resetado.', 'ok');
  };

  // ───────────────────────────────────────────────────────────────
  // UTILS
  // ───────────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function _hToHHmm(h) {
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (hh === 0) return `${mm}min`;
    if (mm === 0) return `${hh}h`;
    return `${hh}h${String(mm).padStart(2, '0')}`;
  }

  // Auto-init quando alguém clica no menu Tabela Tempária
  if (typeof window.ir === 'function' && !window._irOriginalTempa) {
    window._irOriginalTempa = window.ir;
    window.ir = function(rota, el) {
      window._irOriginalTempa(rota, el);
      if (rota === 'tabelatempa') setTimeout(window.tempaInicializarTela, 50);
    };
  }

  // ───────────────────────────────────────────────────────────────
  // NOVO: SUGESTÕES POR PEÇA IMPORTADA DO CÍLIA
  // ───────────────────────────────────────────────────────────────
  // Quando a OS possui peças importadas do Cília (identificadas por
  // data-cilia-piece-index), este fluxo apresenta um modal listando
  // cada peça em modo colapsado. Para cada uma, o gestor pode selecionar
  // um serviço da Tabela Tempária adequado à troca daquela peça ou optar
  // por não aplicar nenhuma sugestão e permanecer com a descrição manual.
  //
  // Requisitos:
  //   • Não altera lógica existente de serviços; apenas substitui a
  //     descrição e tempos das linhas de serviço vinculadas às peças
  //     importadas quando o usuário confirmar a seleção.
  //   • Mantém campos de valor/hora e valor manual editáveis conforme
  //     já implementado no fluxo original.
  //
  // API pública:
  //   - window.tempaSugerirParaPecas()
  //   - window._tempaAplicarPecaSelecionadas()

  window.tempaSugerirParaPecas = async function() {
    // Garante que a Tabela esteja carregada
    if (!TT.carregada) {
      try { await window.tempaCarregar(); }
      catch(e) {
        if (window.toast) window.toast('⚠ Tabela Tempária não carregou. Verifique se data/tabela-tempa.min.json está disponível.', 'err');
        return;
      }
    }
    // Localiza todas as peças importadas do Cília na OS atual
    const pecaEls = Array.from(document.querySelectorAll('#containerPecasOS > div[data-cilia-piece-index]'));
    if (pecaEls.length === 0) {
      // Sem peças para sugerir
      if (window.toast) window.toast('Nenhuma peça importada do Cília encontrada para sugerir serviços.', 'warn');
      return;
    }
    // Determina contexto da OS (governamental ou particular)
    const ehViatura = window._osClienteGovernamental && window._osClienteGovernamental();
    const dadosGov = ehViatura && window._osDadosGovernamental ? window._osDadosGovernamental() : null;
    const valorHoraOficina = (window.JOS?.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(
      dadosGov?.valorHora || window.J?.valorHoraMecanica || 120
    );
    const UOS = window.JOS || window.JarvisOSUtils || {};
    const veiculoAtual = window._osVeiculoAtual ? window._osVeiculoAtual() : {};
    const fmtHora = v => (UOS.parseNumberBR ? UOS.parseNumberBR(v) : parseFloat(String(v || 0).replace(',', '.')) || 0).toFixed(2).replace('.', ',');

    // Para cada peça, executa uma busca na Tabela com base na descrição
    const buscas = pecaEls.map((div, idx) => {
      const idxPeca = div.dataset.ciliaPieceIndex;
      const descInput = div.querySelector('.peca-desc-livre');
      const desc = (descInput?.value || '').trim();
      // Adiciona prefixo "troca" para priorizar operações de troca na busca
      // Limita a busca a até 5 sugestões por peça para melhorar desempenho e evitar sobrecarregar o navegador.
      const resultados = desc ? window.tempaBuscarPorTexto('troca ' + desc, { veiculo: veiculoAtual, limite: 5 }) : [];
      return {
        idx,               // posição na lista
        ciliaIdx: idxPeca, // string com o índice dessa peça
        descOriginal: desc,
        resultados
      };
    });

    // Monta HTML das seções (cada peça em <details>)
    const seccoesHTML = buscas.map((b, i) => {
      // Cabeçalho para a peça
      const header = `<summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.3);border-radius:3px;">
        <span style="font-family:var(--fm);font-size:0.75rem;color:var(--success);font-weight:700;">PEÇA ${i+1}: <span style="color:var(--text);font-weight:600;">\"${_esc(b.descOriginal)}\"</span></span>
        <span style="font-family:var(--fm);font-size:0.65rem;color:var(--muted);">${b.resultados.length ? b.resultados.length + ' opção(ões)' : 'Nenhuma opção'}</span>
      </summary>`;
      // Corpo com opções
      let corpo = '';
      if (!b.resultados.length) {
        corpo = `<div style="padding:12px;border:1px solid rgba(255,184,0,0.25);border-radius:3px;margin-top:6px;background:rgba(255,184,0,0.06);font-size:0.8rem;color:var(--warn);">
          Nenhum serviço correspondente encontrado na Tabela para esta peça.<br>
          <small style="color:var(--muted);font-family:var(--fm);font-size:0.65rem;">Permanece como está, você pode editar manualmente a descrição da peça ou seu serviço associado.</small>
        </div>`;
      } else {
        // Opção de não aplicar
        let opcoes = `
        <label style="display:flex;align-items:flex-start;gap:10px;padding:8px;background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.28);border-radius:3px;margin-bottom:6px;cursor:pointer;font-size:0.78rem;">
          <input type="radio" name="tempaPecaSel${i}" value="__none__" style="cursor:pointer;margin-top:3px;">
          <div style="flex:1;">
            <div style="color:var(--warn);font-weight:700;">Nenhuma alternativa / preencher manualmente</div>
            <small style="color:var(--muted);font-family:var(--fm);font-size:0.65rem;">Não aplica TMO nem valor nesta linha de serviço</small>
          </div>
        </label>`;
        opcoes += b.resultados.map((it, j) => {
          const secao = ehViatura && UOS.inferPMSPValorHora ? UOS.inferPMSPValorHora(it, { veiculo: veiculoAtual }) : null;
          const secaoHtml = ehViatura
            ? `<br><small style="color:${secao ? 'var(--success)' : 'var(--warn)'};font-family:var(--fm);font-size:0.62rem;">${secao ? `${_esc(secao.label)} · R$ ${fmtHora(secao.valor)}/h` : 'SEM SEÇÃO OFICIAL AUTOMÁTICA'}</small>`
            : '';
          return `
          <label style="display:flex;align-items:flex-start;gap:10px;padding:8px;background:rgba(0,212,255,0.04);border:1px solid var(--border);border-radius:3px;margin-bottom:4px;cursor:pointer;font-size:0.78rem;">
            <input type="radio" name="tempaPecaSel${i}" value="${j}" ${j === 0 ? 'checked' : ''} style="cursor:pointer;margin-top:3px;">
            <div style="flex:1;">
              <div style="color:var(--text);font-weight:600;">${_esc(it.operacao)} ${_esc(it.item)}</div>
              <small style="color:var(--muted);font-family:var(--fm);font-size:0.65rem;">${_esc(it.sistema)} · cód. ${_esc(it.codigo)}</small>${secaoHtml}
            </div>
            <div style="font-family:var(--fm);font-weight:700;color:var(--success);font-size:0.85rem;text-align:right;flex-shrink:0;min-width:70px;">
              ${it.tempo.toFixed(2).replace('.', ',')}h
              <br><small style="color:var(--muted);font-weight:400;">${_hToHHmm(it.tempo)}</small>
            </div>
          </label>`;
        }).join('');
        corpo = `<div style="margin-top:8px;">${opcoes}</div>`;
      }
      return `<details class="tempa-peca-sec" data-idx="${b.idx}" data-cilia-idx="${_esc(b.ciliaIdx)}" style="margin-bottom:16px;">${header}${corpo}</details>`;
    }).join('');

    // Cria ou reutiliza modal de sugestões por peça
    let modal = document.getElementById('modalTempaPecaSugest');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalTempaPecaSugest';
      modal.className = 'overlay';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal" style="max-width:800px;width:96%;max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-head">
          <div class="modal-title">🧰 SUGERIR SERVIÇOS POR PEÇA — TABELA TEMPÁRIA</div>
          <button class="modal-close" onclick="document.getElementById('modalTempaPecaSugest').classList.remove('open')">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:18px;">
          <div style="background:${ehViatura ? 'rgba(167,139,250,0.08)' : 'rgba(0,255,136,0.06)'};border:1px solid ${ehViatura ? 'var(--purple,#A78BFA)' : 'var(--success)'};border-radius:4px;padding:12px;margin-bottom:18px;">
            ${ehViatura ?
              `<div style="font-family:var(--fm);font-size:0.7rem;color:var(--purple,#A78BFA);font-weight:700;margin-bottom:6px;">🛡 CLIENTE GOVERNAMENTAL</div>
              <div style="font-size:0.78rem;color:var(--text);line-height:1.5;">
                Para cada peça importada, escolha o serviço adequado. O tempo de mão de obra (TMO) virá da Tabela Tempária e o valor/hora será sugerido pela seção oficial PMSP quando houver correspondência. Se não houver seção, o valor ficará em branco para preenchimento manual.
              </div>` :
              `<div style="font-family:var(--fm);font-size:0.7rem;color:var(--success);font-weight:700;margin-bottom:6px;">⚙ CLIENTE PARTICULAR</div>
              <div style="font-size:0.78rem;color:var(--text);line-height:1.5;">
                Para cada peça importada, escolha o serviço adequado. O tempo de mão de obra (TMO) virá da Tabela Tempária. Se desejar, o valor será calculado multiplicando o TMO por R$ ${valorHoraOficina.toFixed(2)}/h. Desmarque abaixo se não quiser aplicar valores automaticamente.
              </div>
              <label style="display:flex;align-items:center;gap:10px;margin-top:10px;">
                <input type="checkbox" id="tempaPecaAplicarValor" checked style="width:18px;height:18px;cursor:pointer;">
                <span style="font-family:var(--fm);font-size:0.65rem;color:var(--muted);">Aplicar valor (TMO × R$/h) automaticamente</span>
              </label>`
            }
          </div>
          ${seccoesHTML}
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="document.getElementById('modalTempaPecaSugest').classList.remove('open')">CANCELAR</button>
          <button class="btn-primary" onclick="window._tempaAplicarPecaSelecionadas()">✓ APLICAR SELECIONADOS</button>
        </div>
      </div>
    `;

    // Guarda dados para aplicação posterior
    window._tempaPecaBuscasAtivas = buscas;
    window._tempaPecaEhViatura = ehViatura;
    window._tempaPecaValorHora = valorHoraOficina;
    window._tempaPecaVeiculoAtual = veiculoAtual;

    modal.classList.add('open');
  };

  window._tempaAplicarPecaSelecionadas = function() {
    const buscas = window._tempaPecaBuscasAtivas || [];
    const ehViatura = window._tempaPecaEhViatura;
    const valorHora = window._tempaPecaValorHora;
    const aplicarValor = ehViatura ? true : (document.getElementById('tempaPecaAplicarValor')?.checked ?? true);

    let aplicados = 0;
    let semOpcao = 0;
    let semSecao = 0;

    buscas.forEach((b, i) => {
      // Recupera radio selecionado
      const sel = document.querySelector(`input[name="tempaPecaSel${i}"]:checked`);
      if (!sel) return;
      // Localiza linha de serviço associada a esta peça, via data-cilia-piece-index
      const servRow = document.querySelector(`#containerServicosOS > div[data-cilia-piece-index="${b.ciliaIdx}"]`);
      if (!servRow) return;
      // Se nenhuma opção selecionada ou sem resultados
      if (sel.value === '__none__' || b.resultados.length === 0) {
        // Marca como manual, mantendo descrição atual
        servRow.dataset.tempaManual = '1';
        semOpcao++;
        return;
      }
      const itemEscolhido = b.resultados[parseInt(sel.value, 10)];
      if (!itemEscolhido) return;
      const inputDesc = servRow.querySelector('.serv-desc');
      const inputValor = servRow.querySelector('.serv-valor');
      const inputTempo = servRow.querySelector('.serv-tempo');
      const inputHora = servRow.querySelector('.serv-valor-hora');

      // Substitui descrição com nome oficial da Tabela (editável)
      if (inputDesc) {
        inputDesc.value = itemEscolhido.operacao + ' ' + itemEscolhido.item;
      }
      // Sempre preenche TMO
      if (inputTempo) {
        inputTempo.value = itemEscolhido.tempo.toFixed(2).replace('.', ',');
      }

      const UOSloc = window.JOS || window.JarvisOSUtils || {};
      const secaoInfo = ehViatura && UOSloc.inferPMSPValorHora ? UOSloc.inferPMSPValorHora(itemEscolhido, { veiculo: window._tempaPecaVeiculoAtual || {} }) : null;

      if (ehViatura) {
        if (secaoInfo && typeof window.aplicarSecaoMaoObraOS === 'function') {
          window.aplicarSecaoMaoObraOS(servRow, secaoInfo.key, { recalcular: true });
        } else {
          semSecao++;
          if (typeof window.aplicarSecaoMaoObraOS === 'function') window.aplicarSecaoMaoObraOS(servRow, '', { recalcular: false });
          if (inputHora && servRow.dataset.valorHoraManual !== '1') inputHora.value = '';
          if (inputValor && servRow.dataset.valorManual !== '1') inputValor.value = '0,00';
        }
      } else if (aplicarValor && inputValor) {
        // Só sobrescreve se valor atual <= 0 (não machuca valor manual)
        const atual = (window.JOS?.parseNumberBR || (v => parseFloat(String(v || 0).replace(',', '.')) || 0))(inputValor.value || 0);
        if (atual <= 0) {
          inputValor.value = (itemEscolhido.tempo * valorHora).toFixed(2).replace('.', ',');
        }
      }
      // Metadados para exportação/detalhamento
      servRow.dataset.tempoTabela = itemEscolhido.tempo;
      servRow.dataset.codigoTabela = itemEscolhido.codigo;
      servRow.dataset.sistemaTabela = itemEscolhido.sistema;
      servRow.dataset.secaoHora = secaoInfo?.key || servRow.dataset.secaoHora || '';
      servRow.dataset.secaoHoraLabel = secaoInfo?.label || servRow.dataset.secaoHoraLabel || '';
      servRow.dataset.valorHoraSecao = secaoInfo?.valor || servRow.dataset.valorHoraSecao || '';

      aplicados++;
    });

    if (typeof window.calcOSTotal === 'function') window.calcOSTotal();

    if (aplicados > 0 && window.toast) {
      const msg = ehViatura
        ? `✓ ${aplicados} peça(s) com TMO aplicado. Valor/hora oficial preenchido quando seção identificada.`
        : (aplicarValor
          ? `✓ ${aplicados} peça(s) preenchida(s) com TMO + valor (R$ ${valorHora.toFixed(2)}/h)`
          : `✓ ${aplicados} peça(s) com TMO preenchido. Valores em branco para preenchimento manual.`);
      window.toast(msg, 'ok');
    }
  };
})();

/* Powered by thIAguinho Soluções Digitais */
