# MyDoctor — laboratório privado de digital e rosto

Protótipo funcional de API própria, com **SourceAFIS 3.18.1** para digital e **YuNet + SFace / OpenCV 4.11.0** para rosto. Há uma tela de testes responsiva, câmera, upload, recorte, prévias, cadastro autorizado de voluntários, comparação 1:N restrita à base de laboratório e métricas.

**Não está integrado à identificação de pacientes em produção.** Não consulta PostgreSQL/Neon, R2, prontuários, documentos, avatares, familiares, logs de identificação ou base antiga do MyDoctor. Não utiliza `dHash` nem porcentagens de semelhança de imagem como biometria. Todos os resultados trazem `identityConfirmed: false`. Não há aviso de familiares, acesso clínico, comprovação de vida ou validação para pessoas inconscientes/falecidas.

## Como testar, sem contratar licença comercial

Pré-requisitos: Docker com Compose; Python somente para gerar as chaves, ou a alternativa manual abaixo. Nenhuma compra é feita por estes comandos.

```bash
cd experiments/biometrics
python -m venv .venv
# Linux/macOS. No Windows, use .venv\Scripts\activate.
. .venv/bin/activate
pip install cryptography==44.0.3
python scripts/configure.py
docker compose up --build -d
```

Abra **http://localhost:8791**. Consulte a chave `BIO_LAB_TOKEN` no `.env` local e informe-a na tela; **não compartilhe esse arquivo nem cole as chaves no chat**. A senha normal do MyDoctor não é usada aqui. A porta é ligada somente ao loopback. `configure.py` não sobrescreve configuração existente nem imprime os segredos.

1. Leia o texto de consentimento, obtenha a concordância do voluntário e crie um código como `V001`; não informe nome, CPF ou número de prontuário. O operador é responsável por manter qualquer relação entre código e pessoa fora deste sistema.
2. Escolha **rosto** ou **digital**. O navegador solicita acesso à câmera. O rosto usa preferencialmente a câmera frontal; a digital, a traseira. A tela comum do telefone não lê cristas papilares ao receber um toque.
3. Capture ou escolha uma imagem JPEG/PNG, até 2 MB e 4 megapixels. A captura fica apenas no navegador até a ação explícita de enviar/pré-visualizar/cadastrar/comparar. O recorte sem tratamento é preservado criptografado após cadastro; o enquadramento completo descartado pelo recorte não é enviado.
4. Para digital fotografada: recorte a região da digital e informe sua **largura física realmente medida**, em mm. Use referência de escala no mesmo plano. Não estime DPI nem use 500 DPI por conveniência. A resolução é calculada a partir da largura em pixels e da medida física. Imagens de leitores devem usar a resolução real do equipamento.
5. Teste **Original**, **Contraste ajustado** ou **Sombras reduzidas + contraste**, com ou sem **Negativo**. Prévia não cadastra amostra. O negativo apenas inverte os tons; CLAHE e correção de iluminação não recuperam detalhes ausentes. Não se inventam linhas ou minúcias.
6. Cadastre pelo menos **duas capturas diferentes** por modalidade, dedo e origem. O serviço recusa uma cópia exata da imagem já cadastrada para o mesmo voluntário, mesmo se reencodada sem mudar pixels.
7. Compare uma terceira captura independente. Para avaliar erros, rotule o resultado esperado **antes** de consultar a resposta. Também inclua voluntários que não estão na base. Cópias exatas das imagens cadastradas podem testar a integração, mas são identificadas e excluídas das taxas de erro.
8. Consulte as métricas e revogue/exclua os voluntários ao terminar. A limpeza global pede confirmação.

**Celular real:** `localhost` no telefone é o próprio telefone. Para testar a câmera do celular contra o computador, é necessário um acesso HTTPS privado à máquina que executa a API. Não abra a porta publicamente sem configurar autenticação, TLS e controle de rede. O Compose não cria esse acesso. A câmera no navegador depende de contexto seguro e da permissão do usuário.

## Alternativa sem Docker, para desenvolvimento

Requer Python 3.12, Java/JDK 17 e Maven 3.9.9. Estes runtimes não são dependências do site principal.

```bash
cd experiments/biometrics
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-test.txt
python scripts/download_models.py
mvn -f fingerprint/pom.xml package
python scripts/configure.py
# Carrega somente o .env gerado por configure.py, sob controle do operador.
set -a
. ./.env
set +a
uvicorn app:create_app --factory --host 127.0.0.1 --port 8791 --workers 1 --no-access-log
```

