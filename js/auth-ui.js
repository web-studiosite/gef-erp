/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Interface de Autenticação & Cadastro de Lojas (js/auth-ui.js)
 * Requisitos 11 e 12: Login e Cadastro da Loja + Primeiro ADMIN
 */

import { loginWithPassword, registerStoreAndAdmin, getCurrentUser, getDefaultRouteForRole } from './auth.js';
import { testConnection, getCredentials } from './supabase.js';
import { navigateTo } from './router.js';
import { getGefLogoSvg } from './logo.js';
import { mountPWAInstallButton } from './pwa.js';

/**
 * Renderiza a tela de Login Oficial
 */
export function renderLoginView(container) {
  container.innerHTML = `
    <div class="min-h-[85vh] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-xs text-slate-200">
        <!-- Logo e Cabeçalho Oficial GEF -->
        <div class="text-center space-y-3">
          <div class="flex justify-center mb-1">
            ${getGefLogoSvg('full', { className: 'w-60 h-auto max-w-full drop-shadow-md' })}
          </div>
          <p class="text-xs text-slate-400">Gestão Empresarial e Financeira para Materiais de Construção</p>
        </div>

        <!-- Banner de Erro -->
        <div id="loginErrorBanner" class="hidden p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs"></div>

        <!-- Formulário de Login -->
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">E-mail de Acesso *</label>
            <div class="relative">
              <i data-lucide="mail" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
              <input
                type="email"
                id="loginEmail"
                required
                placeholder="seu-email@empresa.co.mz"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-hidden focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-xs font-semibold text-slate-300">Palavra-passe *</label>
            </div>
            <div class="relative">
              <i data-lucide="lock" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
              <input
                type="password"
                id="loginPassword"
                required
                placeholder="••••••••"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-hidden focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            id="btnLoginSubmit"
            class="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <i data-lucide="log-in" class="w-4 h-4"></i>
            <span>Iniciar Sessão</span>
          </button>
        </form>

        <!-- Divisor -->
        <div class="relative flex py-1 items-center">
          <div class="flex-grow border-t border-slate-800"></div>
          <span class="shrink mx-4 text-slate-500 text-[10px] font-mono uppercase">Ou</span>
          <div class="flex-grow border-t border-slate-800"></div>
        </div>

        <!-- Botão Criar Nova Loja (Requisito 11) -->
        <div class="text-center space-y-2">
          <button
            id="btnGoRegisterStore"
            class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <i data-lucide="plus-circle" class="w-4 h-4 text-orange-400"></i>
            <span>Cadastrar Minha Loja & Administrador</span>
          </button>
          <span class="block text-[10px] text-slate-500">
            Plano gratuito disponível sem necessidade de cartão de crédito.
          </span>
        </div>

        <!-- Status de Conexão com o Supabase -->
        <div class="pt-2 border-t border-slate-800 text-center space-y-2">
          <div id="loginPwaInstallContainer" class="flex justify-center"></div>
          <div id="loginConnStatus" class="inline-flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
            <span class="w-2 h-2 rounded-full bg-slate-600 animate-ping"></span>
            <span>Verificando conexão com o banco...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  mountPWAInstallButton(container.querySelector('#loginPwaInstallContainer'));

  const form = container.querySelector('#loginForm');
  const errorBanner = container.querySelector('#loginErrorBanner');
  const submitBtn = container.querySelector('#btnLoginSubmit');
  const goRegisterBtn = container.querySelector('#btnGoRegisterStore');
  const connStatus = container.querySelector('#loginConnStatus');

  // Checar conexão
  testConnection().then(res => {
    if (res.connected) {
      connStatus.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span class="text-emerald-400 font-bold">Supabase PostgreSQL Conectado</span>
      `;
    } else {
      connStatus.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-red-400"></span>
        <span class="text-red-400">Banco Offline (${res.message})</span>
      `;
    }
  });

  goRegisterBtn.addEventListener('click', () => {
    navigateTo('register-store');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.classList.add('hidden');
    errorBanner.textContent = '';

    const email = container.querySelector('#loginEmail').value;
    const pass = container.querySelector('#loginPassword').value;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i>
      <span>Autenticando no Supabase...</span>
    `;
    if (window.lucide) window.lucide.createIcons();

    const res = await loginWithPassword(email, pass);
    if (res.success) {
      const user = getCurrentUser();
      const nextRoute = getDefaultRouteForRole(user?.role);
      navigateTo(nextRoute);
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <i data-lucide="log-in" class="w-4 h-4"></i>
        <span>Iniciar Sessão</span>
      `;
      if (window.lucide) window.lucide.createIcons();

      errorBanner.textContent = res.error || 'Credenciais inválidas. Verifique seu e-mail e senha.';
      errorBanner.classList.remove('hidden');
    }
  });
}

/**
 * Renderiza o Cadastro de Nova Loja + Primeiro ADMIN (Requisito 11)
 */
export function renderRegisterStoreView(container) {
  container.innerHTML = `
    <div class="min-h-[85vh] flex items-center justify-center p-4">
      <div class="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-xs text-slate-200">
        <!-- Topo -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-800">
          <div class="flex items-center gap-3">
            ${getGefLogoSvg('icon', { className: 'w-10 h-10 shrink-0' })}
            <div>
              <h1 class="text-xl font-extrabold text-white flex items-center gap-2">
                Cadastro da Empresa & Primeiro ADMIN
              </h1>
              <p class="text-xs text-slate-400 mt-0.5">
                Criação oficial da loja e do usuário com permissão ADMIN no GEF Enterprise.
              </p>
            </div>
          </div>
          <button id="btnBackToLogin" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold">
            Voltar ao Login
          </button>
        </div>

        <div id="regErrorBanner" class="hidden p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs"></div>

        <form id="registerStoreForm" class="space-y-4">
          <!-- Bloco 1: Dados da Loja -->
          <div class="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
            <h3 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="store" class="w-4 h-4 text-orange-400"></i>
              <span>1. Informações da Loja / Depósito</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Nome da Empresa / Razão Social *</label>
                <input type="text" id="regStoreName" required placeholder="Ex: Depósito Central Matola" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Nome Comercial / Fantasia</label>
                <input type="text" id="regTradeName" placeholder="Ex: Matola Materiais" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Código da Loja (Opcional)</label>
                <input type="text" id="regStoreCode" placeholder="Ex: MAT-01" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Cidade / Província *</label>
                <input type="text" id="regCity" required value="Maputo" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">NUIT / NIF</label>
                <input type="text" id="regNuit" placeholder="400000000" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Plano Inicial (Requisito 23)</label>
                <select id="regPlan" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold text-orange-400">
                  <option value="FREE" selected>Plano Gratuito (Completo - Sem Cartão)</option>
                  <option value="PRO">Plano Profissional</option>
                  <option value="ENTERPRISE">Plano Enterprise</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Bloco 2: Administrador Inicial -->
          <div class="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
            <h3 class="font-bold text-white text-xs flex items-center gap-1.5">
              <i data-lucide="user-check" class="w-4 h-4 text-orange-400"></i>
              <span>2. Usuário Administrador (Primeiro ADMIN)</span>
            </h3>

            <div>
              <label class="block font-semibold text-slate-300 mb-1">Nome Completo do Gestor / Proprietário *</label>
              <input type="text" id="regAdminName" required placeholder="Ex: Carlos Alberto" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-slate-300 mb-1">E-mail Principal de Acesso *</label>
                <input type="email" id="regAdminEmail" required placeholder="gestor@empresa.co.mz" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              <div>
                <label class="block font-semibold text-slate-300 mb-1">Palavra-passe *</label>
                <input type="password" id="regAdminPassword" required minlength="6" placeholder="Mínimo 6 caracteres" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
              </div>
            </div>
          </div>

          <!-- Código de Embaixador / Indicação (Opcional) -->
          <div>
            <label class="block font-semibold text-slate-400 mb-1">Código de Indicação / Embaixador (Opcional)</label>
            <input type="text" id="regReferralCode" placeholder="Ex: EMB-1029" class="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono uppercase" />
          </div>

          <button
            type="submit"
            id="btnSubmitRegisterStore"
            class="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Criar Loja e Acessar como Administrador</span>
          </button>
        </form>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const form = container.querySelector('#registerStoreForm');
  const backBtn = container.querySelector('#btnBackToLogin');
  const errorBanner = container.querySelector('#regErrorBanner');
  const submitBtn = container.querySelector('#btnSubmitRegisterStore');

  // Checar se há código de indicação na URL (?ref=...)
  const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]);
  if (params.get('ref')) {
    container.querySelector('#regReferralCode').value = params.get('ref');
  }

  backBtn.addEventListener('click', () => navigateTo('login'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i>
      <span>Gravando loja e perfil ADMIN no PostgreSQL...</span>
    `;
    if (window.lucide) window.lucide.createIcons();

    const storeData = {
      name: container.querySelector('#regStoreName').value,
      tradeName: container.querySelector('#regTradeName').value,
      code: container.querySelector('#regStoreCode').value,
      city: container.querySelector('#regCity').value,
      cnpj_nif: container.querySelector('#regNuit').value,
      plan: container.querySelector('#regPlan').value,
      referralCode: container.querySelector('#regReferralCode').value
    };

    const adminData = {
      fullName: container.querySelector('#regAdminName').value,
      email: container.querySelector('#regAdminEmail').value,
      password: container.querySelector('#regAdminPassword').value
    };

    const res = await registerStoreAndAdmin(storeData, adminData);

    if (res.success) {
      alert(`Loja "${storeData.name}" cadastrada com sucesso!\nVocê já está conectado como Administrador.`);
      navigateTo('dashboard');
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <i data-lucide="check-circle" class="w-4 h-4"></i>
        <span>Criar Loja e Acessar como Administrador</span>
      `;
      if (window.lucide) window.lucide.createIcons();

      errorBanner.textContent = res.error || 'Falha ao registrar loja. Tente novamente.';
      errorBanner.classList.remove('hidden');
    }
  });
}
