# Sinais vitais — como funciona

A tela **Sinais vitais** monitora FC, pressão (PAS/PAD), SpO₂, temperatura, glicemia,
frequência respiratória e peso, e grava o histórico **no prontuário da pessoa logada ou
delegada** (filho cuidando do pai com Alzheimer, pai/mãe cuidando da criança, curador etc.) —
exatamente o mesmo modelo de autorização do restante do My Doctor.

## Fontes de leitura (provedores)

A tela usa uma camada de abstração (`src/lib/vitals.ts`) com dois provedores:

| Ambiente | Provedor | Fonte dos dados |
|---|---|---|
| **APK Android** | `Health Connect` (Google) | serviço gratuito do sistema — apps de saúde/relógios já escrevem lá |
| **APK iOS** | `HealthKit` (Apple) | serviço gratuito do sistema |
| **Navegador (web/PWA)** | demonstrativo + manual | sessão simulada com valores fisiológicos realistas + formulário manual |

### Ligando o provedor nativo no APK

1. No Android, a ponte é exposta como `window.VitalisHealth` (`start`/`stop`) — implementada
   com um plugin Capacitor que lê do **Health Connect** (API oficial e gratuita do Android;
   requer permissão `android.permission.health.READ_*` e consentimento do usuário na tela do sistema).
2. No iOS, o mesmo plugin lê do **HealthKit** (`NSHealthShareUsageDescription` no `Info.plist`).
3. Quando `Capacitor.isNativePlatform()` é verdadeiro e a ponte existe, a tela passa a receber
   leituras reais, etiquetadas como `Health Connect` / `HealthKit` no histórico.

Sem a ponte (web), a tela deixa isso explícito num aviso e oferece a sessão demonstrativa +
entrada manual — nada é apresentado como medição clínica real.

## Gravação no histórico

- Cada medição vira um `VitalSample { metric, value, at, source, note? }` salvo em `patient.vitals`.
- O toggle **“gravar no histórico”** controla se a sessão persiste automaticamente; se desligado,
  ao parar a sessão o app pergunta se quer salvar as medições capturadas.
- Entradas manuais são registradas na hora, com observação opcional.
- **Não há exclusão**: o histórico só cresce (coerente com a regra “nada é excluído”).

## Status semântico

Cada valor é classificado contra faixas de referência (normal / atenção / crítico), com cor
correspondente nos cartões, no histórico e nos “Sinais vitais recentes” do Cartão de Emergência.
Isso dá contexto imediato a quem socorre (ex.: FC 58 do Carlos em amiodarona = atenção).

## Observação clínica

As faixas são referências gerais para triagem visual, **não diagnóstico**. A tela não substitui
avaliação profissional — em valores críticos, procure atendimento.