Não execute vários workers contra o mesmo diretório: este protótipo serializa uma operação por processo, limitando consumo e disputas. Requisições simultâneas recebem 429. A implantação pública multiusuário precisará de uma arquitetura diferente.

## API

Todos os caminhos `/api/v1/*` exigem `Authorization: Bearer <BIO_LAB_TOKEN>`, inclusive consultas e exclusões. Não há autenticação por cookie, token em query string ou CORS aberto. O token representa o **operador do laboratório**, não uma conta de paciente. Não repasse a chave para consultas públicas. Este serviço não implementa vários operadores/organizações ou autorização de tutores.

| Rota | Função |
|---|---|
| `GET /health` | Disponibilidade experimental, sem informações de voluntários |
| `GET /api/v1/status` | Motores, consentimento, retenção e limiares ativos |
| `POST /api/v1/subjects` | Código de voluntário + `consent: true` e `consentVersion: "mydoctor-lab-v1"` |
| `GET /api/v1/subjects` | Voluntários e quantidade de amostras |
| `POST /api/v1/subjects/{id}/samples` | Extrai e cadastra uma amostra, sem identificação |
| `POST /api/v1/preview` | Prévia não persistida de tratamentos da digital |
| `POST /api/v1/trials` | Compara uma captura com referências da base de laboratório |
| `GET /api/v1/metrics` | Ensaios, erros rotulados, recusas, latência e armazenamento |
| `DELETE /api/v1/subjects/{id}` | Revoga a participação e exclui amostras/ensaios associados |
| `DELETE /api/v1/lab` | Exclui dados; exige `X-Confirm-Clear: DELETE-LAB` |

Captura: `method` (`face`/`finger`), `imageB64` (sem prefixo data URL), `consent: true`. Para digital: `finger` (`right_index`/`left_index`), `source` (`scanner` ou `camera_calibrated`), `dpi` real do leitor ou `widthMm` medida, `processing` (`original`/`contrast`/`shadows`) e `polarity` (`original`/`negative`). Facial usa `source: "camera"` e não aceita tratamentos de digital. Campos desconhecidos são rejeitados.

Ensaio rotulado: adicione `groundTruthKnown: true` e `expectedSubjectId` do voluntário conhecido. Para voluntário fora da base, use `expectedSubjectId: null`. O operador informa o rótulo; isso não é uma verdade atestada pelo sistema. Pré-visualização, exclusão e cadastro não contam como identificação.

Exemplo de resposta de ensaio (sem dados biométricos):

```json
{
  "decision": "candidate_for_review",
  "candidate": {"subjectId": "uuid-de-teste", "alias": "V001", "score": 72.5},
  "identityConfirmed": false,
  "familyNotified": false,
  "clinicalAccessGranted": false,
  "thresholdsValidated": false
}
```

Resultados possíveis: `no_reference` (sem referência elegível), `no_candidate`, `ambiguous` ou `candidate_for_review`. Um candidato exige duas imagens cadastradas compatíveis, ultrapassar limiar e distância mínima ao segundo candidato. Não se somam escores de rosto e digital. Nenhum escore é probabilidade ou porcentagem de certeza. O resultado não deve gerar mensagem a familiares, nem mesmo quando ultrapassa o limiar.

## Parâmetros, arquivos e proteção

