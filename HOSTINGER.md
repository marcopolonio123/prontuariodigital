# Publicar o Vitalis — ordem recomendada (site → banco → servidor → app → APK)

Este guia responde "o que subir primeiro". Resumo executivo:

| Ordem | O quê | Onde | Por quê primeiro |
|---|---|---|---|
| **1º** | **Site/portal** (arquivos de `dist/`) | Hospedagem compartilhada Hostinger | Em 10 min o portal está no ar, já funcionando em **modo local** |
| **2º** | **Banco de dados** (PostgreSQL) | VPS Hostinger **ou** Neon/Supabase (grátis) | O servidor API precisa dele para existir |
| **3º** | **Servidor API** (pasta `server/`) | VPS Hostinger (ou Render) | Liga o portal/app ao banco: contas, sincronização, auditoria |
| **4º** | **Conectar o app ao servidor** | Na tela “Nuvem & servidor” do app | Valida o sistema completo de ponta a ponta |
| **5º** | **APK / iOS** | Seu computador → Google Play / App Store | Por último, quando o backend já estiver estável (detalhes em `APK.md`) |

> Enquanto as fases 2–3 não ficam prontas, o app/site **não ficam parados**: funcionam em
> modo local e com o **servidor de demonstração embutido** para validar o fluxo multiusuário.

---

## FASE 1 — Site/portal na hospedagem compartilhada (faça isso hoje)

### 1.1 Gerar o pacote

```bash
npm install        # primeira vez
npm run build      # cria a pasta dist/
```

Conteúdo de `dist/`: `index.html` · pasta `assets/` · `.htaccess` (HTTPS forçado, HSTS,
CSP, compressão e cache — já configurado).

### 1.2 Enviar para a Hostinger

1. hPanel → **Websites** → **Gerenciar** no seu domínio
2. **Arquivos → Gerenciador de Arquivos** → abra **`public_html`**
3. Apague o `default.php`/`index.html` de exemplo da Hostinger, se existir
4. Envie **todo o conteúdo de `dist/`** (ative “mostrar arquivos ocultos” para ver o `.htaccess`)

Alternativa: **Arquivos → Contas FTP** + FileZilla (porta 21).

### 1.3 Ativar HTTPS (obrigatório — câmera, ditado e PWA exigem)

