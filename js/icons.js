/**
 * GEF — GESTÃO EMPRESARIAL E FINANCEIRA
 * Módulo de Renderização de Ícones Autônomo e Offline (js/icons.js)
 * Substitui tags <i data-lucide="..."></i> usando Lucide localmente e sem dependência de rede externa.
 */

import { createIcons, icons } from 'lucide';

/**
 * Inicializa ou atualiza os ícones no documento ou em um elemento raiz
 */
export function renderLucideIcons(rootElement = document) {
  try {
    if (typeof window !== 'undefined' && window.lucide?.createIcons) {
      window.lucide.createIcons();
      return;
    }
    createIcons({
      icons,
      nameAttr: 'data-lucide',
      attrs: {
        'stroke-width': 2
      }
    });
  } catch (err) {
    console.warn('[GEF Icons] Aviso na renderização de ícones:', err);
  }
}

// Garantir disponibilidade global de window.lucide para compatibilidade com qualquer código legado
if (typeof window !== 'undefined') {
  window.lucide = window.lucide || {
    createIcons: () => {
      try {
        createIcons({
          icons,
          nameAttr: 'data-lucide',
          attrs: { 'stroke-width': 2 }
        });
      } catch (e) {
        console.warn('Falha na criação de ícones lucide:', e);
      }
    }
  };
}