- Inicialmente **desativado**: `BIO_LAB_ENABLED=1` é exigido na inicialização. Token de pelo menos 32 caracteres e chave Fernet válidos são obrigatórios, sem credenciais padrão.
- Amostras e templates ficam em arquivos Fernet autenticados dentro de diretório privado. SQLite guarda somente índices, códigos de voluntários, versão do consentimento e métricas. Nenhum template é devolvido pela API.
- O payload de imagem não aparece nas mensagens de validação. O servidor é iniciado sem access log. Não ative logs de corpo HTTP, proxy ou modo debug com dados de voluntários.
- Retenção padrão de 24 horas, configurável de 1 a 168 horas. As referências expiram para consulta após o prazo. Enquanto o serviço está ativo, a exclusão periódica ocorre a cada 60 segundos, quando não há operação em andamento; também ocorre ao iniciar e antes de operações. Quando o serviço está parado, os arquivos no volume persistem até a próxima inicialização. Não é garantia de apagamento forense de SSDs/backups. Não faça backups de dados voluntários neste piloto.
- Limites: 100 voluntários, 8 amostras por voluntário, 512 MB de armazenamento de laboratório, 10 mil ensaios e uma operação por vez. Imagens/modelos não entram no git. Há limites de payload, pixels, tempo do worker Java e CPU/memória no Compose.
- Cada modelo ONNX tem revisão e SHA-256 fixados em `models/manifest.json`, conferidos no download e na inicialização. Falta de modelo, falha de integridade ou erro de extração interrompe o teste; não há fallback para hash ou comparação simulada.
- A fotografia da digital **ainda não foi validada** para correspondência biométrica. Os indicadores de foco/contraste são fotográficos e **não são NFIQ/NFIQ2**. Sombras, reflexos, escala, curvatura e distorção continuam sendo problemas a medir. Os testes sintéticos não resolvem esses problemas.
- Facial exige um único rosto, tamanho mínimo e qualidade fotográfica. O piloto não comprova vida nem está validado para olhos fechados, pessoas falecidas, crianças, envelhecimento ou variações demográficas. Não use com pessoa incapaz de consentir nesta etapa.

Variáveis opcionais: `BIO_LAB_DATA`, `BIO_LAB_MODELS`, `BIO_LAB_FINGERPRINT_JAR`, `BIO_LAB_RETENTION_HOURS`, `BIO_LAB_FINGER_THRESHOLD` (inicial: 40), `BIO_LAB_FACE_THRESHOLD` (inicial: 0.50), `BIO_LAB_FINGER_MARGIN` (10), `BIO_LAB_FACE_MARGIN` (0.10). Esses limiares são **hipóteses de teste**, não valores aprovados para a finalidade do MyDoctor. Para limiares novos, use uma instalação de laboratório nova ou limpe ensaios antigos: as métricas não devem misturar configurações diferentes.

## O que foi testado e o que ainda falta

```bash
python -m pytest tests -q
```

Os testes usam padrões de cristas **sintéticos**, inferência dos modelos reais e diretórios temporários: verificam extração SourceAFIS, equivalência de negativo corretamente normalizado, escala medida, execução SFace, recusa de imagem sem rosto, autenticação, consentimento, payloads, criptografia, descarte/revogação, expiração, ambiguidade e métricas. Não incluem rostos ou digitais de pacientes. Os escores de padrões sintéticos não validam identidade humana; o limiar reduzido em uma fixture existe apenas para exercitar a resposta da API.

Precisamos medir com capturas novas, autorizadas e rotuladas, em celulares diferentes, iluminação diferente, sessões diferentes e voluntários fora da base. Métricas do piloto não constituem certificação nem substituem um estudo representativo. O laboratório informa latência de extração/comparação, armazenamento e recusas; ainda não há estimativa de custo mensal confiável.

**Hospedagem:** este protótipo requer Python, Java e processamento de imagens. A documentação da Hostinger informa Python/Java para VPS, não para Business Web Hosting. O app atual permanece no plano existente; não foram contratados serviços nem alterada a infraestrutura de produção. O primeiro teste pode ser local, sem licença comercial biométrica. Para integrar depois ao MyDoctor, será necessário um runtime compatível privado ou uma alternativa de processamento validada para a hospedagem escolhida.

Referências oficiais:

- SourceAFIS: https://sourceafis.machinezoo.com/java
- OpenCV SFace: https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface
- OpenCV YuNet: https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet
- NIST, captura sem contato: https://www.nist.gov/publications/contactless-fingerprint-capture-and-data-interchange-best-practice-recommendation-0
- Hostinger: https://www.hostinger.com/support/which-programming-languages-and-frameworks-are-supported-at-hostinger/

## Licenças e distribuição

O código novo do laboratório é privado do repositório MyDoctor. SourceAFIS e OpenCV/SFace declaram Apache-2.0; o diretório YuNet declara MIT. O download conserva as licenças dos modelos. O JAR agregador conserva os recursos de licença de dependências; antes de distribuir um APK/serviço comercial, revise os avisos e licenças de todas as dependências, pesos e datasets. Não confunda licença da biblioteca com direitos de imagem dos voluntários. Não usamos bases humanas de origem incerta para validar este piloto.
