console.log('My Doctor: processo Node iniciado pelo entrypoint raiz.');
import('./server/dist/index.js').catch((error) => {
  console.error('My Doctor: falha ao carregar backend compilado.', error);
  process.exitCode = 1;
});
