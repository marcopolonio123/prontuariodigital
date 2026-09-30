import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

console.log('My Doctor: preparação do entrypoint raiz.');
// Na Hostinger as variáveis podem estar disponíveis apenas ao iniciar a app.
// Preparar com pg em outro processo ANTES de importar Prisma evita DDL no web runtime.
if (process.env.DATABASE_URL) {
  const patch = fileURLToPath(new URL('./server/scripts/apply-feature-patches.cjs', import.meta.url));
  const result = spawnSync(process.execPath, [patch, '--startup'], {
    stdio: 'inherit', timeout: 45000, env: process.env,
  });
  if (result.error || result.status !== 0) {
    console.error('My Doctor: preparação do banco falhou; servidor não iniciado. Verifique conexão e permissões nos logs.');
    process.exit(1);
  }
}
console.log('My Doctor: processo Node iniciado pelo entrypoint raiz.');
import('./server/dist/index.js').catch(() => {
  console.error('My Doctor: falha ao carregar backend compilado.');
  process.exitCode = 1;
});
