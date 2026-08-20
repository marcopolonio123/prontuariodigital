# Publicar o Vitalis na Hostinger — com HTTPS, segurança e LGPD

Este guia coloca o app em produção no seu domínio Hostinger com **criptografia HTTPS
obrigatória**, headers de segurança, cache de performance e o fluxo de consentimento LGPD
já embutido no app.

---

## 1. Gerar o pacote de produção

No seu computador (na pasta do projeto):

```bash
npm install
npm run build
```

Isso cria a pasta **`dist/`** com o site pronto (HTML, JS e CSS otimizados e minificados).
O arquivo `public/.htaccess` já foi copiado automaticamente para dentro de `dist/` — ele é
quem aplica HTTPS, segurança e cache no servidor.

> O Vitalis é um site **100% estático** (sem backend). Isso significa que a Hostinger só
> precisa servir arquivos — qualquer plano (inclusive o Single Web Hosting) funciona.

---

## 2. Ativar o SSL (HTTPS) na Hostinger — faça isso ANTES do upload

1. Acesse o **hPanel** → seu domínio → **Segurança** → **SSL**.
2. Clique em **Instalar SSL** (gratuito, Let's Encrypt) e aguarde a emissão (alguns minutos).
3. Confirme que o status ficou **Ativo**.

> Sem o SSL ativo, o redirecionamento HTTPS do `.htaccess` pode causar erro de certificado.
> Por isso instale o SSL primeiro.

---

## 3. Enviar os arquivos para o servidor

**Opção A — Gerenciador de Arquivos (mais simples):**

1. hPanel → **Arquivos** → **Gerenciador de Arquivos**.
2. Entre na pasta **`public_html`**.
3. Se houver um arquivo `default.php` ou `index.html` padrão da Hostinger, **apague-o**.
4. Faça **upload de todo o conteúdo de `dist/`** (não a pasta `dist` em si, mas o que está
   dentro dela: `index.html`, `assets/`, `.htaccess`, `portraits/`, etc.).
5. Marque a opção de **mostrar arquivos ocultos** para garantir que o `.htaccess` subiu.

**Opção B — FTP (FileZilla, para pacotes grandes):**

- Host: o FTP que o hPanel mostra em **Arquivos → Contas FTP**
- Suba o conteúdo de `dist/` dentro de `/public_html/`

---

## 4. O que o `.htaccess` já garante (não precisa configurar nada)

O arquivo `public/.htaccess` incluído no build aplica automaticamente na Hostinger:

| Camada | O que faz |
|---|---|
| **HTTPS obrigatório** | Redireciona todo `http://` para `https://` (301) |
| **HSTS** | Navegador só aceita HTTPS por 1 ano (`Strict-Transport-Security`) |
| **CSP** | Política de Conteúdo: bloqueia scripts/origens não autorizadas |
| **Anti-clickjacking** | `X-Frame-Options: DENY` |
| **Anti MIME-sniffing** | `X-Content-Type-Options: nosniff` |
| **Referrer restrito** | Não vaza URLs em cabeçalhos de referência |
| **Permissions-Policy** | Câmera/microfone só com gesto do usuário; geolocalização bloqueada |
| **Compressão** | gzip/deflate para texto, JS, CSS, SVG e fontes |
| **Cache inteligente** | HTML sempre fresco; assets com hash em cache imutável de 1 ano |
| **Proteção** | Bloqueia `.git`, `node_modules`, `src`, `.env`, listagem de diretórios |

---

## 5. Conformidade LGPD — o que o app já faz

O Vitalis foi desenhado com **privacidade por arquitetura** (LGPD, art. 46):

- **Dados 100% locais**: fichas, retratos, biometria e prontuários ficam no navegador do
  titular (`localStorage`). **Nenhum servidor recebe dados pessoais** — nem os seus.
- **Consentimento explícito**: na primeira visita, um aviso LGPD exige o aceite do titular
  antes do uso, com os direitos do art. 18 em linguagem simples.
- **Direitos do titular** (tela *Dados & privacidade*):
  - *Acesso & portabilidade* → exportação completa em JSON;
  - *Correção* → edição de fichas e registros;
  - *Eliminação* → apagamento definitivo da base local;
  - *Revogação* → retirada do consentimento.
- **Minimização**: biometria é armazenada como *template/assinatura* (64 bits), nunca como
  imagem bruta do rosto ou do dedo.
- **HTTPS**: criptografia em trânsito garantida pelo `.htaccess` + SSL da Hostinger.

> **Importante — limite do MVP:** como os dados vivem no navegador de cada usuário, o
> controlador (você) não centraliza dados pessoais em servidor. Se no futuro houver
> sincronização em nuvem ou multiusuário real, será preciso: política de privacidade
> publicada, registro das operações de tratamento (art. 37), e eventual encarregado (DPO).

---

## 6. Checklist de verificação pós-publicação

- [ ] `https://seudominio.com` abre o Vitalis (cadeado de SSL no navegador)
- [ ] `http://seudominio.com` redireciona sozinho para `https://`
- [ ] O aviso de consentimento LGPD aparece na primeira visita
- [ ] Em [securityheaders.com](https://securityheaders.com), seu domínio tira nota **A ou A+**
- [ ] Em [pagespeed.web.dev](https://pagespeed.web.dev), o desempenho mobile fica verde
- [ ] Carregar dados de exemplo → identificar → exportar backup funciona

---

## 7. Atualizar o site no futuro

Sempre que mudar o código:

```bash
npm run build
```

e repita o **passo 3** (substitua o conteúdo de `public_html` pelo novo `dist/`).
Como os assets têm hash no nome e o HTML não tem cache, os usuários recebem a versão nova
imediatamente, sem precisar limpar nada.
