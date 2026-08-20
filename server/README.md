# My Doctor Server — API + banco de dados

API Node/Express + Prisma que implementa o contrato de `src/lib/api.ts` do app.
O app (web ou APK) aponta para esta API na tela **Nuvem & servidor**.

## Requisitos

- Node 20+ (VPS Hostinger, DigitalOcean, Render…)
- PostgreSQL 14+ (VPS Hostinger, Neon ou Supabase gratuitos servem)
- Um domínio com HTTPS (o app exige `https://` para conectar)

## Rodar localmente

```bash
cd server
cp .env.example .env        # edite DATABASE_URL e gere JWT_SECRET
npm install
npx prisma migrate dev --name init   # cria as tabelas no banco
npm run dev                          # API em http://localhost:8787
```

Teste: `curl http://localhost:8787/api/health` → `{"ok":true,...}`

No app: Nuvem & servidor → Servidor real → `http://localhost:8787` (localhost é aceito em desenvolvimento).

## Publicar na Hostinger (VPS)

1. **VPS**: hPanel → VPS → crie um plano (Ubuntu 22.04). Planos compartilhados não rodam Node.
2. **Acesse por SSH** e instale o Node:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.bashrc && nvm install 20
   ```
3. **PostgreSQL**:
   ```bash
   sudo apt update && sudo apt install -y postgresql
   sudo -u postgres psql -c "CREATE USER mydoctor WITH PASSWORD 'senha-forte';"
   sudo -u postgres psql -c "CREATE DATABASE mydoctor OWNER mydoctor;"
   ```
4. **Suba a pasta `server/`** (via Git ou SFTP) e:
   ```bash
   cd server
   cp .env.example .env   # DATABASE_URL=postgresql://mydoctor:senha-forte@localhost:5432/mydoctor
   npm install && npm run build
   npx prisma migrate deploy
   npm install -g pm2 && pm2 start dist/index.js --name mydoctor-api && pm2 save && pm2 startup
   ```
5. **HTTPS + proxy reverso** (Nginx + Let's Encrypt):
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   # /etc/nginx/sites-available/mydoctor-api:
   #   server { server_name api.seudominio.com;
   #     location / { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; } }
   sudo ln -s /etc/nginx/sites-available/mydoctor-api /etc/nginx/sites-enabled/
   sudo certbot --nginx -d api.seudominio.com
   ```
6. **No app**: Nuvem & servidor → Servidor real → `https://api.seudominio.com` → criar conta → sincronizar.

## Alternativas sem VPS

- **Render/Railway** (camada gratuita): conecte o repositório, build command `cd server && npm i && npm run build`, start `node dist/index.js`, defina `DATABASE_URL` e `JWT_SECRET`.
- **Banco**: Neon ou Supabase (PostgreSQL gratuito) — basta a `DATABASE_URL`.

## Segurança & LGPD embutidos

- Senhas com **bcrypt** (10 rounds), tokens **JWT** com expiração
- Auditoria de identificações com autor (`byUserId`)
- **Nunca excluir**: `DELETE /api/patients/:id` apenas arquiva
- Visibilidade por dono/delegação aplicada em todas as consultas
- Limite de payload 15 MB (anexos); para produção com muitos anexos, mova as fotos para armazenamento de objetos (S3/Cloudflare R2) e guarde a URL
