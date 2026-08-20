# Publicar o Vitalis na Hostinger — passo a passo

O Vitalis tem **dois modos de operação** (a escolha é do usuário dentro do app, na tela
“Nuvem & servidor”):

| Modo | Servidor | Banco de dados | Plano Hostinger |
|---|---|---|---|
| **Local** (padrão) | só entrega arquivos | não (dados no dispositivo) | compartilhado (mais barato) |
| **Nuvem** (portal multiusuário) | API Node (`server/`) | **PostgreSQL/MySQL** | **VPS** |

No modo local, nada de banco: os dados ficam no dispositivo (base forte de LGPD).
No modo nuvem — app + portal conectados ao mesmo servidor com contas, delegações e
auditoria central — siga também o **Passo 5** abaixo e o `server/README.md`.

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

## Passo 5 — Servidor + banco de dados (modo nuvem / portal completo)

Quando você quiser app **e** portal conectados a um servidor com contas e banco:

1. **Contrate um VPS Hostinger** (Ubuntu 22.04). Hospedagem compartilhada não roda Node.
2. Siga o **`server/README.md`**: instala Node 20 + PostgreSQL, cria o banco
   (`npx prisma migrate deploy`), roda a API com PM2 e publica com Nginx + HTTPS
   em um subdomínio (ex.: `api.seudominio.com`).
3. No app (web ou APK): **Nuvem & servidor → Servidor real** → informe
   `https://api.seudominio.com` → crie a conta → **Sincronizar agora**.
4. O **mesmo domínio do portal** (passos 1–4) e o **APK** (`APK.md`) usam essa mesma API —
   uma única base de dados para tudo.

> **Dica antes de subir o VPS**: use o **servidor de demonstração embutido** no app para
> validar o fluxo multiusuário (criar conta, sincronizar, delegar) sem nenhuma infraestrutura.

⚠️ Ao operar o modo nuvem, dados de saúde passam a residir no servidor — isso exige as
medidas LGPD correspondentes: RIPD, DPO/encarregado, termos de uso e política de
privacidade publicados. A base técnica (criptografia em trânsito, bcrypt, JWT, auditoria,
“nunca excluir”) já está implementada.

---

## Observações

- **Subpasta** (`dominio.com/vitalis`): ajuste `base: '/vitalis/'` no `vite.config.js` e
  `start_url`/`scope` no `manifest.webmanifest`. Em domínio próprio (recomendado) não precisa.
- **Ícone PNG opcional**: o manifest usa SVG (Chrome aceita). Para o ícone nativo do
  Android/iOS, gere um PNG 512×512 e salve em `public/icons/icon-512.png` (e 192 em
  `icon-192.png`) — o manifest já os referencia e o upgrade é automático.
- **Atualizações**: `npm run build` → reenvie o conteúdo de `dist/`. Os nomes com hash
  invalidam o cache automaticamente.
