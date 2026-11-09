const load = document.getElementById('load');
const open = document.getElementById('open');
const status = document.getElementById('status');
const moduleName = 'plataforma.prescricao';
let started = false;
const patient = Object.freeze({
  idExterno: 'mydoctor-test-paciente-' + crypto.randomUUID(),
  nome: 'Paciente Fictício MyDoctor',
  sexo: 'Feminino',
  data_nascimento: '01/01/1990',
});

load.addEventListener('click', async () => {
  load.disabled = true;
  status.textContent = 'Conectando…';
  try {
    const response = await fetch('/token',{method:'POST',cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const script = document.createElement('script');
    script.src = 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';
    script.dataset.token = data.token;
    await new Promise((resolve,reject) => {
      const timeout = setTimeout(()=>reject(new Error('Tempo de carregamento excedido. Recarregue o piloto.')),15000);
      script.onload = () => { clearTimeout(timeout);resolve(); };
      script.onerror = () => { clearTimeout(timeout);reject(new Error('Não foi possível carregar a Memed. Recarregue o piloto.')); };
      document.head.append(script);
    });
    status.textContent = 'Aguardando inicialização do módulo…';
    const initTimeout = setTimeout(() => { if (!started) status.textContent = 'A Memed não confirmou a inicialização. Recarregue para tentar novamente.'; },15000);
    window.MdSinapsePrescricao.event.add('core:moduleInit', module => {
      if (module.name !== moduleName || started) return;
      started = true;
      clearTimeout(initTimeout);
      window.MdHub.event.add('prescricaoImpressa', () => {
        status.textContent = 'Emissão de teste recebida. Nenhum documento foi salvo ou validado.';
      });
      window.MdHub.event.add('prescricaoExcluida', () => {
        status.textContent = 'Exclusão de teste recebida.';
      });
      open.disabled = false;
      status.textContent = 'Módulo pronto. Abra a prescrição de teste.';
    });
  } catch(error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível iniciar o piloto.';
  }
});

open.addEventListener('click', async () => {
  open.disabled = true;
  try {
    await window.MdHub.command.send(moduleName,'setPaciente',patient);
    await window.MdHub.module.show(moduleName);
    status.textContent = 'Paciente fictício carregado no módulo de homologação.';
  } catch {
    status.textContent = 'A Memed não abriu a prescrição de teste. Confira a sessão de homologação.';
  } finally {
    open.disabled = false;
  }
});
