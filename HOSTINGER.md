# Publicar o Vitalis na Hostinger — passo a passo

## Precisa de banco de dados?

**Não.** O Vitalis é um app web (PWA) com arquitetura *local-first*: os dados ficam no
`localStorage` do navegador de cada usuário e nunca transitam pelo servidor. A Hostinger
só entrega os arquivos — qualquer plano de hospedagem compartilhada serve.

Isso é também a base da conformidade **LGPD**: não há coleta centralizada de dados de saúde.

---

## Passo 1 — Gerar o pacote (no seu computador)

```bash
npm install     # primeira vez
npm run build   # gera a pasta dist/
```

Conteúdo de `dist/`: `index.html`, `assets/`, `.htaccess`, `manifest.webmanifest`, `sw.js`, `icons/`.

## Passo 2 — Enviar para a Hostinger

1. hPanel → **Websites → Gerenciar** → **Arquivos → Gerenciador de Arquivos**
2. Abra `public_html` e apague o `default.php`/`index.html` de exemplo
3. Envie **todo o conteúdo de `dist/`** (ative "mostrar arquivos ocultos" para ver o `.htaccess`)

Alternativa: FTP (FileZilla) na porta 21, usuário da conta FTP do hPanel.

## Passo 3 — Ativar HTTPS (obrigatório)

1. hPanel → **Segurança → SSL → Instalar SSL** (Let's Encrypt gratuito, domínio + www)
2. Aguarde a emissão (minutos) e confirme o cadeado em `https://seudominio.com.br`

Sem HTTPS a câmera, o ditado por voz e a **instalação do app** não funcionam.
O `.htaccess` já força HTTPS + HSTS e redireciona `http://` e `www`.

## Passo 4 — Testar

1. Acesse `https://seudominio.com.br`
2. No **Chrome/Edge desktop**: ícone de instalação na barra de endereço → "Instalar Vitalis"
3. No **Android (Chrome)**: menu ⋮ → "Instalar app"
4. No **iPhone (Safari)**: Compartilhar → "Adicionar à Tela de Início"
5. Abra pelo ícone: o app roda em tela cheia (sem barra do navegador)
6. Desligue a internet e recarregue: o app abre **offline** (service worker)
7. Recarregue online: sessão e dados persistem

---

## O que já vem de fábrica (segurança + LGPD + performance)

**Servidor (`.htaccess`):** HTTPS obrigatório · HSTS 1 ano · CSP anti-XSS ·
`X-Frame-Options: DENY` · `X-Content-Type-Options` · `Referrer-Policy` ·
Brotli/Gzip · cache de 1 ano para assets com hash.

**App (PWA):** instalável · offline · ícone e splash próprios · banner "sem conexão" ·
detecção de modo standalone.

**App (LGPD):** consentimento com data/hora do aceite · dados 100% no dispositivo ·
direitos do titular (exportar, revogar consentimento, **eliminar tudo**) ·
auditoria de quem consulta cada ficha · arquivamento reversível (nada é excluído por engano).

---

## Observações

- **Subpasta** (`dominio.com/vitalis`): ajuste `base: '/vitalis/'` no `vite.config.js` e
  `start_url`/`scope` no `manifest.webmanifest`. Em domínio próprio (recomendado) não precisa.
- **Ícone PNG opcional**: o manifest usa SVG (Chrome aceita). Para o ícone nativo do
  Android/iOS, gere um PNG 512×512 e salve em `public/icons/icon-512.png` (e 192 em
  `icon-192.png`) — o manifest já os referencia e o upgrade é automático.
- **Atualizações**: `npm run build` → reenvie o conteúdo de `dist/`. Os nomes com hash
  invalidam o cache automaticamente.
- **Multiusuário com servidor (fase 2)**: login central, banco de dados e sincronização
  entre dispositivos exigem backend (ex.: Supabase/PostgreSQL) e análise LGPD adicional
  (RIPD/DPO), pois os dados de saúde passariam a residir no servidor. O MVP evita isso
  por arquitetura — é uma decisão de privacidade, não uma limitação técnica.
