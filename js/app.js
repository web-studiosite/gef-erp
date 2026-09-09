/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Controlador Principal da Aplicação (js/app.js)
 * Orquestra Sessão, Shell Dinâmica (Sidebar e Navbar), Roteamento e Modais
 */

import { initSupabase, getCredentials, getCurrentStoreId, setCurrentStoreId } from './supabase.js';
import { syncSession, syncSessionWithTimeout, getCurrentUser, logoutUser, getDefaultRouteForRole, isRouteAuthorized } from './auth.js';
import { initRouter, navigateTo, onRouteChange, getAuthorizedMenu, getActiveRoute } from './router.js';
import { getGefLogoSvg, navigateToUserHome, setupBrandHomeListeners } from './logo.js';
import { renderLucideIcons } from './icons.js';

// Importação dos Módulos de Interface
import { renderLoginView, renderRegisterStoreView } from './auth-ui.js';
import { renderDashboardView } from './dashboard.js';
import { renderPosView } from './pos.js';
import { renderProductsView } from './products.js';
import { renderStockView } from './stock.js';
import { renderSalesView } from './sales.js';
import { renderCustomersView } from './customers.js';
import { renderReportsView } from './reports.js';
import { renderUsersView } from './users.js';
import { renderSettingsView } from './settings.js';
import { renderAuditView } from './audit.js';
import { renderAmbassadorView } from './ambassador.js';
import { renderMonitorView } from './monitor.js';
import { renderCashView } from './cash.js';
import { initPWA, mountPWAInstallButton } from './pwa.js';

/**
 * Inicialização Instantânea e Resiliente do Sistema GEF
 */
export function bootstrapGEF() {
  console.log('[GEF] Inicialização instantânea do GEF Enterprise iniciada...');

  const appContainer = document.getElementById('app');

  try {
    // 1. Inicializar cliente Supabase com credenciais salvas (operação síncrona em memória)
    const creds = getCredentials();
    initSupabase(creds.url, creds.key);

    // 2. Montar a casca visual (Shell) e registrar ouvinte de rotas IMEDIATAMENTE
    setupShell();

    // 3. Inicializar roteador IMEDIATAMENTE (substitui o splash instantaneamente por login ou dashboard)
    initRouter();

    // 4. Inicializar infraestrutura de ícones offline
    renderLucideIcons(document);

    // 5. Inicializar PWA de modo seguro e não-bloqueante
    try {
      initPWA();
    } catch (pwaErr) {
      console.warn('[GEF PWA] Alerta na inicialização do PWA:', pwaErr);
    }

    // 6. Sincronizar sessão em segundo plano SEM travar a UI (timeout defensivo de 2.5s)
    syncSessionWithTimeout(2500)
      .then(user => {
        if (user) {
          console.log('[GEF] Sessão sincronizada com sucesso:', user.email, user.role);
          const currentRoute = getActiveRoute();
          if (currentRoute === 'login' || currentRoute === 'register-store') {
            navigateTo(getDefaultRouteForRole(user.role));
          }
        }
      })
      .catch(syncErr => {
        console.warn('[GEF] Sincronização em segundo plano concluída:', syncErr);
      });

  } catch (err) {
    console.error('[GEF] Erro ao inicializar aplicação:', err);
    // Recuperação de emergência: se o splash ainda estiver no #app, renderizar tela de login direto
    if (appContainer) {
      try {
        renderLoginView(appContainer);
        renderLucideIcons(appContainer);
      } catch (critErr) {
        console.error('[GEF] Falha crítica na renderização:', critErr);
      }
    }
  }
}

/**
 * Monta e atualiza a estrutura principal da página (Sidebar, Navbar, Container)
 */
