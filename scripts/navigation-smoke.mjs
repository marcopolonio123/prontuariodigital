import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { act } = require('react');
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://mydoctor.test/' });
for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'CustomEvent']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.sessionStorage.setItem('mydoctor.v1.sessionToken', 'test-session');
let account = { id: 'u1', name: 'Pessoa teste', email: 'teste@mydoctor.test', phone: '', birthDate: '1980-01-01', sex: '', city: '', state: '', completed: true, isHealthProfessional: true };
let requests = [];
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname.replace('/api/v1', ''); requests.push(path);
  const data = path === '/account' ? account : path === '/admin/session' ? { authorized: true } : path === '/profiles' ? [{ id: 'p1', name: account.name, source: 'owned', relationship: 'self' }] : path === '/professional/profile' ? null : [];
  return { ok: true, status: 200, json: async () => data };
};
const outfile = '.navigation-test.cjs';
await build({ entryPoints: ['src/V1ProfessionalShell.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_API_URL': '""' } });
const Shell = require('../' + outfile).default;
const React = require('react');
const root = createRoot(document.getElementById('root'));
async function settle(work) { await act(async () => { work?.(); await new Promise(resolve => setTimeout(resolve, 15)); }); }
async function click(text) { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text); assert.ok(button, 'Botão ausente: ' + text); await settle(() => button.click()); }
async function menu() { const button = document.querySelector('button[aria-label="Abrir menu"]'); assert.ok(button); await settle(() => button.click()); }
try {
  await settle(() => root.render(React.createElement(Shell))); await settle();
  assert.match(document.body.textContent, /Olá, Pessoa/);
  const restoreRequests = requests.filter(path => path === '/account').length;
  await menu(); await click('Meu Diário');
  assert.match(document.body.textContent, /Meu Diário/); assert.doesNotMatch(document.body.textContent, /Olá, Pessoa/);
  await menu(); await click('Histórico familiar');
  assert.doesNotMatch(document.body.textContent, /Olá, Pessoa/);
  await menu(); await click('Perfil profissional');
  assert.match(document.querySelector('main').textContent, /Dados para validação/);
  assert.equal(document.querySelectorAll('[data-mydoctor-professional-entry]').length, 0, 'Menu depende de mutação externa');
  await click('← Voltar ao MyDoctor');
  assert.doesNotMatch(document.body.textContent, /Olá, Pessoa/);
  await menu(); await click('Meu cadastro');
  assert.match(document.body.textContent, /Você é profissional de saúde/);
  assert.equal(requests.filter(path => path === '/account').length, restoreRequests + 1, 'Navegação reinicia sessão');
  await menu(); await click('Sair');
  assert.match(document.body.textContent, /Entrar no MyDoctor/);
  assert.equal(window.sessionStorage.getItem('mydoctor.v1.sessionToken'), null);
  await click('Clique aqui para se cadastrar');
  assert.match(document.body.textContent, /Você é profissional de saúde/);
  console.log('✅ Navegação: sessão restaurada, telas estáveis, ida/volta profissional, Meu cadastro, flag inicial e logout OK.');
} finally { await settle(() => root.unmount()); await fs.unlink(outfile); dom.window.close(); }
