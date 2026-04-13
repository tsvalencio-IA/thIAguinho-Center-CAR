/**
 * ERP MASTER - MÓDULO FINANCEIRO, DRE E SUPRIMENTOS (XML)
 * Responsável por: Fluxo de Caixa, Parcelamentos (até 24x), Auditoria Financeira e Leitura de NFe.
 */

window.financeiro = {
    listaLancamentos: [],
    listenerFinanceiro: null,

    /**
     * Inicializa o módulo financeiro
     */
    init: function() {
        console.log("[FINANCEIRO] Motor Financeiro Iniciado.");
        setTimeout(() => {
            if (window.core && window.core.session.tenantId) {
                this.escutarLancamentos();
            }
        }, 500);
    },

    /**
     * Escuta todos os lançamentos do mês atual para montar o DRE (Demonstração do Resultado)
     */
    escutarLancamentos: function() {
        const tenantId = window.core.session.tenantId;
        
        // Aqui, numa versão de produção, colocaríamos um filtro de datas (Mês Atual). 
        // Para a tua estrutura, vamos escutar todos os abertos e os recentes.
        this.listenerFinanceiro = db.collection("tenants").doc(tenantId).collection("financeiro")
            .orderBy("dataVencimento", "asc")
            .onSnapshot((snapshot) => {
                this.listaLancamentos = [];
                let htmlTabela = "";
                
                let totalReceitas = 0;
                let totalDespesas = 0;
                let totalPendente = 0;

                snapshot.forEach((doc) => {
                    const lanc = doc.data();
                    lanc.id = doc.id;
                    this.listaLancamentos.push(lanc);

                    // Formatação de Datas
                    let dataVenc = lanc.dataVencimento ? new Date(lanc.dataVencimento).toLocaleDateString('pt-PT') : 'N/D';
                    
                    // Cálculos para o Dashboard (DRE)
                    if (lanc.status === 'pago') {
                        if (lanc.tipo === 'receita') totalReceitas += lanc.valor;
                        if (lanc.tipo === 'despesa') totalDespesas += lanc.valor;
                    } else {
                        if (lanc.tipo === 'receita') totalPendente += lanc.valor;
                        if (lanc.tipo === 'despesa') totalPendente -= lanc.valor;
                    }

                    // Identidade Visual da Linha
                    const corTipo = lanc.tipo === 'receita' ? 'text-success' : 'text-danger';
                    const iconeTipo = lanc.tipo === 'receita' ? 'bi-arrow-up-circle-fill' : 'bi-arrow-down-circle-fill';
                    const badgeStatus = lanc.status === 'pago' 
                        ? '<span class="badge bg-success">Pago</span>' 
                        : '<span class="badge bg-warning text-dark">Pendente</span>';

                    htmlTabela += `
                        <tr class="align-middle border-bottom border-secondary">
                            <td class="${corTipo} fs-5"><i class="bi ${iconeTipo}"></i></td>
                            <td class="text-white fw-bold">${lanc.descricao} <br><small class="text-white-50 fw-normal">Ref: ${lanc.referenciaOS || 'Avulso'}</small></td>
                            <td class="text-white-50">${lanc.categoria}</td>
                            <td class="text-info">${dataVenc}</td>
                            <td class="text-white">${lanc.formaPagamento} ${lanc.parcelaAtual ? `(${lanc.parcelaAtual}/${lanc.totalParcelas})` : ''}</td>
                            <td class="${corTipo} fw-bold">R$ ${lanc.valor.toFixed(2)}</td>
                            <td>${badgeStatus}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="financeiro.editarLancamento('${lanc.id}')" title="Editar Título"><i class="bi bi-pencil"></i></button>
                                ${lanc.status !== 'pago' ? `<button class="btn btn-sm btn-success ms-1" onclick="financeiro.liquidarLancamento('${lanc.id}')" title="Dar Baixa"><i class="bi bi-check-lg"></i></button>` : ''}
                            </td>
                        </tr>
                    `;
                });

                // Injeta no HTML (Assumindo que iremos criar estes IDs na secção Financeiro do jarvis.html)
                const tbCorpo = document.getElementById("tb-financeiro-corpo");
                if (tbCorpo) tbCorpo.innerHTML = htmlTabela || '<tr><td colspan="8" class="text-center text-white-50">Sem movimentos registados.</td></tr>';

                // Atualiza Cards de Resumo
                const cardRec = document.getElementById("dre-receitas");
                const cardDes = document.getElementById("dre-despesas");
                const cardSal = document.getElementById("dre-saldo");
                
                if(cardRec) cardRec.textContent = `R$ ${totalReceitas.toFixed(2)}`;
                if(cardDes) cardDes.textContent = `R$ ${totalDespesas.toFixed(2)}`;
                if(cardSal) {
                    const saldo = totalReceitas - totalDespesas;
                    cardSal.textContent = `R$ ${saldo.toFixed(2)}`;
                    cardSal.className = saldo >= 0 ? "text-success fw-bold" : "text-danger fw-bold";
                }

            }, (error) => {
                console.error("[FINANCEIRO] Erro ao carregar fluxo de caixa:", error);
                if(window.ui) window.ui.mostrarToast("Erro Financeiro", "Falha ao sincronizar o cofre.", "danger");
            });
    },

    /**
     * Lógica de Parcelamento Dinâmico e Registo Financeiro
     * Esta função é chamada ao salvar uma nova fatura (ou ao faturar uma OS no arquivo os.js)
     */
    gerarTitulosFinanceiros: async function(dadosBase, numParcelas) {
        const tenantId = window.core.session.tenantId;
        const batch = db.batch(); // Operação Atómica: Ou guarda todas as parcelas ou nenhuma.

        try {
            const valorPorParcela = dadosBase.valorTotal / numParcelas;
            let dataBase = new Date(dadosBase.dataPrimeiroVencimento);

            for (let i = 1; i <= numParcelas; i++) {
                // Calcula a data de vencimento (+1 mês para cada parcela, simplificado para 30 dias)
                let dataVencParcela = new Date(dataBase);
                if (i > 1) {
                    dataVencParcela.setMonth(dataBase.getMonth() + (i - 1));
                }

                const docRef = db.collection("tenants").doc(tenantId).collection("financeiro").doc();
                
                const lancamento = {
                    tipo: dadosBase.tipo, // 'receita' ou 'despesa'
                    descricao: dadosBase.descricao,
                    categoria: dadosBase.categoria,
                    referenciaOS: dadosBase.referenciaOS || null,
                    valor: valorPorParcela,
                    formaPagamento: dadosBase.formaPagamento,
                    parcelaAtual: i,
                    totalParcelas: numParcelas,
                    dataVencimento: dataVencParcela.getTime(), // Guardamos em milissegundos para facilitar ordenação
                    status: 'pendente',
                    auditoria: [{
                        data: new Date().getTime(),
                        usuario: window.core.session.nome,
                        acao: "Título Criado"
                    }]
                };

                batch.set(docRef, lancamento);
            }

            await batch.commit();
            window.ui.mostrarToast("Financeiro", `${numParcelas} parcela(s) gerada(s) com sucesso.`, "success");

        } catch (error) {
            console.error("[FINANCEIRO] Erro ao parcelar:", error);
            window.ui.mostrarToast("Erro", "Falha ao processar o parcelamento financeiro.", "danger");
        }
    },

    /**
     * Edição com Auditoria Rigorosa
     * Permite alterar o vencimento ou o valor, mas regista quem o fez.
     */
    editarLancamento: async function(idLancamento, novoValor, novaDataMs) {
        const tenantId = window.core.session.tenantId;
        const lancRef = db.collection("tenants").doc(tenantId).collection("financeiro").doc(idLancamento);
        
        try {
            const doc = await lancRef.get();
            if (!doc.exists) throw new Error("Título não encontrado.");

            const lanc = doc.data();
            const logAntigo = lanc.auditoria || [];
            
            const logNovo = {
                data: new Date().getTime(),
                usuario: window.core.session.nome,
                acao: `Editou Título. Valor Antigo: ${lanc.valor}. Data Antiga: ${new Date(lanc.dataVencimento).toLocaleDateString()}`
            };

            logAntigo.push(logNovo);

            await lancRef.update({
                valor: parseFloat(novoValor) || lanc.valor,
                dataVencimento: novaDataMs || lanc.dataVencimento,
                auditoria: logAntigo,
                ultimaEdicaoPor: window.core.session.nome
            });

            window.ui.mostrarToast("Atualizado", "Alterações gravadas com registo de auditoria.", "success");

        } catch (error) {
            console.error("[FINANCEIRO] Erro ao editar:", error);
        }
    },

    liquidarLancamento: async function(idLancamento) {
        const tenantId = window.core.session.tenantId;
        try {
            await db.collection("tenants").doc(tenantId).collection("financeiro").doc(idLancamento).update({
                status: 'pago',
                dataPagamento: new Date().getTime(),
                pagoPor: window.core.session.nome
            });
            window.ui.mostrarToast("Sucesso", "Título liquidado. O DRE foi atualizado.", "success");
        } catch (error) {
            console.error("Erro ao liquidar:", error);
        }
    },

    /**
     * ========================================================================
     * MÓDULO SUPRIMENTOS: IMPORTAÇÃO MÁGICA DE XML DA NOTA FISCAL
     * ========================================================================
     */
    lerXMLNotaFiscal: function(eventoInput) {
        const ficheiro = eventoInput.target.files[0];
        if (!ficheiro) return;

        const leitor = new FileReader();
        
        leitor.onload = async (e) => {
            const textoXML = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(textoXML, "text/xml");

            // Verifica se é uma NFe válida do governo
            const nfe = xmlDoc.getElementsByTagName("NFe")[0] || xmlDoc.getElementsByTagName("nfeProc")[0];
            if (!nfe) {
                window.ui.mostrarToast("Erro no Ficheiro", "O ficheiro fornecido não é um XML de Nota Fiscal válido.", "danger");
                return;
            }

            // Informações Gerais da Nota
            const fornecedorNode = xmlDoc.getElementsByTagName("emit")[0];
            const nomeFornecedor = fornecedorNode ? fornecedorNode.getElementsByTagName("xNome")[0].textContent : "Fornecedor Desconhecido";
            const valorTotalNfeNode = xmlDoc.getElementsByTagName("vNF")[0];
            const valorTotalNfe = valorTotalNfeNode ? parseFloat(valorTotalNfeNode.textContent) : 0;

            // Extração de Produtos (Tag <det>)
            const produtosNode = xmlDoc.getElementsByTagName("det");
            let produtosExtraidos = [];

            for (let i = 0; i < produtosNode.length; i++) {
                const prod = produtosNode[i].getElementsByTagName("prod")[0];
                
                const nomePeca = prod.getElementsByTagName("xProd")[0].textContent;
                const cfop = prod.getElementsByTagName("CFOP")[0].textContent;
                const qtd = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
                const custoUn = parseFloat(prod.getElementsByTagName("vUnCom")[0].textContent);
                
                // Inteligência Artificial / Lógica de Precificação Base: Sugere +50% de margem no preço de venda
                const precoSugerido = custoUn * 1.50;

                produtosExtraidos.push({
                    descricao: nomePeca,
                    quantidade: qtd,
                    custo: custoUn,
                    vendaSugerida: precoSugerido,
                    cfop: cfop
                });
            }

            console.log("[SUPRIMENTOS] Peças Extraídas do XML:", produtosExtraidos);
            
            // Pergunta ao utilizador se deseja processar
            const confirmar = confirm(`Ficheiro Lido com Sucesso!\nFornecedor: ${nomeFornecedor}\nTotal da Nota: R$ ${valorTotalNfe.toFixed(2)}\nPeças Identificadas: ${produtosExtraidos.length}\n\nDeseja adicionar estas peças ao Estoque e gerar o Contas a Pagar?`);
            
            if (confirmar) {
                await this.processarEntradaXML(nomeFornecedor, valorTotalNfe, produtosExtraidos);
            }
            
            eventoInput.target.value = ""; // Limpa o input file
        };

        leitor.readAsText(ficheiro);
    },

    processarEntradaXML: async function(fornecedor, valorTotal, pecas) {
        const tenantId = window.core.session.tenantId;
        const batch = db.batch();

        try {
            // 1. Alimentar o Estoque
            pecas.forEach(peca => {
                const estoqueRef = db.collection("tenants").doc(tenantId).collection("estoque").doc();
                batch.set(estoqueRef, {
                    descricao: peca.descricao,
                    quantidadeEmEstoque: peca.quantidade,
                    custoUltimaCompra: peca.custo,
                    precoVenda: peca.vendaSugerida,
                    cfopOriginal: peca.cfop,
                    dataEntrada: new Date().getTime()
                });
            });

            // 2. Gerar Título no Contas a Pagar (Despesa Única de Exemplo, poderia chamar a função de parcelar)
            const despesaRef = db.collection("tenants").doc(tenantId).collection("financeiro").doc();
            batch.set(despesaRef, {
                tipo: 'despesa',
                descricao: `Nota Fiscal - ${fornecedor}`,
                categoria: 'Compra de Peças',
                valor: valorTotal,
                formaPagamento: 'Boleto XML',
                parcelaAtual: 1,
                totalParcelas: 1,
                dataVencimento: new Date().getTime() + (30 * 24 * 60 * 60 * 1000), // Sugere vencimento para 30 dias
                status: 'pendente',
                auditoria: [{
                    data: new Date().getTime(),
                    usuario: window.core.session.nome,
                    acao: "Gerado Automaticamente via XML"
                }]
            });

            await batch.commit();
            window.ui.mostrarToast("Sucesso", "Estoque alimentado e Despesa lançada com sucesso!", "success");

        } catch (error) {
            console.error("[SUPRIMENTOS] Erro ao gravar XML:", error);
            window.ui.mostrarToast("Erro de Banco", "Não foi possível guardar os dados do XML.", "danger");
        }
    }
};

// Auto-Init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.financeiro && typeof window.financeiro.init === 'function') {
            window.financeiro.init();
        }
    }, 1500);
});
