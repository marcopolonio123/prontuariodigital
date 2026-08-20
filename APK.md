# My Doctor nas lojas — APK (Google Play) e iOS (App Store)

O app web vira app nativo com **Capacitor**: o mesmo código (este repositório) é
empacotado para Android e iOS, apontando para o mesmo servidor da pasta `server/`.
A configuração já está pronta em `capacitor.config.json`.

## 1. Preparar (uma vez)

```bash
# na raiz do projeto
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build                    # gera dist/ (já apontado no capacitor.config.json)
npx cap add android
npx cap sync
```

## 2. APK / AAB para a Google Play

```bash
npx cap open android             # abre o Android Studio
```

No Android Studio:
1. **Build → Generate Signed App Bundle / APK**
2. Crie uma **keystore** (guarde o arquivo e as senhas — sem eles não há atualização futura)
3. Escolha **Android App Bundle (.aab)** — formato exigido pela Play
4. A Play também aceita APK para testes internos (distribuição interna/fechada)

### Publicação (Google Play Console)

1. Crie a conta de desenvolvedor (taxa única de US$ 25)
2. Novo app → preencha ficha, ícones (`public/icons/`) e capturas de tela
3. **Formulário de dados (Data Safety)**: declare que o app coleta dados de saúde
   **somente no dispositivo do usuário** e, no modo nuvem, via servidor próprio com criptografia em trânsito (HTTPS/TLS)
4. **Política de privacidade** (obrigatória para apps de saúde) — a seção LGPD do app
   (consentimento, exportação, eliminação) é a base do documento
5. Envie o .aab → teste interno → produção

## 3. iOS (App Store)

1. Em um **Mac** com Xcode: `npm install @capacitor/ios && npx cap add ios && npx cap sync && npx cap open ios`
2. Assinatura com **Apple Developer** (US$ 99/ano)
3. **App Review**: apps de saúde exigem revisão cuidadosa — o Consultor já exibe o aviso
   "não substitui orientação médica", o que ajuda na aprovação; declare uso de
   câmera (retrato) e microfone (ditado) no `Info.plist` com finalidades claras

## 4. Atualizações

```bash
npm run build && npx cap sync    # depois gere nova versão assinada nas lojas
```

## Arquitetura final (o que você pediu desde o início)

```
 ┌──────────────┐   HTTPS    ┌───────────────────────┐   SQL    ┌──────────────┐
 │ App (APK/iOS)│◄──────────►│ My Doctor Server (Node) │◄───────►│  PostgreSQL  │
 └──────────────┘            └───────────────────────┘          └──────────────┘
 ┌──────────────┐   HTTPS              ▲
 │ Portal (web) │◄─────────────────────┘   ← mesmo servidor, mesma base
 └──────────────┘
```

- **App e portal** consomem a mesma API; contas, fichas e auditoria vivem no banco
- **Sem servidor** (modo local), tudo continua funcionando no dispositivo — útil em
  campo, sem sinal, durante um resgate
