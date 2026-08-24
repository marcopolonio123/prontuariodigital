# 🩺 My Doctor — `mydoctor.med.br`

Prontuário médico **para a vida toda**, com foco em proteger quem não consegue se cuidar sozinho: crianças, idosos e pessoas com Alzheimer ou deficiência.

> **Objetivo principal:** guardar o prontuário médico vitalício de uma pessoa.
> **Objetivos secundários já funcionando:** identificação de pessoas perdidas (retrato facial + digital) e exibição de informações críticas de saúde em emergências.

---

## ✨ O que ele faz

| Área | Recursos |
|---|---|
| **Cadastro** | Dados básicos, alergias, intolerâncias, tipo sanguíneo, medicamentos de uso contínuo, convênios (com foto da carteirinha), rede de contatos autorizados |
| **Acesso delegado** | Pais, filhos e curadores cuidam do prontuário de quem não opera o app (ex.: filho de pessoa com Alzheimer, pai de criança) |
| **Prontuário** | Linha do tempo clínica, prescrições e exames (texto, voz ou anexo PDF/imagem), filtros por especialidade, exportação — **nada é excluído, só arquivado** |
| **Utilidade pública** | "Encontrar alguém…": identifica pessoa perdida por retrato ou digital, **com geolocalização de quem consulta** (antifraude), e dispara avisos à rede de contatos |
| **Emergência/Vulnerabilidade** | Alerta para pessoa acidentada, internada ou em risco, com cartão de emergência exibido na identificação |
| **Sinais vitais** | Monitoramento (FC, pressão, SpO₂, temperatura…) com gravação opcional no histórico; pronto para Health Connect / HealthKit |
| **Consultor IA** | Analisa sintomas cruzando com o prontuário da pessoa logada, sempre com o aviso de procurar um médico |
| **Nuvem** | Modo local (dados no dispositivo) **ou** conectado ao servidor com banco de dados |

## 🚀 Como rodar

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # gera a pasta dist/ para publicação
```

## 🌐 Publicação

- **Site/portal** → pasta `dist/` (guia completo em [`HOSTINGER.md`](HOSTINGER.md))
- **Servidor + banco** → pasta `server/` (guia em [`server/README.md`](server/README.md))
- **APK / iOS (lojas)** → [`APK.md`](APK.md) (configuração Capacitor pronta)
- **Sinais vitais nativos** → [`VITAIS.md`](VITAIS.md)

## 🔐 Segurança & LGPD

- HTTPS obrigatório, HSTS, CSP e headers de segurança via `.htaccess`
- Dados sensíveis de saúde tratados conforme a LGPD (consentimento, exportação, eliminação)
- Nada é excluído: arquivamento reversível
- Auditoria de quem consulta cada ficha (com geolocalização de quem identifica)

## 🗂️ Estrutura

```
src/       código do app/site (React + Vite + Tailwind)
public/    arquivos estáticos (PWA, ícones, retratos demo)
server/    API Node/Express + Prisma (PostgreSQL/MySQL)
dist/      build de produção (enviado à hospedagem)
```

---

## 📝 Changelog

- **v0.2.1** — teste de sincronização com repositório remoto `marcopolonio123/prontuariodigital`.
- **v0.2.0** — projeto vinculado ao repositório `mydoctor.med.br` no GitHub.
