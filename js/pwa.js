/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Integração PWA & Offline Support (js/pwa.js)
 * 
 * Gerencia Service Worker, evento beforeinstallprompt, detecção de standalone/iOS,
 * botões de instalação no app e indicador de conectividade em tempo real.
 */

import { registerSW } from 'virtual:pwa-register';

let deferredPrompt = null;
let isInstalled = false;
let isIOS = false;
let updateSWHandler = null;

// Ouvintes de estado PWA
const pwaListeners = new Set();

function notifyListeners() {
  const state = getPWAState();
  pwaListeners.forEach(listener => {
    try {
      listener(state);
    } catch (err) {
      console.error('Erro no ouvinte PWA:', err);
    }
  });
}

/**
 * Retorna o estado atual da PWA
 */
export function getPWAState() {
  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  };
}

/**
 * Registra um callback para quando o estado de instalação mudar
 */
export function onPWAStateChange(callback) {
  pwaListeners.add(callback);
  callback(getPWAState());
  return () => pwaListeners.delete(callback);
}

/**
 * Inicializa a infraestrutura de PWA
 */
export function initPWA() {
  console.log('[GEF PWA] Inicializando Service Worker e suporte offline...');

  // 1. Detectar modo standalone (já instalado)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://');

  isInstalled = isStandalone;

  // 2. Detectar dispositivos iOS
  const userAgent = (window.navigator.userAgent || '').toLowerCase();
  isIOS = /iphone|ipad|ipod/.test(userAgent);

  // 3. Capturar evento de instalação nativo
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir exibição automática padrão do navegador para acionamento via UI
    e.preventDefault();
    deferredPrompt = e;
    console.log('[GEF PWA] Prompt de instalação pronto e armazenado.');
    notifyListeners();
  });

  // 4. Capturar quando o app for instalado com sucesso
  window.addEventListener('appinstalled', () => {
    console.log('[GEF PWA] Aplicação instalada com sucesso na tela inicial!');
    isInstalled = true;
    deferredPrompt = null;
    notifyListeners();
  });

  // 5. Registrar Service Worker gerado pelo Vite PWA
  try {
    updateSWHandler = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[GEF PWA] Nova versão do GEF disponível.');
        showUpdateToast();
      },
      onOfflineReady() {
        console.log('[GEF PWA] Aplicativo pronto para operação offline.');
      }
    });
  } catch (err) {
    console.warn('[GEF PWA] Não foi possível registrar service worker virtual:', err);
  }

  // 6. Monitorar conectividade de rede
  setupOfflineMonitor();

  notifyListeners();
}

/**
 * Dispara o prompt de instalação nativo da PWA
 */
export async function promptPWAInstall() {
  if (!deferredPrompt) {
    if (isIOS) {
      showIOSGuideModal();
      return false;
    }
    return false;
  }

  try {
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    console.log('[GEF PWA] Escolha do usuário:', choiceResult.outcome);

    if (choiceResult.outcome === 'accepted') {
      isInstalled = true;
      deferredPrompt = null;
      notifyListeners();
      return true;
    }
    return false;
  } catch (err) {
    console.error('[GEF PWA] Falha ao solicitar instalação:', err);
    return false;
  }
}

/**
 * Exibe modal com passo a passo para instalação no iOS Safari
 */