function setupShell() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  onRouteChange(async (route, metadata) => {
    const user = getCurrentUser();

    // Se for tela de login ou registro de loja, ocultar sidebar e navbar
    if (route === 'login' || route === 'register-store' || !user) {
      appContainer.innerHTML = `<main id="viewContainer" class="min-h-screen bg-slate-950 text-slate-100"></main>`;
      const viewContainer = document.getElementById('viewContainer');
      if (route === 'register-store') {
        renderRegisterStoreView(viewContainer);
      } else {
        renderLoginView(viewContainer);
      }
      return;
    }

    // Estrutura com Autenticação Ativa: Navbar Superior + Sidebar Lateral + Conteúdo
    const currentSidebar = document.getElementById('mainSidebar');
    if (!currentSidebar) {
      renderAuthenticatedShell(appContainer, user);
    }

    // Atualizar menu lateral ativo
    updateSidebarActiveState(route, user);

    // Carregar a view da rota solicitada
    const targetContainer = document.getElementById('viewContainer');
    if (targetContainer) {
      targetContainer.innerHTML = `
        <div class="py-12 text-center text-slate-500 text-xs">
          <i data-lucide="refresh-cw" class="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2"></i>
          Carregando módulo do PostgreSQL...
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();

      try {
        switch (route) {
          case 'dashboard':
            await renderDashboardView(targetContainer);
            break;
          case 'pos':
            await renderPosView(targetContainer);
            break;
          case 'products':
            await renderProductsView(targetContainer);
            break;
          case 'stock':
          case 'transfers':
          case 'losses':
            await renderStockView(targetContainer);
            break;
          case 'sales':
            await renderSalesView(targetContainer);
            break;
          case 'customers':
            await renderCustomersView(targetContainer);
            break;
          case 'cash':
            await renderCashView(targetContainer);
            break;
          case 'reports':
            await renderReportsView(targetContainer);
            break;
          case 'users':
            await renderUsersView(targetContainer);
            break;
          case 'settings':
            await renderSettingsView(targetContainer);
            break;
          case 'audit':
            await renderAuditView(targetContainer);
            break;
          case 'ambassadors':
            await renderAmbassadorView(targetContainer);
            break;
          case 'monitor':
          case 'stores':
            await renderMonitorView(targetContainer);
            break;
          default:
            const defRoute = getDefaultRouteForRole(user.role);
            if (defRoute !== route) {
              navigateTo(defRoute);
            } else {
              await renderDashboardView(targetContainer);
            }
            break;
        }

        // Garantir que todos os links de marca no conteúdo naveguem para o Home
        setupBrandHomeListeners(targetContainer);
      } catch (err) {
        console.error('Erro ao renderizar view:', err);
        targetContainer.innerHTML = `
          <div class="p-6 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs">
            <h3 class="font-bold text-sm text-red-300 mb-1">Falha na Operação</h3>
            <p>${err.message || 'Não foi possível carregar as informações do banco de dados.'}</p>
          </div>
        `;
      }
    }
  });
}

/**
 * Renderiza o Layout Autenticado com Sidebar e Header
 */
function renderAuthenticatedShell(container, user) {
  const roleBadges = {
    SUPERADMIN: 'bg-red-950 text-red-300 border-red-500/40',
    ADMIN: 'bg-orange-950 text-orange-300 border-orange-500/40',
    GERENTE: 'bg-amber-950 text-amber-300 border-amber-500/40',
    CASHIER: 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
    ESTOQUISTA: 'bg-cyan-950 text-cyan-300 border-cyan-500/40',
    EMBAIXADOR: 'bg-purple-950 text-purple-300 border-purple-500/40'
  };
  const roleBadgeClass = roleBadges[user.role] || 'bg-slate-800 text-slate-300 border-slate-700';

  container.innerHTML = `
    <div class="min-h-screen flex bg-slate-950 text-slate-100">
      <!-- Sidebar Lateral -->
      <aside id="mainSidebar" class="fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 -translate-x-full lg:translate-x-0">
        <!-- Logo e Nome do Sistema na Sidebar com clique para Home -->
        <div class="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <button type="button" class="gef-brand-link flex items-center gap-2.5 transition hover:opacity-90 cursor-pointer text-left focus:outline-hidden group" title="Ir para Página Inicial (Home)">
            ${getGefLogoSvg('icon', { className: 'w-9 h-9 shrink-0 group-hover:scale-105 transition-transform' })}
            <div class="flex flex-col">
              <span class="font-black text-sm text-white tracking-tight group-hover:text-orange-400 transition leading-tight">GEF ENTERPRISE</span>
              <span class="text-[9px] font-mono text-orange-400 font-bold uppercase tracking-wider">Gestão Real</span>
            </div>
          </button>
          <button id="btnCloseSidebar" class="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white" title="Fechar Menu">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Menu Lateral com Grupos (Requisito 7, Item 6: Apenas itens permitidos pelo RBAC) -->
        <div id="sidebarNavContent" class="flex-1 overflow-y-auto px-3 py-4 space-y-5 text-xs font-semibold"></div>

        <!-- Rodapé da Sidebar com Usuário, PWA & Logout -->
        <div class="p-3 border-t border-slate-800 bg-slate-900/80 space-y-2">
          <!-- Container de Instalação PWA na Sidebar -->
          <div id="sidebarPwaInstallContainer"></div>

          <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div class="min-w-0 flex-1">
              <div class="font-bold text-xs text-white truncate">${user.fullName}</div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold border ${roleBadgeClass}">
                  ${user.role}
                </span>
              </div>
            </div>
            <button id="btnLogoutBtn" class="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition" title="Terminar Sessão">
              <i data-lucide="log-out" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </aside>

      <!-- Overlay para Mobile -->
      <div id="sidebarOverlay" class="fixed inset-0 z-30 bg-black/70 backdrop-blur-xs hidden lg:hidden"></div>

      <!-- Conteúdo Principal -->
      <div class="flex-1 flex flex-col lg:pl-64 min-w-0">
        <!-- Barra de Navegação Superior com Logo, Nome do Sistema e clique para Home -->
        <header class="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6">
          <div class="flex items-center gap-3 sm:gap-4">
            <button id="btnOpenSidebar" class="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white" title="Menu">
              <i data-lucide="menu" class="w-5 h-5"></i>
            </button>
            <!-- Logo e Nome do Sistema no Topo (Clicar leva ao Home pós login) -->
            <button type="button" class="gef-brand-link flex items-center gap-2.5 transition hover:opacity-95 cursor-pointer text-left focus:outline-hidden group" title="Ir para Página Inicial (Home)">
              ${getGefLogoSvg('icon', { className: 'w-8 h-8 shrink-0 group-hover:scale-105 transition-transform' })}
              <div class="flex flex-col">
                <span class="font-black text-sm sm:text-base text-white tracking-tight group-hover:text-orange-400 transition leading-tight">GEF ENTERPRISE</span>
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span class="text-[9px] font-mono text-slate-400 font-semibold uppercase tracking-wider">
                    ${user.role === 'SUPERADMIN' ? 'Modo Global SaaS' : 'Filial Conectada'}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div class="flex items-center gap-2.5">
            <!-- Botão de Instalação PWA na Barra Superior -->
            <div id="topPwaInstallContainer"></div>

            <!-- Atalho Rápido PDV se permitido pela Role -->
            ${isRouteAuthorized(user.role, 'pos') ? `
              <button id="topNavPosBtn" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-md shadow-orange-950/40 transition active:scale-95">
                <i data-lucide="shopping-cart" class="w-3.5 h-3.5"></i>
                <span>PDV / Venda Rápida (F4)</span>
              </button>
            ` : ''}
          </div>
        </header>

        <!-- Container Dinâmico das Views -->
        <main id="viewContainer" class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto"></main>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Conectar botões de instalação PWA
  mountPWAInstallButton(container.querySelector('#topPwaInstallContainer'));
  mountPWAInstallButton(container.querySelector('#sidebarPwaInstallContainer'));

  // Registrar ouvintes para navegação de Home na Logo e no Nome do Topo / Sidebar
  setupBrandHomeListeners(container);

  // Controle do menu mobile
  const sidebar = container.querySelector('#mainSidebar');
  const overlay = container.querySelector('#sidebarOverlay');
  const openBtn = container.querySelector('#btnOpenSidebar');
  const closeBtn = container.querySelector('#btnCloseSidebar');

  const toggleSidebar = (show) => {
    if (show) {
      sidebar.classList.remove('-translate-x-full');
      overlay.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }
  };

  openBtn?.addEventListener('click', () => toggleSidebar(true));
  closeBtn?.addEventListener('click', () => toggleSidebar(false));
  overlay?.addEventListener('click', () => toggleSidebar(false));

  // Botão Sair
  container.querySelector('#btnLogoutBtn')?.addEventListener('click', async () => {
    if (confirm('Deseja realmente terminar a sua sessão?')) {
      await logoutUser();
      navigateTo('login');
    }
  });

  // Botão Topo PDV
  container.querySelector('#topNavPosBtn')?.addEventListener('click', () => {
    navigateTo('pos');
  });

  updateSidebarMenu(user);
}

/**
 * Renderiza os itens do menu lateral baseado nas permissões autorizadas (Requisito 7, Item 6)
 */
function updateSidebarMenu(user) {
  const navContent = document.getElementById('sidebarNavContent');
  if (!navContent) return;

  const menuGroups = getAuthorizedMenu(user.role);

  navContent.innerHTML = menuGroups.map(grp => `
    <div class="space-y-1">
      <span class="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block">
        ${grp.group}
      </span>
      <div class="space-y-0.5">
        ${grp.items.map(item => `
          <a
            href="#/${item.id}"
            data-route="${item.id}"
            class="sidebar-nav-link flex items-center justify-between px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition group"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <i data-lucide="${item.icon}" class="w-4 h-4 text-slate-400 group-hover:text-orange-400 transition"></i>
              <span class="truncate">${item.label}</span>
            </div>
            ${item.highlight ? `
              <span class="px-1.5 py-0.2 rounded bg-orange-950 text-orange-400 text-[9px] font-mono font-bold border border-orange-500/30">
                F4
              </span>
            ` : ''}
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();

  // Fechar sidebar no mobile ao clicar em um link
  navContent.querySelectorAll('.sidebar-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const sidebar = document.getElementById('mainSidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar && overlay && window.innerWidth < 1024) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
      }
    });
  });
}

/**
 * Atualiza o destaque visual da rota ativa no menu
 */
function updateSidebarActiveState(activeRoute, user) {
  const links = document.querySelectorAll('.sidebar-nav-link');
  links.forEach(link => {
    const route = link.dataset.route;
    if (route === activeRoute) {
      link.className = 'sidebar-nav-link flex items-center justify-between px-3 py-2 rounded-xl bg-orange-600/15 text-orange-400 font-bold border border-orange-500/30 shadow-xs';
    } else {
      link.className = 'sidebar-nav-link flex items-center justify-between px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition group';
    }
  });
}

// Exposição global para o watchdog e testes
if (typeof window !== 'undefined') {
  window.bootstrapGEF = bootstrapGEF;
}

// Inicializar imediatamente se o documento já estiver carregado ou aguardar DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootstrapGEF();
  });
} else {
  bootstrapGEF();
}
