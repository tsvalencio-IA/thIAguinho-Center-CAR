/**
 * JARVIS ERP - MÓDULO DE INTERFACE (UI)
 * Responsável por: Navegação SPA, Controle de Modais, Filtros e Notificações Visuais.
 */

window.ui = {
    /**
     * Inicializa os componentes visuais
     */
    init: function() {
        console.log("[UI] Inicializando componentes de interface...");
        this.renderizarInfoOficina();
        
        // Garante que o sistema inicia na seção de Pátio
        const btnInicio = document.querySelector('button[onclick*="sec-os"]');
        if (btnInicio) {
            this.irSecao('sec-os', btnInicio);
        }
    },

    /**
     * Atualiza os nomes e fotos da oficina na interface
     */
    renderizarInfoOficina: function() {
        if (window.J && window.J.oficina) {
            const lblEmpresa = document.getElementById('lbl-empresa-nome');
            const lblUser = document.getElementById('lbl-usuario-nome');
            
            if (lblEmpresa) lblEmpresa.textContent = window.J.oficina.nomeFantasia || "Oficina Jarvis";
            if (lblUser) lblUser.textContent = window.J.user ? window.J.user.nome : "Usuário";
        }
    },

    /**
     * Navegação entre as seções do sistema (SPA)
     * @param {string} secaoId - ID da section a ser exibida
     * @param {HTMLElement} btn - Botão clicado para aplicar classe active
     */
    irSecao: function(secaoId, btn) {
        // 1. Remove classe ativa de todos os botões do menu
        const botoes = document.querySelectorAll('.nav-btn');
        botoes.forEach(b => b.classList.remove('active'));

        // 2. Adiciona classe ativa no botão atual
        if (btn) btn.classList.add('active');

        // 3. Esconde todas as seções
        const secoes = document.querySelectorAll('.secao-tela');
        secoes.forEach(s => {
            s.classList.add('d-none');
            s.classList.remove('d-flex');
        });

        // 4. Mostra a seção alvo
        const alvo = document.getElementById(secaoId);
        if (alvo) {
            alvo.classList.remove('d-none');
            // Se for o pátio, usamos flex para manter o layout das colunas
            if (secaoId === 'sec-os') {
                alvo.classList.add('d-flex');
            }
            
            // Atualiza o título da Topbar
            const titulo = document.getElementById('titulo-pagina');
            if (titulo && btn) {
                titulo.textContent = btn.innerText.trim();
            }
        }

        // 5. Fecha a sidebar no mobile após clique
        if (window.innerWidth < 992) {
            this.toggleSidebar();
        }
    },

    /**
     * Alterna a visibilidade da Sidebar no Mobile
     */
    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('show');
        }
    },

    /**
     * Filtro Global de Busca (Filtra cartões no Kanban e linhas na tabela de clientes)
     */
    filtrarGlobal: function() {
        const termo = document.getElementById('busca-global').value.toLowerCase().trim();
        
        // Filtrar Cartões de OS
        const cartoes = document.querySelectorAll('.os-card');
        cartoes.forEach(c => {
            const texto = c.innerText.toLowerCase();
            c.style.display = texto.includes(termo) ? 'block' : 'none';
        });

        // Filtrar Tabela de Clientes
        const linhasClientes = document.querySelectorAll('#tb-clientes-corpo tr');
        linhasClientes.forEach(l => {
            const texto = l.innerText.toLowerCase();
            l.style.display = texto.includes(termo) ? '' : 'none';
        });
    },

    /**
     * Sistema de Notificações Flutuantes (Toasts)
     * @param {string} titulo - Título da mensagem
     * @param {string} msg - Texto da mensagem
     * @param {string} tipo - 'success', 'danger', 'warning', 'info'
     */
    mostrarToast: function(titulo, msg, tipo = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toastId = 'toast_' + Date.now();
        const corFundo = tipo === 'success' ? 'bg-success' : (tipo === 'danger' ? 'bg-danger' : (tipo === 'warning' ? 'bg-warning text-dark' : 'bg-info text-dark'));
        
        const html = `
            <div id="${toastId}" class="toast show align-items-center text-white ${corFundo} border-0 mb-2" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <strong class="d-block">${titulo}</strong>
                        ${msg}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close" onclick="this.parentElement.parentElement.remove()"></button>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);

        // Remove automaticamente após 4 segundos
        setTimeout(() => {
            const el = document.getElementById(toastId);
            if (el) el.remove();
        }, 4000);
    },

    /**
     * Controla a exibição do Painel de Atenção no topo do Pátio
     * @param {Array} alertas - Lista de strings com os alertas
     */
    atualizarPainelAtencao: function(alertas) {
        const painel = document.getElementById('painel-atencao');
        if (!painel) return;

        if (alertas && alertas.length > 0) {
            painel.classList.remove('d-none');
            let html = '';
            alertas.forEach(a => {
                html += `<div class="attention-box bg-black border border-warning p-2 mb-2 text-warning fw-bold small">
                            <i class="bi bi-exclamation-triangle-fill me-2"></i> ${a}
                         </div>`;
            });
            painel.innerHTML = html;
        } else {
            painel.classList.add('d-none');
        }
    }
};