export function showIOSGuideModal() {
  const existingModal = document.getElementById('iosPwaInstallModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'iosPwaInstallModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in';
  modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-200 text-xs space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <i data-lucide="smartphone" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">Instalar no iPhone / iPad</h3>
            <p class="text-[10px] text-slate-400">Adicione o GEF à sua tela de início</p>
          </div>
        </div>
        <button id="btnCloseIosPwaModal" class="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 py-2">
        <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <span class="w-5 h-5 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
          <div>
            <p class="text-xs font-semibold text-white">Toque no botão Compartilhar</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Na barra de ferramentas inferior do Safari (ícone de quadrado com seta para cima <i data-lucide="share" class="w-3.5 h-3.5 inline"></i>).</p>
          </div>
        </div>

        <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <span class="w-5 h-5 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
          <div>
            <p class="text-xs font-semibold text-white">Adicionar à Tela de Início</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Role a lista de opções e selecione <strong>"Adicionar à Tela de Início"</strong> <i data-lucide="plus-square" class="w-3.5 h-3.5 inline"></i>.</p>
          </div>
        </div>

        <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <span class="w-5 h-5 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
          <div>
            <p class="text-xs font-semibold text-white">Confirmar e Abrir</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Toque em <strong>"Adicionar"</strong> no canto superior direito. O ícone oficial do GEF aparecerá no seu ecrã.</p>
          </div>
        </div>
      </div>

      <button id="btnDismissIosPwa" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition">
        Entendido
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();

  const close = () => modal.remove();
  modal.querySelector('#btnCloseIosPwaModal')?.addEventListener('click', close);
  modal.querySelector('#btnDismissIosPwa')?.addEventListener('click', close);
}

/**
 * Toast de atualização de versão do Service Worker
 */
function showUpdateToast() {
  const existingToast = document.getElementById('pwaUpdateToast');
  if (existingToast) return;

  const toast = document.createElement('div');
  toast.id = 'pwaUpdateToast';
  toast.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-3 p-3.5 rounded-2xl bg-slate-900 border border-orange-500/40 shadow-xl shadow-black/60 text-xs text-white';
  toast.innerHTML = `
    <div class="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping"></div>
    <div>
      <span class="font-bold">Nova atualização disponível!</span>
      <p class="text-[11px] text-slate-400">Recarregue para aplicar melhorias no GEF.</p>
    </div>
    <button id="btnReloadPwa" class="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition">
      Atualizar
    </button>
  `;

  document.body.appendChild(toast);
  toast.querySelector('#btnReloadPwa')?.addEventListener('click', () => {
    if (updateSWHandler) updateSWHandler(true);
    else window.location.reload();
  });
}

/**
 * Monitor de Conectividade de Rede (Online / Offline)
 */
function setupOfflineMonitor() {
  let indicator = document.getElementById('gefOfflineIndicator');

  const updateStatus = () => {
    const isOnline = navigator.onLine;
    notifyListeners();

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'gefOfflineIndicator';
      indicator.className = 'fixed bottom-4 left-4 z-50 transition-all duration-300 pointer-events-none hidden';
      document.body.appendChild(indicator);
    }

    if (!isOnline) {
      indicator.innerHTML = `
        <div class="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold shadow-lg shadow-black/50 border border-amber-400/30">
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span>Modo Offline — O GEF está operando com cache local</span>
        </div>
      `;
      indicator.classList.remove('hidden');
    } else {
      if (!indicator.classList.contains('hidden')) {
        indicator.innerHTML = `
          <div class="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-black/50 border border-emerald-400/30">
            <span class="w-2 h-2 rounded-full bg-white"></span>
            <span>Conexão restabelecida</span>
          </div>
        `;
        setTimeout(() => {
          indicator.classList.add('hidden');
        }, 2500);
      }
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

/**
 * Cria ou atualiza o botão de instalação no elemento fornecido
 */
export function mountPWAInstallButton(containerElement) {
  if (!containerElement) return;

  const renderBtn = () => {
    const { isInstalled, isInstallable, isIOS } = getPWAState();

    // Se já estiver em modo standalone, ocultar botão de instalação
    if (isInstalled) {
      containerElement.innerHTML = '';
      return;
    }

    if (isInstallable) {
      containerElement.innerHTML = `
        <button id="btnPWAInstallApp" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-md shadow-orange-950/40 transition active:scale-95 cursor-pointer">
          <i data-lucide="download" class="w-3.5 h-3.5"></i>
          <span>Instalar App</span>
        </button>
      `;
      if (window.lucide) window.lucide.createIcons();

      containerElement.querySelector('#btnPWAInstallApp')?.addEventListener('click', () => {
        promptPWAInstall();
      });
      return;
    }

    if (isIOS) {
      containerElement.innerHTML = `
        <button id="btnPWAInstallIOS" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition active:scale-95 cursor-pointer">
          <i data-lucide="share" class="w-3.5 h-3.5 text-orange-400"></i>
          <span>Instalar no iOS</span>
        </button>
      `;
      if (window.lucide) window.lucide.createIcons();

      containerElement.querySelector('#btnPWAInstallIOS')?.addEventListener('click', () => {
        showIOSGuideModal();
      });
      return;
    }

    // Caso não seja instalável ainda, não exibir nada
    containerElement.innerHTML = '';
  };

  onPWAStateChange(renderBtn);
}
