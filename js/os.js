/**
 * ERP MASTER - MÓDULO DE ORDEM DE SERVIÇO (O.S) E KANBAN
 * Responsável por: Gestão do Pátio, Prontuário Médico do Veículo, Ditado por Voz e Auditoria.
 */

window.os = {
    listenerKanban: null,
    itensOSAtual: [], // Memória temporária das peças/serviços adicionados na OS aberta
    idOsAtual: null,

    /**
     * Inicializa o Kanban e começa a escutar o Firebase em Tempo Real
     */
    iniciarKanban: function(tenantId) {
        console.log("[O.S.] Iniciando Motor do Kanban...");

        if (this.listenerKanban) {
            this.listenerKanban(); // Desliga o listener antigo se existir
        }

        const colunas = {
            patio: document.getElementById('col-patio'),
            orcamento: document.getElementById('col-orcamento'),
            aprovacao: document.getElementById('col-aprovacao'),
            box: document.getElementById('col-box'),
            pronto: document.getElementById('col-pronto')
        };

        const contadores = {
            patio: document.getElementById('count-patio'),
            orcamento: document.getElementById('count-orcamento'),
            aprovacao: document.getElementById('count-aprovacao'),
            box: document.getElementById('count-box'),
            pronto: document.getElementById('count-pronto')
        };

        // Escuta TODAS as O.S que NÃO ESTÃO ENTREGUES
        this.listenerKanban = db.collection("tenants").doc(tenantId).collection("ordens_servico")
            .where("status", "!=", "entregue")
            .onSnapshot((snapshot) => {
                
                // Limpa as colunas visualmente
                Object.values(colunas).forEach(col => { if(col) col.innerHTML = ''; });
                
                // Zera os contadores temporários
                let counts = { patio: 0, orcamento: 0, aprovacao: 0, box: 0, pronto: 0 };
                let carrosAtrasados = 0;

                snapshot.forEach((doc) => {
                    const osData = doc.data();
                    osData.id = doc.id;
                    
                    const status = osData.status || 'patio';
                    counts[status]++;

                    // Identifica se é urgente/atrasado (Ex: Há mais de 3 dias no pátio)
                    let dataCriacao = osData.dataCriacao ? osData.dataCriacao.toDate() : new Date();
                    let diasParado = Math.floor((new Date() - dataCriacao) / (1000 * 60 * 60 * 24));
                    let isUrgente = diasParado > 3;
                    if(isUrgente && status !== 'pronto') carrosAtrasados++;

                    // Monta o Cartão HTML
                    const cardHTML = `
                        <div class="os-card" onclick="os.abrirModalOS('${osData.id}')" style="border-left-color: var(--status-${status});">
                            ${isUrgente ? '<div class="priority-indicator priority-vermelho" title="Atrasado/Urgente"></div>' : ''}
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="fw-bold text-white mb-1">${osData.placa}</h6>
                                    <p class="text-white-50 small mb-1 truncate" style="max-width: 180px;">${osData.veiculo}</p>
                                    <p class="text-info small mb-0"><i class="bi bi-person"></i> ${osData.clienteNome || 'Desconhecido'}</p>
                                </div>
                                <div class="text-end">
                                    <span class="badge bg-dark border border-secondary text-success">R$ ${(osData.valorTotal || 0).toFixed(2)}</span>
                                    <div class="mt-2 text-white-50 small"><i class="bi bi-clock"></i> ${diasParado}d</div>
                                </div>
                            </div>
                        </div>
                    `;

                    if (colunas[status]) {
                        colunas[status].insertAdjacentHTML('beforeend', cardHTML);
                    }
                });

                // Atualiza os badges (contadores) nas colunas
                Object.keys(counts).forEach(key => {
                    if (contadores[key]) contadores[key].textContent = counts[key];
                });

                // Atualiza o Painel Chevron de Atenção (LEDs)
                this.atualizarPainelAtencao(carrosAtrasados, counts.aprovacao);

            }, (error) => {
                console.error("[O.S.] Erro no Listener do Kanban:", error);
            });
    },

    /**
     * Lógica Chevron: Painel de Atenção no topo do Kanban
     */
    atualizarPainelAtencao: function(atrasados, aguardando) {
        const painel = document.getElementById('painel-atencao');
        if (!painel) return;

        let htmlAvisos = '';

        if (atrasados > 0) {
            htmlAvisos += `<div class="attention-box blinking-danger text-danger fw-bold d-inline-block me-3 px-4 py-2"><i class="bi bi-exclamation-triangle-fill"></i> ${atrasados} Veículo(s) com SLA atrasado!</div>`;
        }
        if (aguardando > 0) {
            htmlAvisos += `<div class="attention-box text-warning fw-bold d-inline-block px-4 py-2"><i class="bi bi-hourglass-split"></i> ${aguardando} O.S. Aguardando aprovação do cliente.</div>`;
        }

        if (htmlAvisos !== '') {
            painel.innerHTML = htmlAvisos;
            painel.classList.remove('d-none');
        } else {
            painel.classList.add('d-none');
        }
    },

    /**
     * Abre a Ficha/Prontuário. Se for nova, limpa. Se tiver ID, carrega do Firebase.
     */
    abrirModalOS: async function(id = null) {
        this.idOsAtual = id;
        this.itensOSAtual = []; // Reseta a lista de peças em memória
        
        const form = document.getElementById('form-os');
        form.reset();
        document.getElementById('os-header-placa').textContent = id ? " - Carregando..." : " - NOVA RECEPÇÃO";
        document.getElementById('tb-pecas-os').innerHTML = '';
        document.getElementById('os-total-display').textContent = 'R$ 0,00';
        document.getElementById('lista-auditoria-os').innerHTML = '';

        // Mostra a primeira aba sempre que abrir
        const triggerEl = document.querySelector('button[data-bs-target="#tab-os-checklist"]');
        bootstrap.Tab.getOrCreateInstance(triggerEl).show();

        if (id) {
            // É edição: Busca os dados
            try {
                const tenantId = window.core.session.tenantId;
                const doc = await db.collection("tenants").doc(tenantId).collection("ordens_servico").doc(id).get();
                
                if (doc.exists) {
                    const os = doc.data();
                    document.getElementById('os-header-placa').textContent = ` - ${os.placa}`;
                    document.getElementById('os-id').value = id;
                    document.getElementById('os-placa').value = os.placa || '';
                    document.getElementById('os-veiculo').value = os.veiculo || '';
                    
                    // Busca atrelada ao Cliente
                    document.getElementById('os-cliente-busca').value = os.clienteNome || '';
                    document.getElementById('os-cliente-id').value = os.clienteId || '';
                    
                    // Checklist
                    document.getElementById('os-queixa').value = os.queixa || '';
                    document.getElementById('chk-combustivel').checked = os.chkCombustivel || false;
                    document.getElementById('chk-arranhado').checked = os.chkArranhado || false;
                    document.getElementById('chk-pertences').checked = os.chkPertences || false;
                    
                    // Diagnóstico
                    document.getElementById('os-diagnostico').value = os.diagnostico || '';
                    document.getElementById('os-status').value = os.status || 'patio';
                    
                    // Peças e Serviços (Array de objetos salvo no Firebase)
                    if (os.itens && Array.isArray(os.itens)) {
                        this.itensOSAtual = os.itens;
                        this.renderizarItens();
                    }

                    // Renderiza a Timeline da Auditoria
                    if (os.auditoria && Array.isArray(os.auditoria)) {
                        this.renderizarAuditoria(os.auditoria);
                    }

                    // Exibe o botão de PDF se já estiver avançada
                    const btnPdf = document.getElementById('btn-exportar-pdf');
                    if (btnPdf) btnPdf.classList.remove('d-none');
                }
            } catch (error) {
                console.error("[O.S.] Erro ao carregar Prontuário:", error);
                window.ui.mostrarToast("Erro", "Não foi possível carregar o veículo.", "danger");
            }
        } else {
            // Oculta botão PDF em OS Nova
            const btnPdf = document.getElementById('btn-exportar-pdf');
            if (btnPdf) btnPdf.classList.add('d-none');
        }

        const modal = new bootstrap.Modal(document.getElementById('modal-os'));
        modal.show();
    },

    /**
     * Valida a busca do cliente na O.S. contra o Datalist em memória (Impede cliente fantasma)
     */
    vincularClienteBusca: function() {
        const inputTexto = document.getElementById('os-cliente-busca').value;
        const datalist = document.getElementById('lista-clientes-dl');
        const alertaErro = document.getElementById('alerta-cliente-invalido');
        const hiddenId = document.getElementById('os-cliente-id');
        
        let clienteValido = false;

        // Varre as options do datalist para ver se o que foi digitado bate com algo real
        for (let i = 0; i < datalist.options.length; i++) {
            if (datalist.options[i].value === inputTexto) {
                hiddenId.value = datalist.options[i].getAttribute('data-id');
                clienteValido = true;
                break;
            }
        }

        if (!clienteValido && inputTexto.trim() !== '') {
            alertaErro.classList.remove('d-none');
            hiddenId.value = ''; // Zera o ID pra não salvar lixo
        } else {
            alertaErro.classList.add('d-none');
        }
    },

    /**
     * PUSH-TO-TALK (Reconhecimento de Voz Nativo do Navegador)
     * Permite ao mecânico ditar o defeito sem sujar o teclado de graxa.
     */
    iniciarDitado: function() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            window.ui.mostrarToast("Não Suportado", "O seu navegador não suporta ditado por voz. Tente no Google Chrome.", "warning");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        const btn = document.querySelector('button[onclick="os.iniciarDitado()"]');
        const campoDiagnostico = document.getElementById('os-diagnostico');
        
        // Estilização do botão enquanto ouve
        btn.classList.remove('btn-outline-info');
        btn.classList.add('btn-danger');
        btn.innerHTML = '<i class="bi bi-mic-fill"></i> Ouvindo... (Fale agora)';

        recognition.start();

        recognition.onresult = function(event) {
            const textoFalado = event.results[0][0].transcript;
            // Concatena o texto falado ao que já existe na caixa de texto
            const atual = campoDiagnostico.value;
            campoDiagnostico.value = atual ? atual + " " + textoFalado : textoFalado;
            window.ui.mostrarToast("Ditado Concluído", "Texto inserido no diagnóstico.", "success");
        };

        recognition.onspeechend = function() {
            recognition.stop();
        };

        recognition.onerror = function(event) {
            console.error("Erro no reconhecimento de voz:", event.error);
            window.ui.mostrarToast("Erro no Microfone", "Não consegui ouvir. Verifique as permissões.", "danger");
            restaurarBotao();
        };

        recognition.onend = function() {
            restaurarBotao();
        };

        function restaurarBotao() {
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-outline-info');
            btn.innerHTML = '<i class="bi bi-mic-fill"></i> Ditar Diagnóstico';
        }
    },

    /**
     * ================= LÓGICA MATEMÁTICA DE PEÇAS =================
     */

    addLinhaPeca: function(descricao = '', qtd = 1, custo = 0, venda = 0) {
        // Gera um ID único e aleatório para a linha na memória
        const uid = 'item_' + Math.random().toString(36).substr(2, 9);
        this.itensOSAtual.push({
            uid: uid,
            descricao: descricao,
            qtd: qtd,
            custo: parseFloat(custo),
            venda: parseFloat(venda)
        });
        this.renderizarItens();
    },

    removerLinhaPeca: function(uid) {
        this.itensOSAtual = this.itensOSAtual.filter(item => item.uid !== uid);
        this.renderizarItens();
    },

    atualizarItemMemoria: function(uid, campo, valorElemento) {
        const item = this.itensOSAtual.find(i => i.uid === uid);
        if (item) {
            if (campo === 'descricao') {
                item.descricao = valorElemento.value;
            } else {
                item[campo] = parseFloat(valorElemento.value) || 0;
            }
            this.calcularTotalOS(); // Recalcula totais instantaneamente
        }
    },

    renderizarItens: function() {
        const tbody = document.getElementById('tb-pecas-os');
        tbody.innerHTML = '';

        this.itensOSAtual.forEach(item => {
            const tr = document.createElement('tr');
            
            // Oculta campo de Custo se o usuário for mecânico
            const dNoneCusto = window.core.session.role === 'mecanico' ? 'd-none' : '';

            tr.innerHTML = `
                <td class="ps-2"><input type="text" class="form-control form-control-sm bg-dark text-white border-secondary" value="${item.descricao}" onchange="os.atualizarItemMemoria('${item.uid}', 'descricao', this)" placeholder="Filtro de óleo, Mão de Obra..."></td>
                <td><input type="number" class="form-control form-control-sm bg-dark text-white border-secondary text-center" value="${item.qtd}" min="1" onchange="os.atualizarItemMemoria('${item.uid}', 'qtd', this)"></td>
                <td class="${dNoneCusto}"><input type="number" class="form-control form-control-sm bg-dark text-warning border-secondary" value="${item.custo.toFixed(2)}" onchange="os.atualizarItemMemoria('${item.uid}', 'custo', this)"></td>
                <td><input type="number" class="form-control form-control-sm bg-dark text-success border-secondary fw-bold" value="${item.venda.toFixed(2)}" onchange="os.atualizarItemMemoria('${item.uid}', 'venda', this)"></td>
                <td class="text-white align-middle text-end fw-bold" id="tot_${item.uid}">R$ ${(item.qtd * item.venda).toFixed(2)}</td>
                <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="os.removerLinhaPeca('${item.uid}')"><i class="bi bi-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        this.calcularTotalOS();
    },

    calcularTotalOS: function() {
        let totalGeral = 0;
        this.itensOSAtual.forEach(item => {
            const subtotal = item.qtd * item.venda;
            totalGeral += subtotal;
            
            // Atualiza o subtotal da linha HTML (se o elemento existir)
            const tdTotal = document.getElementById(`tot_${item.uid}`);
            if (tdTotal) tdTotal.textContent = `R$ ${subtotal.toFixed(2)}`;
        });

        document.getElementById('os-total-display').textContent = `R$ ${totalGeral.toFixed(2)}`;
        return totalGeral;
    },

    /**
     * SALVAR O.S. (A grande transação atômica do Firebase)
     */
    salvarOS: async function() {
        const tenantId = window.core.session.tenantId;
        const idOriginal = document.getElementById('os-id').value;
        const clienteId = document.getElementById('os-cliente-id').value;
        const placa = document.getElementById('os-placa').value.toUpperCase().trim();

        if (!clienteId) {
            window.ui.mostrarToast("Erro Crítico", "É obrigatório selecionar ou cadastrar um cliente válido.", "danger");
            return;
        }

        if (!placa) {
            window.ui.mostrarToast("Atenção", "A Placa do veículo é obrigatória.", "warning");
            return;
        }

        // Prepara os dados
        const dadosOS = {
            placa: placa,
            veiculo: document.getElementById('os-veiculo').value.trim(),
            clienteId: clienteId,
            clienteNome: document.getElementById('os-cliente-busca').value.split('|')[0].trim(),
            queixa: document.getElementById('os-queixa').value.trim(),
            chkCombustivel: document.getElementById('chk-combustivel').checked,
            chkArranhado: document.getElementById('chk-arranhado').checked,
            chkPertences: document.getElementById('chk-pertences').checked,
            diagnostico: document.getElementById('os-diagnostico').value.trim(),
            status: document.getElementById('os-status').value,
            valorTotal: this.calcularTotalOS(),
            itens: this.itensOSAtual,
            dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
        };

        // LÓGICA DE AUDITORIA: Criação de um registro de LOG imutável
        const logEntry = {
            usuario: window.core.session.nome,
            dataHora: new Date(),
            acao: idOriginal ? "Atualizou Prontuário" : "Criou Prontuário de Recepção",
            statusAtual: dadosOS.status,
            valorRegistrado: dadosOS.valorTotal
        };

        try {
            const osRefBase = db.collection("tenants").doc(tenantId).collection("ordens_servico");

            if (idOriginal) {
                // É atualização
                // Pega os dados atuais para a Auditoria não apagar o passado
                const docAtual = await osRefBase.doc(idOriginal).get();
                let arrayAuditoria = docAtual.exists && docAtual.data().auditoria ? docAtual.data().auditoria : [];
                
                // Grava log apenas se algo importante mudou (ex: Status alterado)
                if(!docAtual.exists || docAtual.data().status !== dadosOS.status) {
                    logEntry.acao = `Mudou Status para: ${dadosOS.status.toUpperCase()}`;
                    arrayAuditoria.push(logEntry);
                    dadosOS.auditoria = arrayAuditoria;
                }

                await osRefBase.doc(idOriginal).update(dadosOS);
                window.ui.mostrarToast("Sucesso", `O.S da placa ${placa} atualizada.`, "success");

            } else {
                // É uma Nova OS
                dadosOS.dataCriacao = firebase.firestore.FieldValue.serverTimestamp();
                dadosOS.auditoria = [logEntry]; // Primeiro log

                await osRefBase.add(dadosOS);
                window.ui.mostrarToast("Sucesso", "Veículo rececionado com sucesso no Pátio!", "success");
            }

            // Lógica Pós-Salvar: Se mudou para ENTREGUE, dispara Financeiro
            if (dadosOS.status === 'pronto') {
                // Fica vermelho, esperando a faturação no front-end futuro
                window.ui.mostrarToast("Veículo Pronto", "O veículo está pronto. Não esqueça de faturar no Financeiro.", "info");
            }

            // Fecha Modal
            const modalEl = document.getElementById('modal-os');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

        } catch (error) {
            console.error("[O.S.] Erro Crítico ao Salvar:", error);
            window.ui.mostrarToast("Erro Base de Dados", "Falha ao gravar O.S. Verifique sua conexão.", "danger");
        }
    },

    /**
     * Renderiza a aba de Auditoria Visual
     */
    renderizarAuditoria: function(logs) {
        const ul = document.getElementById('lista-auditoria-os');
        ul.innerHTML = '';

        // Inverte a ordem para os mais recentes ficarem no topo
        const logsInvertidos = [...logs].reverse();

        logsInvertidos.forEach(log => {
            // Verifica o tipo de status para colorir a bolinha da timeline no CSS
            let classColor = 'timeline-success';
            if(log.acao.includes("Criou")) classColor = '';
            if(log.acao.includes("CANCELOU")) classColor = 'timeline-danger';
            if(log.acao.includes("Orçamento")) classColor = 'timeline-warning';

            // Conversão segura de Timestamp do Firestore
            let dataFormato = "Data Desconhecida";
            if (log.dataHora && log.dataHora.toDate) {
                dataFormato = log.dataHora.toDate().toLocaleString('pt-BR');
            } else if (log.dataHora instanceof Date) {
                dataFormato = log.dataHora.toLocaleString('pt-BR');
            }

            ul.innerHTML += `
                <li class="${classColor} mb-3">
                    <div class="fw-bold text-white">${log.usuario}</div>
                    <div class="small text-info">${log.acao}</div>
                    <div class="small text-white-50"><i class="bi bi-clock"></i> ${dataFormato}</div>
                    ${log.valorRegistrado > 0 ? `<div class="small text-success mt-1 fw-bold">R$ ${log.valorRegistrado.toFixed(2)}</div>` : ''}
                </li>
            `;
        });
    }
};