1. hPanel → **Segurança → SSL → Instalar SSL** (Let's Encrypt grátis, domínio + www)
2. Teste: `https://seudominio.com.br` deve mostrar o **cadeado**

O `.htaccess` já redireciona http→https e www→domínio (301) e ativa HSTS por 1 ano.

### 1.4 Testar

- Portal abre com cadeado → “Carregar dados de exemplo” → entra com PIN **1234**
- PWA: botão **Instalar app** na barra lateral (ou ícone na barra de endereço)
- **Pronto: o portal está no ar em modo local.** Siga para a Fase 2.

---

## FASE 2 — Banco de dados

O Vitalis usa **PostgreSQL** (padrão) ou **MySQL**. Três caminhos, do mais simples ao mais integrado:

### Opção A — Neon ou Supabase (PostgreSQL gerenciado, camada grátis) ⭐ mais rápida

1. Crie o banco em [neon.tech](https://neon.tech) ou [supabase.com](https://supabase.com)
2. Copie a **connection string** (`postgresql://usuario:senha@host:5432/db?sslmode=require`)
3. Ela será usada na Fase 3 (`DATABASE_URL`). Nada mais a fazer aqui.

### Opção B — PostgreSQL no VPS Hostinger (tudo em um lugar)

1. hPanel → **VPS** → crie um plano (Ubuntu 22.04) e anote o IP/senha root
2. Via SSH:
   ```bash
   sudo apt update && sudo apt install -y postgresql
   sudo -u postgres psql -c "CREATE USER vitalis WITH PASSWORD 'senha-forte-aqui';"
   sudo -u postgres psql -c "CREATE DATABASE vitalis OWNER vitalis;"
   ```
3. Sua `DATABASE_URL` será `postgresql://vitalis:senha-forte-aqui@localhost:5432/vitalis`

### Opção C — MySQL da Hostinger

Troque o provider em `server/prisma/schema.prisma` para `mysql` e use a string do
phpMyAdmin (hPanel → Bancos de dados → MySQL).

---

## FASE 3 — Servidor API (`server/`)

Implementa autenticação (bcrypt + JWT), prontuários, delegações e auditoria no banco.

### Opção A — VPS Hostinger (junto com o banco da Opção B)

```bash
# Node 20
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc && nvm install 20

# suba a pasta server/ (Git ou SFTP) e então:
cd server
cp .env.example .env
# edite .env: DATABASE_URL (da Fase 2) e JWT_SECRET (gere: openssl rand -hex 32)

npm install
npx prisma migrate deploy        # cria as tabelas no banco
npm run build                    # compila TypeScript → dist/

# manter no ar
npm install -g pm2
pm2 start dist/index.js --name vitalis-api
pm2 save && pm2 startup          # segue rodando após reboot
```

**HTTPS + domínio** (Nginx + Let's Encrypt):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie `/etc/nginx/sites-available/vitalis-api`:

```nginx
server {
  server_name api.seudominio.com;
  client_max_body_size 16m;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/vitalis-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.seudominio.com
```

Aponte o subdomínio `api.seudominio.com` para o IP do VPS (hPanel → DNS).

### Opção B — Render/Railway (sem administrar VPS)

Conecte o repositório; build: `cd server && npm i && npx prisma generate && npm run build`;
start: `node dist/index.js`; variáveis: `DATABASE_URL` (Neon) e `JWT_SECRET`.

### Testar a API

```bash
curl https://api.seudominio.com/api/health
# → {"ok":true,"version":"1.0.0","engine":"vitalis-server (Node + Prisma)"}
```

---

## FASE 4 — Conectar o app/site ao servidor

1. Abra o portal (ou o app instalado) → **Dados & privacidade → Abrir Nuvem**
   (ou pelo botão de status “Modo local” no rodapé da barra lateral)
2. **Servidor real** → URL `https://api.seudominio.com` → **Criar conta e conectar**
3. **Sincronizar agora** → as fichas sobem; o servidor vira a fonte da verdade
4. Crie uma **segunda conta** em outro navegador e sincronize: cada usuário vê apenas
   as próprias fichas e as delegadas — o sistema multiusuário está validado

---

## FASE 5 — Gerar o APP (APK/AAB e iOS)

Resumo (guia completo em `APK.md`):

```bash
# na raiz do projeto
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync
npx cap open android        # Android Studio → Build → Generate Signed App Bundle
```

- **Google Play**: conta de desenvolvedor (US$ 25, única) → envie o `.aab` assinado →
  formulário de dados de saúde → política de privacidade → produção
- **iOS**: em um Mac, `npx cap add ios` + assinatura Apple Developer (US$ 99/ano)
- O APK usa **a mesma API da Fase 3** — uma única base para portal e app

---

## Checklist de segurança & LGPD (já implementado no pacote)

- **Servidor**: HTTPS obrigatório + HSTS · CSP anti-XSS · `X-Frame-Options: DENY` ·
  senhas bcrypt · tokens JWT com expiração · “nunca excluir” também no banco
- **App**: consentimento LGPD com data/hora · direitos do titular (exportar, revogar,
  eliminar) · auditoria de quem consulta (com **geolocalização de quem identifica**) ·
  consentimento de identificação por pessoa (`findable`)
- **PWA**: instalável · offline · ícone e splash próprios

> Ao operar a Fase 3 em diante, dados de saúde passam a residir no servidor — publique
> política de privacidade e termos de uso e avalie RIPD/DPO conforme a LGPD.

## Atualizações futuras

- **Portal**: `npm run build` → reenvie o conteúdo de `dist/` (cache invalida sozinho)
- **Servidor**: `git pull` no VPS → `npm install` → `npx prisma migrate deploy` →
  `npm run build` → `pm2 restart vitalis-api`
- **APK**: `npm run build && npx cap sync` → nova versão assinada nas lojas
