/**
 * ERP MASTER - MÓDULO DE INTERFACE (UI)
 * Responsável por: Navegação SPA, Notificações Visuais (Toasts), Comportamento do Kanban e Responsividade.
 */

window.ui = {
    /**
     * Inicializa os comportamentos visuais básicos assim que o Core carrega o perfil
     */
    init: function() {
        console.log("[UI] Inicializando Sistema Nervoso da Interface...");
        this.initKanbanVisuals();
        this.initFechamentoMenuMobile();
        
        // Garante que a tela inicial seja o Pátio (Kanban)
        const btnPatio = document.querySelector('button[onclick="ui.irSecao(\'sec-os\', this)"]');
        if (btnPatio) {
            this.irSecao('sec-os', btnPatio);
        }
    },

    /**
     * Navegação SPA (Single Page Application)
     * Oculta todas as seções e mostra apenas a que o usuário clicou, sem dar "F5".
     * * @param {string} secaoId - O ID da <section> que deve aparecer
     * @param {HTMLElement} btnElement - O botão do menu que foi clicado
     */
    irSecao: function(secaoId, btnElement) {
        // 1. Remove a classe 'active' de todos os botões do menu
        const botoesNav = document.querySelectorAll('.nav-btn');
        botoesNav.forEach(btn => btn.classList.remove('active'));

        // 2. Adiciona a classe 'active' apenas no botão clicado
        if (btnElement) {
            btnElement.classList.add('active');
            
            // Atualiza o título no Topbar
            const titulo = btnElement.innerText.trim();
            document.getElementById('titulo-pagina').innerText = titulo;
        }

        // 3. Esconde todas as seções da área principal
        const secoes = document.querySelectorAll('.secao-tela');
        secoes.forEach(sec => {
            sec.classList.remove('d-flex'); // Remove display flex se tiver
            sec.classList.add('d-none');    // Esconde
        });

        // 4. Mostra a seção desejada
        const secaoAlvo = document.getElementById(secaoId);
        if (secaoAlvo) {
            secaoAlvo.classList.remove('d-none');
            // Se for a seção de OS, precisa de d-flex para o Kanban esticar
            if (secaoId === 'sec-os') {
                secaoAlvo.classList.add('d-flex');
            }
        }

        // 5. Se estiver no celular (mobile), fecha o menu lateral após o clique
        if (window.innerWidth < 992) {
            this.toggleSidebar();
        }
    },

    /**
     * Alterna a visibilidade do Menu Lateral (Sidebar) em telas pequenas (Celulares)
     */
    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('show');
        }
    },

    /**
     * Fecha a sidebar automaticamente se o usuário clicar fora dela no celular
     */
    initFechamentoMenuMobile: function() {
        document.addEventListener('click', (event) => {
            if (window.innerWidth < 992) {
                const sidebar = document.getElementById('sidebar');
                const btnToggle = document.querySelector('button[onclick="ui.toggleSidebar()"]');
                
                // Se o menu estiver aberto e o clique NÃO foi no menu nem no botão de abrir
                if (sidebar.classList.contains('show') && 
                    !sidebar.contains(event.target) && 
                    (!btnToggle || !btnToggle.contains(event.target))) {
                    sidebar.classList.remove('show');
                }
            }
        });
    },

    /**
     * Lógica do Kanban Chevron: Minimizar e Maximizar Colunas
     * Permite que o gestor clique no título da coluna para encolhê-la e focar no que importa.
     */
    initKanbanVisuals: function() {
        const headers = document.querySelectorAll('.kanban-col h6');
        
        headers.forEach(header => {
            // Muda o cursor para mostrar que é clicável
            header.style.cursor = 'pointer';
            header.title = 'Clique para minimizar/maximizar esta coluna';

            header.addEventListener('click', function() {
                const coluna = this.closest('.kanban-col');
                coluna.classList.toggle('minimized');
                
                // Salva a preferência no LocalStorage (memória do navegador)
                // Assim, se ele atualizar a página, a coluna continua minimizada
                const idColuna = coluna.querySelector('.kanban-cards').id;
                const isMinimized = coluna.classList.contains('minimized');
                localStorage.setItem(`kanban_min_${idColuna}`, isMinimized);
            });
        });

        // Restaura as colunas minimizadas ao carregar a página
        const colunas = document.querySelectorAll('.kanban-col');
        colunas.forEach(col => {
            const idColuna = col.querySelector('.kanban-cards').id;
            if (localStorage.getItem(`kanban_min_${idColuna}`) === 'true') {
                col.classList.add('minimized');
            }
        });
    },

    /**
     * Sistema Customizado de Notificações Flutuantes (Toasts)
     * Muito mais leve e rápido que injetar via biblioteca externa.
     * * @param {string} titulo - O título da notificação
     * @param {string} mensagem - O texto explicativo
     * @param {string} tipo - 'success', 'danger', 'warning', 'info'
     */
    mostrarToast: function(titulo, mensagem, tipo = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Mapeamento de Ícones e Cores com base no tipo
        const temas = {
            'success': { icon: 'bi-check-circle-fill', bg: 'bg-success', text: 'text-white' },
            'danger': { icon: 'bi-exclamation-triangle-fill', bg: 'bg-danger', text: 'text-white' },
            'warning': { icon: 'bi-exclamation-circle-fill', bg: 'bg-warning', text: 'text-dark' },
            'info': { icon: 'bi-info-circle-fill', bg: 'bg-info', text: 'text-dark' }
        };

        const tema = temas[tipo] || temas['info'];
        
        // Criação dinâmica do elemento HTML do Toast
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center ${tema.text} ${tema.bg} border-0 mb-2 show`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        toastEl.style.opacity = '0'; // Começa invisível para animar
        toastEl.style.transition = 'opacity 0.3s ease-in-out';

        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body d-flex align-items-start gap-2">
                    <i class="bi ${tema.icon} fs-5"></i>
                    <div>
                        <strong class="d-block">${titulo}</strong>
                        <span class="small">${mensagem}</span>
                    </div>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
            </div>
        `;

        container.appendChild(toastEl);

        // Dispara a animação de Fade In
        setTimeout(() => { toastEl.style.opacity = '1'; }, 10);

        // Autodestruição após 4 segundos
        setTimeout(() => {
            toastEl.style.opacity = '0'; // Fade Out
            setTimeout(() => {
                if (container.contains(toastEl)) {
                    container.removeChild(toastEl);
                }
            }, 300); // Tempo do fade out
        }, 4000);
    },

    /**
     * Filtro Global Básico (Oculta cartões e linhas que não batem com a busca)
     * Será expandido nos outros módulos para buscar no Firebase se necessário.
     */
    filtrarGlobal: function() {
        const termo = document.getElementById('busca-global').value.toLowerCase().trim();
        
        // 1. Filtrar no Kanban (Oculta os cartões que não contém o termo)
        const cartoesOS = document.querySelectorAll('.os-card');
        cartoesOS.forEach(cartao => {
            const texto = cartao.innerText.toLowerCase();
            if (texto.includes(termo)) {
                cartao.style.display = 'block';
            } else {
                cartao.style.display = 'none';
            }
        });

        // 2. Filtrar na Tabela de Clientes
        const linhasClientes = document.querySelectorAll('#tb-clientes-corpo tr');
        linhasClientes.forEach(linha => {
            const texto = linha.innerText.toLowerCase();
            if (texto.includes(termo)) {
                linha.style.display = '';
            } else {
                linha.style.display = 'none';
            }
        });
    }
};
