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


## Consultor IA externo e limite de uso

O comprador utiliza o consultor do MyDoctor sem escolher um provedor ou fornecer uma chave. As credenciais ficam somente no servidor. Configure no ambiente Node da hospedagem:

- `CONSULTANT_API_KEY`: chave privada do provedor compatível com Chat Completions.
- `CONSULTANT_BASE_URL`: URL HTTPS da API, sem `/chat/completions`.
- `CONSULTANT_MODEL`: identificador de um modelo habilitado nessa conta.
- `CONSULTANT_RESPONSE_LIMIT`: padrão inicial 20 (ajustável; ainda não é preço/plano comercial definitivo).
- `CONSULTANT_WINDOW_HOURS`: padrão 24; pode ser 48 ou outra janela inteira.

Antes de publicar o backend, execute o patch aditivo `server/prisma/consultant-usage.sql` no PostgreSQL. Não rodar DDL no processo web. Gere o cliente Prisma e compile o servidor. Para banco de desenvolvimento/CI, `prisma db push` inclui a tabela.

A regra é por **mensagem respondida nas últimas N horas por conta**, incluindo as respostas do usuário às perguntas da IA. Site, Android, iOS e todos os perfis da mesma conta compartilham o saldo. Cada resposta devolve um uso N horas depois de concluída. Erros e respostas vazias liberam a reserva e não descontam usos. Reservas concorrentes ficam protegidas por lock PostgreSQL por conta e expiram em 2 minutos se houver interrupção do processo. Não há fallback silencioso para respostas prontas.

`GET /api/v1/consultant/usage` exige login e retorna `configured`, `limit`, `windowHours`, `used`, `pending`, `remaining` e `nextAvailableAt`. A tela exibe a regra, saldo e data/hora local da próxima liberação antes do envio. O POST do consultor valida e aplica o limite no servidor; retorna 429 com `usage` e `Retry-After` quando esgotado. Um 429 do provedor é tratado como indisponibilidade temporária, sem descontar o saldo do app. A futura tela de compra deve usar esta mesma política da API, evitando prometer limites fixos diferentes da assinatura.

Planos ativos/em teste podem sobrescrever os padrões por `PlanEntitlement`:
- `consultant.responses.max`: inteiro positivo.
- `consultant.window.hours`: inteiro positivo.

A tabela guarda apenas ID da conta, datas e status de consumo, nunca o texto da conversa. A política de uso do MyDoctor é distinta dos limites técnicos/de cobrança do provedor; não representa perguntas incluídas em uma assinatura pessoal do ChatGPT.


## Agenda de medicamentos por perfil (incluindo dependentes)

Cadastros com dias da semana, vários horários, fuso IANA, início e término opcional, descrição da dose cadastrada pelo usuário e destinatários. Não calcula nem recomenda doses. O titular/responsável que administra o perfil pode editar/remover agendas e desligar todos os avisos daquele perfil. Delegados autorizados podem consultar, mas não editar.

Destinatários são contas com acesso vigente ao perfil (titular ou delegados familiares, sem acesso profissional), e-mail confirmado por cadastro ou login MFA por e-mail e escopo `record`/`medications` ou completo. Não aceita endereços arbitrários nem envia para uma pessoa apenas porque seu nome consta em um dependente. Para o dependente receber, ele precisa de uma conta com acesso ao perfil e e-mail confirmado. O serviço revalida acesso e configuração imediatamente antes do envio.

Primeira entrega: alertas por e-mail do servidor, sem depender de página aberta. Push Android/iOS ainda não implementado. Não representa confirmação de ingestão da dose.

Ativação na hospedagem:
1. Aplicar `server/prisma/medication-agenda.sql` fora do processo web (patch aditivo/idempotente).
2. Gerar o cliente Prisma, compilar e redeploy do servidor.
3. Usar o serviço transacional já configurado (`RESEND_API_KEY` + remetente ou SMTP + remetente) e definir `MEDICATION_REMINDERS_ENABLED=true` em produção.
4. Manter o processo Node continuamente ativo. Worker executa a cada minuto e recupera somente ocorrências dos últimos 15 minutos; pausas maiores podem resultar em avisos não enviados. Não é um sistema de emergência.
5. Usuário liga os avisos do perfil e de cada medicamento e escolhe destinatários. Todos iniciam desligados.

Reservas persistentes e chave única por medicamento/destinatário/ocorrência evitam duplicação em ciclos concorrentes; até 3 tentativas no período de recuperação após falhas. Aceite do provedor de e-mail não garante leitura/entrega na caixa de entrada. Um crash entre aceite do provedor e confirmação no banco pode resultar em duplicata na recuperação; não prometer entrega exatamente uma vez. Desligar impede novos envios, mas não cancela um e-mail já aceito pelo provedor.

APIs autenticadas: `GET/POST /api/v1/patients/:id/medications`, `PUT/DELETE .../medications/:scheduleId`, `PUT .../medications/alerts`. GET informa disponibilidade efetiva do envio, para a interface não anunciar alertas ativos quando falta ativação do serviço.

Testes CI: e-mail simulado, sem envio a pessoas reais; autorização/escopo, destinatários, dependente e responsável, fusos/DST, concorrência, falha/repetição, desligamento, revogação e edição concorrente.

### Preparação do banco no build Hostinger

`npm run prepare:hostinger` aplica os dois patches aditivos (Consultor e Agenda) por conexão PostgreSQL direta quando o build tem `NODE_ENV=production` e `DATABASE_URL`. Os patches são idempotentes, transacionais e têm tempo limite de locks. Uma falha interrompe o build antes da publicação. Não é DDL no runtime web, não usa o query engine Prisma para migrar e não remove dados.

Se a Hostinger disponibilizar as variáveis apenas no runtime, configure-as também no build ou execute explicitamente `NODE_ENV=production node server/scripts/apply-feature-patches.cjs` no ambiente do projeto antes do redeploy. Builds sem essas condições informam que os patches foram omitidos. A ativação dos e-mails ainda exige `MEDICATION_REMINDERS_ENABLED=true` e o provedor transacional configurado.



### Foto opcional de referência da digital
O piloto guarda somente uma referência privada, com consentimento explícito, no mesmo salvamento do cadastro. Não existe motor de comparação ativado e a foto não é um template biométrico. A API devolve apenas metadados; a referência não integra o prontuário compartilhado. O conteúdo é cifrado com AES-256-GCM e chave derivada de JWT_SECRET por usuário. Antes de rotacionar JWT_SECRET, preserve a chave anterior e recriptografe as referências; trocar o segredo sem migração impede a leitura das fotos anteriores.
O histórico pessoal aceita exclusivamente registros de motor confiável com patientId, método finger/finger_photo e resultado match_verified. Capturas, referências e resultados antigos não confirmados permanecem apenas na auditoria operacional. O cliente não pode declarar um match.
