# Vitalis — Prontuário médico para a vida toda

MVP focado nos dois objetivos secundários iniciais:

1. **Identificação de pessoas perdidas** — reconhecimento facial (assinatura perceptual dHash, 100% no navegador) e impressão digital (sensor simulado local), com rede de contatos autorizados (pais, filhos, responsáveis/curadores) e fluxo de avisos quando a pessoa é encontrada.
2. **Cartão de emergência** — exibido no momento da identificação: alergias, intolerâncias alimentares, tipo sanguíneo, medicações, cuidados especiais (Alzheimer, autismo, diabetes…) e instruções de abordagem.

Inclui ainda o embrião do objetivo principal: cadastro completo e **linha do tempo clínica** (consultas, exames, medicações, vacinas, procedimentos).

- Dados 100% locais (`localStorage`) com backup/exportação em JSON.
- Sem backend, sem envio de fotos — a comparação biométrica roda no dispositivo.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # gera dist/
```

## Publicar no GitHub (passo a passo)

### 1. Configurar identidade Git (uma vez só)

```bash
git config --global user.name "Seu Nome"
git config --global user.email "marcopolonio123@gmail.com"
```

> Dica de privacidade: para não expor o e-mail nos commits, use o endereço
> `ID+usuario@users.noreply.github.com` (disponível em GitHub → Settings → Emails).

### 2. Criar o repositório no GitHub

- Acesse [github.com/new](https://github.com/new), crie um repositório chamado **`vitalis`**
  (o nome precisa ser esse para o deploy automático funcionar).
- **Não** marque "Add a README" nem adicione licença — o repositório deve nascer vazio.

### 3. Enviar o código

```bash
git init
git add .
git commit -m "Vitalis: identificação facial/digital, desaparecidos e cartão de emergência"

git branch -M main
git remote add origin https://github.com/SEU-USUARIO/vitalis.git
git push -u origin main
```

Substitua `SEU-USUARIO` pelo seu usuário do GitHub. Na primeira vez, ele pedirá
autenticação — use um **Personal Access Token** (GitHub → Settings → Developer
settings → Personal access tokens) em vez da senha.

### 4. Ativar o GitHub Pages (deploy automático)

O repositório já inclui o workflow `.github/workflows/deploy.yml`:

1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Pronto. A cada `git push` na `main`, o site é publicado em
   **`https://SEU-USUARIO.github.io/vitalis/`**.

O workflow passa `--base=/vitalis/` no build, então o `vite.config.js`
não precisa ser alterado.

### Alternativas de hospedagem

- **Vercel** ([vercel.com](https://vercel.com)): importe o repositório — detecta Vite sozinho e publica em segundos (domínio `*.vercel.app`).
- **Netlify** ([netlify.com](https://netlify.com)): mesma lógica, build `npm run build`, pasta `dist`.

Nesses dois casos o app fica na raiz do domínio, sem precisar do `--base`.

## Fluxo de demonstração

Dentro do app: **sidebar → "Roteiro de demonstração"** (4 cenários guiados).

Resumo rápido:

1. **Identificação → "Testar com exemplo"** → Ana é reconhecida; o cartão de
   emergência abre e o alerta de desaparecida dispara com a rede de avisos
   (WhatsApp/ligação reais).
2. **Enviar uma foto que não está na base** → "sem correspondência" →
   cadastrar como nova pessoa → re-identificar e confirmar.
3. **Câmera ao vivo** (exige HTTPS/localhost + permissão; há fallback por arquivo).
4. **Digital**: segure o sensor; mover o dedo reduz a qualidade.
