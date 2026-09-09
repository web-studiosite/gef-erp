/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Roteamento, Proteção de Rotas & Route Guard (js/router.js)
 * Constrói o menu dinamicamente e bloqueia acessos não autorizados
 */

import { getCurrentUser, isRouteAllowed, getDefaultRouteForRole, normalizeRole } from './auth.js';

// Definição de todos os módulos do GEF
export const ALL_NAV_ITEMS = [
  // SuperAdmin Global
  { id: 'monitor', label: 'Monitor SaaS & Trava', icon: 'shield-check', group: 'SaaS Global', superadminOnly: true },
  { id: 'stores', label: 'Lojas & Filiais', icon: 'building-2', group: 'SaaS Global', superadminOnly: true },
  { id: 'ambassadors', label: 'Embaixadores / Parceiros', icon: 'award', group: 'SaaS Global' },
  
  // Operacional Loja
  { id: 'dashboard', label: 'Painel da Loja', icon: 'layout-dashboard', group: 'Visão Geral' },
  { id: 'pos', label: 'PDV / Frente de Caixa', icon: 'shopping-cart', group: 'Vendas', highlight: true },
  { id: 'sales', label: 'Vendas & Estornos', icon: 'receipt', group: 'Vendas' },
  { id: 'products', label: 'Catálogo de Produtos', icon: 'package', group: 'Estoque' },
  { id: 'stock', label: 'Estoque & Matriz FEFO', icon: 'layers', group: 'Estoque' },
  { id: 'transfers', label: 'Transferências Internas', icon: 'arrow-left-right', group: 'Estoque' },
  { id: 'losses', label: 'Perdas & Avarias', icon: 'trash-2', group: 'Estoque' },
  { id: 'cash', label: 'Caixa & Turnos', icon: 'landmark', group: 'Financeiro' },
  { id: 'customers', label: 'Clientes & Fiado', icon: 'users', group: 'Financeiro' },
  { id: 'users', label: 'Equipe da Loja', icon: 'user-check', group: 'Administração', adminOnly: true },
  { id: 'reports', label: 'Relatórios & DRE', icon: 'file-bar-chart', group: 'Administração' },
  { id: 'audit', label: 'Trilha de Auditoria', icon: 'history', group: 'Governança' },
  { id: 'settings', label: 'Configurações da Loja', icon: 'settings', group: 'Configuração' }
];

let activeRoute = 'pos';
let routeChangeCallbacks = new Set();

/**
 * Registra callback para mudanças de rota
 */
export function onRouteChange(cb) {
  routeChangeCallbacks.add(cb);
  return () => routeChangeCallbacks.delete(cb);
}

/**
 * Obtém a rota ativa atual
 */
export function getActiveRoute() {
  return activeRoute;
}

/**
 * Navega para uma nova rota aplicando o Route Guard (Requisito 10)
 */
export function navigateTo(targetRoute) {
  const user = getCurrentUser();
  const cleanRoute = (targetRoute || '').replace(/^#\/?/, '').toLowerCase() || 'pos';

  // Se não estiver logado, rota fixa é login
  if (!user) {
    activeRoute = 'login';
    window.location.hash = '#/login';
    triggerCallbacks('login');
    return;
  }

  // Verificar se o usuário tem permissão para a rota (Requisito 10)
  if (!isRouteAllowed(cleanRoute, user.role)) {
    console.warn(`[Route Guard] Acesso negado à rota "${cleanRoute}" para o perfil "${user.role}". Redirecionando para área autorizada.`);
    const fallbackRoute = getDefaultRouteForRole(user.role);
    activeRoute = fallbackRoute;
    window.location.hash = `#/${fallbackRoute}`;
    triggerCallbacks(fallbackRoute, { accessDenied: true, attempted: cleanRoute });
    return;
  }

  activeRoute = cleanRoute;
  window.location.hash = `#/${cleanRoute}`;
  triggerCallbacks(cleanRoute);
}

function triggerCallbacks(route, metadata = {}) {
  routeChangeCallbacks.forEach(cb => {
    try {
      cb(route, metadata);
    } catch (e) {
      console.error('Erro no callback de rota:', e);
    }
  });
}

/**
 * Inicializa os ouvintes de hashchange na janela
 */
export function initRouter() {
  window.addEventListener('hashchange', () => {
    const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const user = getCurrentUser();
    if (!user) {
      navigateTo('login');
    } else {
      navigateTo(raw || getDefaultRouteForRole(user.role));
    }
  });

  // Roteamento inicial
  const user = getCurrentUser();
  if (!user) {
    navigateTo('login');
  } else {
    const initialRaw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    navigateTo(initialRaw || getDefaultRouteForRole(user.role));
  }
}

/**
 * Constrói o menu lateral com APENAS os módulos autorizados (Requisito 7, Item 6)
 */
export function getAuthorizedMenu(role) {
  const normRole = normalizeRole(role);
  const items = ALL_NAV_ITEMS.filter(item => isRouteAllowed(item.id, normRole));

  // Agrupar itens por seção
  const groups = {};
  items.forEach(item => {
    if (!groups[item.group]) {
      groups[item.group] = [];
    }
    groups[item.group].push(item);
  });

  return Object.entries(groups).map(([groupName, groupItems]) => ({
    group: groupName,
    items: groupItems
  }));
}
