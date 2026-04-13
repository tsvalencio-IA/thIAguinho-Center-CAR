/**
 * CONFIGURAÇÃO DO FIREBASE
 * Substitua os valores abaixo pelas chaves do SEU projeto no Console do Firebase
 */

const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
    projectId: "SEU_PROJETO_ID",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Configurações Globais da Aplicação
window.AppConfig = {
    appName: "SaaS Office Pro",
    version: "2.0.0",
    debug: true,
    currency: "BRL",
    locale: "pt-BR"
};

// Inicialização segura do Firebase
function initFirebase() {
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
            console.log('[CONFIG] Firebase inicializado com sucesso.');
        } catch (e) {
            console.error('[CONFIG] Erro ao inicializar Firebase:', e);
        }
    }
    return firebase;
}

// Exporta para escopo global
window.firebaseConfig = firebaseConfig;
window.initFirebase = initFirebase;
