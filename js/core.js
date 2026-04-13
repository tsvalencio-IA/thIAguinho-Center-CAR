/**
 * ERP MASTER - NÚCLEO DO SISTEMA (CORE)
 * Responsável por: Autenticação, Isolamento SaaS (Tenants), RBAC (Permissões) e Listeners Globais.
 */

// ============================================================================
// 1. CONFIGURAÇÃO E INICIALIZAÇÃO DO FIREBASE (FIRESTORE)
// ============================================================================
const firebaseConfig = {
    // ATENÇÃO: Substitua pelas chaves reais do seu projeto Firebase Enterprise
    apiKey: "AIzaSy_SUA_CHAVE_AQUI",
    authDomain: "seu-erp-master.firebaseapp.com",
    projectId: "seu-erp-master",
    storageBucket: "seu-erp-master.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

// Inicializa o Firebase apenas se não tiver sido inicializado antes
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Instâncias Globais do Banco de Dados e Autenticação
const db = firebase.firestore();
const auth = firebase.auth();

// Habilita persistência offline (Cache poderoso: se a internet da oficina cair, o sistema continua abrindo O.S. e sincroniza depois)
db.enablePersistence().catch((err) => {
    console.warn("Persistência offline falhou. Erro: ", err.code);
});

// ============================================================================
// 2. OBJETO GLOBAL DE ESTADO E MÉTODOS DO NÚCLEO
// ============================================================================
window.core = {
    // Memória da Sessão Atual
    session: {
        uid: null,          // ID do Usuário Logado
        tenantId: null,     // ID da Oficina (Garante que não vaze dados)
        nome: null,         // Nome do Usuário
        role: null,         // Nível de Acesso (admin, gestor, mecanico)
        empresaNome: null   // Nome fantasia da Oficina
    },

    // Listeners ativos (para podermos desligar quando o usuário sair)
    listeners: [],

    /**
     * Ponto de Partida do Sistema (Chamado no final do jarvis.html)
     */
    init: function() {
        console.log("[CORE] Iniciando Motor ERP Master...");
        this.observarAutenticacao();
    },

    /**
     * Vigia se o usuário está logado ou se a sessão expirou
     */
    observarAutenticacao: function() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log("[CORE] Usuário autenticado. Verificando credenciais...");
                await this.carregarPerfil(user.uid);
            } else {
                console.error("[CORE] Acesso negado. Redirecionando para Login.");
                window.location.href = "index.html"; // Expulsa pro login
            }
        });
    },

    /**
     * Busca os dados do usuário e a qual Oficina (Tenant) ele pertence
     */
    carregarPerfil: async function(uid) {
        try {
            // Busca o cadastro do usuário na coleção global
            const userDoc = await db.collection("usuarios").doc(uid).get();
            
            if (!userDoc.exists) {
                throw new Error("Perfil de usuário não encontrado no banco de dados.");
            }

            const userData = userDoc.data();
            
            // Verifica se a oficina dele não está bloqueada por falta de pagamento do SaaS
            const tenantDoc = await db.collection("tenants").doc(userData.tenantId).get();
            if (!tenantDoc.exists || tenantDoc.data().status === "bloqueado") {
                alert("SISTEMA BLOQUEADO. Entre em contato com o suporte financeiro do ERP.");
                this.sair();
                return;
            }

            // Alimenta a memória global
            this.session = {
                uid: uid,
                tenantId: userData.tenantId,
                nome: userData.nome,
                role: userData.role,
                empresaNome: tenantDoc.data().nomeFantasia
            };

            console.log(`[CORE] Bem-vindo ${this.session.nome} | Cargo: ${this.session.role}`);

            // Preenche os dados visuais na tela
            document.getElementById("lbl-usuario-nome").textContent = this.session.nome;
            document.getElementById("lbl-empresa-nome").textContent = this.session.empresaNome;

            // Dispara as engrenagens de interface e banco
            this.aplicarPermissoes(this.session.role);
            this.iniciarEscutasEmTempoReal();
            
            // Chama a inicialização da UI (se já estiver carregada)
            if (window.ui && typeof window.ui.init === "function") {
                window.ui.init();
            }

        } catch (error) {
            console.error("[CORE] Falha crítica ao carregar perfil:", error);
            alert("Erro ao carregar dados do usuário. Recarregue a página.");
        }
    },

    /**
     * Aplica o RBAC (Role-Based Access Control)
     * Oculta financeiro, lixeira e configurações dependendo de quem logou.
     */
    aplicarPermissoes: function(role) {
        const adminElements = document.querySelectorAll('.admin-only');
        const gestaoElements = document.querySelectorAll('.gestao-only');

        // Se for mecânico padrão, esconde tudo que for de gestão ou admin
        if (role === 'mecanico') {
            adminElements.forEach(el => el.classList.add('d-none'));
            gestaoElements.forEach(el => el.classList.add('d-none'));
        } 
        // Se for gestor (Dono da Oficina), esconde apenas coisas de SuperAdmin
        else if (role === 'gestor') {
            adminElements.forEach(el => el.classList.add('d-none'));
            gestaoElements.forEach(el => el.classList.remove('d-none'));
        } 
        // Se for Master (Você), vê tudo
        else if (role === 'master' || role === 'admin') {
            adminElements.forEach(el => el.classList.remove('d-none'));
            gestaoElements.forEach(el => el.classList.remove('d-none'));
        }
    },

    /**
     * Liga os "Ouvidos" do Firebase para reagir em Tempo Real (A Mágica da Automação)
     */
    iniciarEscutasEmTempoReal: function() {
        const tenantId = this.session.tenantId;

        // 1. Escuta de Notificações / Alertas (Aprovações do Cliente)
        const unsubNotificacoes = db.collection("tenants").doc(tenantId)
            .collection("notificacoes")
            .where("lida", "==", false)
            .orderBy("dataHora", "desc")
            .onSnapshot((snapshot) => {
                let unreadCount = snapshot.docs.length;
                const badgeAlertas = document.getElementById("badge-alertas-os");
                const listaAlertas = document.getElementById("conteudo-alertas-os");
                
                if (unreadCount > 0) {
                    badgeAlertas.textContent = unreadCount;
                    badgeAlertas.classList.remove("d-none");
                    
                    let htmlAlertas = "";
                    snapshot.docChanges().forEach((change) => {
                        // Se for uma nova notificação (Ex: Orçamento Aprovado via Web)
                        if (change.type === "added") {
                            const notif = change.doc.data();
                            
                            // Dispara Alerta Sonoro!
                            this.tocarAlerta("os");
                            
                            // Monta a notificação no Sino dropdown
                            htmlAlertas += `
                                <li>
                                    <a class="dropdown-item text-white border-bottom border-secondary py-2" href="#" onclick="core.marcarNotificacaoLida('${change.doc.id}')">
                                        <div class="d-flex justify-content-between">
                                            <strong class="${notif.tipo === 'aprovacao' ? 'text-success' : 'text-warning'}">${notif.titulo}</strong>
                                            <small class="text-white-50">${new Date(notif.dataHora.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                                        </div>
                                        <span class="small text-white-50 text-wrap">${notif.mensagem}</span>
                                    </a>
                                </li>
                            `;
                            
                            // Se a UI já estiver pronta, dispara um Toast na tela também
                            if(window.ui && window.ui.mostrarToast) {
                                window.ui.mostrarToast(notif.titulo, notif.mensagem, notif.tipo === 'aprovacao' ? 'success' : 'warning');
                            }
                        }
                    });
                    
                    if(htmlAlertas !== "") {
                        listaAlertas.innerHTML = htmlAlertas;
                    }

                } else {
                    badgeAlertas.classList.add("d-none");
                    listaAlertas.innerHTML = '<li><span class="dropdown-item text-white-50 text-center small">Tudo tranquilo. Nenhum alerta pendente.</span></li>';
                }
            }, (error) => {
                console.error("[CORE] Erro na escuta de notificações: ", error);
            });

        // Adiciona aos listeners para desativar no logout
        this.listeners.push(unsubNotificacoes);

        // 2. Chama a Inicialização do Kanban na O.S (se o script de O.S estiver carregado)
        if (window.os && typeof window.os.iniciarKanban === "function") {
            window.os.iniciarKanban(tenantId);
        }
    },

    /**
     * Toca o som de notificação correspondente
     */
    tocarAlerta: function(tipo) {
        // Para evitar tocar o som dezenas de vezes ao carregar a página pela primeira vez,
        // só tocamos o áudio se a página já terminou de carregar faz uns segundos.
        if (performance.now() > 3000) {
            try {
                let audio;
                if (tipo === "chat") {
                    audio = document.getElementById("audio-notifica-chat");
                } else {
                    audio = document.getElementById("audio-notifica-os");
                }
                
                if (audio) {
                    audio.currentTime = 0;
                    audio.play().catch(e => console.warn("Auto-play de áudio bloqueado pelo navegador."));
                }
            } catch(e){}
        }
    },

    /**
     * Marca uma notificação como lida no banco de dados
     */
    marcarNotificacaoLida: async function(notifId) {
        try {
            await db.collection("tenants").doc(this.session.tenantId)
                .collection("notificacoes").doc(notifId)
                .update({ lida: true });
        } catch (error) {
            console.error("Erro ao marcar notificação:", error);
        }
    },

    /**
     * Encerrar a Sessão de forma limpa e segura
     */
    sair: function() {
        // Desliga todos os "ouvidos" do Firebase para não consumir banda à toa
        this.listeners.forEach(unsub => unsub());
        this.listeners = [];
        
        // Zera o estado global
        this.session = { uid: null, tenantId: null, nome: null, role: null };

        // Desloga do Auth
        auth.signOut().then(() => {
            window.location.href = "index.html";
        }).catch((error) => {
            console.error("Erro ao deslogar:", error);
        });
    }
};
