/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Identidade Visual e Logotipo Oficial (js/logo.js)
 * 
 * Logotipo GEF com gráfico financeiro ascendente e seta unindo as 3 letras (G-E-F),
 * com paleta perfeitamente compatível com o sistema (Laranja #ea580c / #f97316, Âmbar #f59e0b e Slate #0f172a).
 */

import { getCurrentUser, getDefaultRouteForRole } from './auth.js';
import { navigateTo } from './router.js';

/**
 * Retorna o SVG do Logotipo GEF
 * @param {'full'|'icon'|'badge'|'text'} variant - Variação do logotipo
 * @param {Object} options - Opções adicionais (className, id, size)
 */
export function getGefLogoSvg(variant = 'full', options = {}) {
  const className = options.className || '';
  const idSuffix = options.id || Math.random().toString(36).substring(2, 7);

  if (variant === 'icon') {
    // Ícone quadrado / insígnia com as 3 letras GEF unidas pela seta ascendente de gráfico
    return `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="${className}" style="display:inline-block; vertical-align:middle;">
        <defs>
          <linearGradient id="gefGradIcon_${idSuffix}" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ea580c"/>
            <stop offset="50%" stop-color="#f97316"/>
            <stop offset="100%" stop-color="#fbbf24"/>
          </linearGradient>
          <linearGradient id="gefBgIcon_${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          <filter id="gefGlowIcon_${idSuffix}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#ea580c" flood-opacity="0.4"/>
          </filter>
        </defs>

        <!-- Fundo com Borda Elegante -->
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#gefBgIcon_${idSuffix})" stroke="#334155" stroke-width="1.5"/>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="url(#gefGradIcon_${idSuffix})" stroke-width="1.5" stroke-opacity="0.4"/>

        <!-- Grid sutil de gráfico financeiro ao fundo -->
        <line x1="12" y1="44" x2="52" y2="44" stroke="#334155" stroke-width="1" stroke-dasharray="2 2" opacity="0.4"/>
        <line x1="12" y1="30" x2="52" y2="30" stroke="#334155" stroke-width="1" stroke-dasharray="2 2" opacity="0.3"/>
        <line x1="12" y1="18" x2="52" y2="18" stroke="#334155" stroke-width="1" stroke-dasharray="2 2" opacity="0.2"/>

        <!-- Letras G - E - F em tipografia geométrica encorpada -->
        <text x="32" y="43" text-anchor="middle" font-family="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" font-weight="900" font-size="22" letter-spacing="2.5" fill="#FFFFFF">GEF</text>

        <!-- Seta de Gráfico Ascendente Conectando as 3 Letras G -> E -> F -->
        <g filter="url(#gefGlowIcon_${idSuffix})">
          <!-- Linha contínua do gráfico unindo o G, passando pelo E e subindo no F -->
          <path d="M 12 45 L 23 37 L 35 32 L 48 18 L 52 14" stroke="url(#gefGradIcon_${idSuffix})" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
          
          <!-- Ponta da Seta no topo direito -->
          <polygon points="54,12 44,14 52,22" fill="#fbbf24"/>

          <!-- Nós de dados do gráfico nos pontos de inflexão -->
          <circle cx="12" cy="45" r="2.2" fill="#ea580c" stroke="#0f172a" stroke-width="1.2"/>
          <circle cx="23" cy="37" r="2.2" fill="#f97316" stroke="#0f172a" stroke-width="1.2"/>
          <circle cx="35" cy="32" r="2.2" fill="#f59e0b" stroke="#0f172a" stroke-width="1.2"/>
          <circle cx="48" cy="18" r="2.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1.2"/>
        </g>
      </svg>
    `;
  }

  if (variant === 'badge') {
    // Versão compacta horizontal
    return `
      <div class="inline-flex items-center gap-2.5 ${className}">
        ${getGefLogoSvg('icon', { className: 'w-8 h-8 shrink-0' })}
        <div class="flex flex-col leading-none">
          <span class="font-black text-sm text-white tracking-tight font-sans">GEF ENTERPRISE</span>
          <span class="text-[9px] font-mono text-orange-400 font-bold uppercase tracking-wider mt-0.5">Gestão Real</span>
        </div>
      </div>
    `;
  }

  // Versão 'full' — Logotipo completo horizontal com letras GEF interligadas pela seta gráfica
  return `
    <svg viewBox="0 0 220 54" fill="none" xmlns="http://www.w3.org/2000/svg" class="${className}" style="display:inline-block; vertical-align:middle;">
      <defs>
        <linearGradient id="gefGradFull_${idSuffix}" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ea580c"/>
          <stop offset="45%" stop-color="#f97316"/>
          <stop offset="100%" stop-color="#fbbf24"/>
        </linearGradient>
        <filter id="gefGlowFull_${idSuffix}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#ea580c" flood-opacity="0.5"/>
        </filter>
      </defs>

      <!-- Grade financeira de referência sutil -->
      <line x1="8" y1="46" x2="120" y2="46" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" opacity="0.3"/>
      <line x1="8" y1="32" x2="120" y2="32" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" opacity="0.25"/>
      <line x1="8" y1="16" x2="120" y2="16" stroke="#334155" stroke-width="1" stroke-dasharray="3 3" opacity="0.2"/>

      <!-- Letras GEF em destaque -->
      <text x="8" y="44" font-family="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" font-weight="900" font-size="38" letter-spacing="4.5" fill="#FFFFFF">GEF</text>

      <!-- Seta de Gráfico Ascendente Unindo as 3 Letras:
           Inicia na base do 'G' (x:8, y:46),
           Ascende pelo centro do 'E' (x:56, y:30),
           Cruza e sobe pelo 'F' (x:94, y:18),
           Finaliza em seta triunfante apontando para o alto (x:114, y:6) -->
      <g filter="url(#gefGlowFull_${idSuffix})">
        <!-- Linha do gráfico -->
        <path d="M 6 46 L 32 38 L 62 30 L 94 18 L 112 8" stroke="url(#gefGradFull_${idSuffix})" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        
        <!-- Ponta da Seta apontando ao topo direito (↗) -->
        <polygon points="116,6 102,9 113,20" fill="#fbbf24"/>

        <!-- Marcadores do gráfico em cada ponto de dados que conectam as 3 letras -->
        <circle cx="6" cy="46" r="3" fill="#ea580c" stroke="#0f172a" stroke-width="1.5"/>
        <circle cx="32" cy="38" r="3" fill="#f97316" stroke="#0f172a" stroke-width="1.5"/>
        <circle cx="62" cy="30" r="3" fill="#f59e0b" stroke="#0f172a" stroke-width="1.5"/>
        <circle cx="94" cy="18" r="3.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5"/>
      </g>

      <!-- Divisor vertical discreto -->
      <line x1="126" y1="10" x2="126" y2="44" stroke="#334155" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>

      <!-- Subtítulo Corporativo & Descritivo -->
      <text x="136" y="25" font-family="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" font-weight="800" font-size="14" fill="#FFFFFF" letter-spacing="1.5">ENTERPRISE</text>
      <text x="136" y="41" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="8.5" fill="#F97316" letter-spacing="1">GESTÃO &amp; FINANÇAS</text>
    </svg>
  `;
}

/**
 * Redireciona para a página inicial (Home) do utilizador logado
 */
export function navigateToUserHome() {
  const user = getCurrentUser();
  if (user) {
    const homeRoute = getDefaultRouteForRole(user.role);
    navigateTo(homeRoute);
  } else {
    navigateTo('login');
  }
}

/**
 * Registra ouvintes em elementos marcados com a classe 'gef-brand-link'
 * para navegar automaticamente para o Home do utilizador logado ao clicar.
 */
export function setupBrandHomeListeners(root = document) {
  const brandElements = root.querySelectorAll('.gef-brand-link');
  brandElements.forEach(elem => {
    // Evita duplicar listeners
    if (elem.dataset.brandListenerAttached) return;
    elem.dataset.brandListenerAttached = 'true';
    elem.style.cursor = 'pointer';

    elem.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToUserHome();
    });
  });
}
