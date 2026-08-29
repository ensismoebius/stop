# STOP

Aplicação web multiplayer para uso em sala de aula, inspirada no jogo **Stop**, voltada à
memorização e recuperação de conceitos de **qualquer disciplina** — o professor define as
categorias e o conteúdo revisado.

Três clientes convivem na mesma partida:

| Cliente | Rota | Uso |
| --- | --- | --- |
| Painel do professor | `/teacher` | Computador do professor |
| Tela pública | `/screen/:código` | TV ou projetor da sala |
| Interface do aluno | `/join/:código` → `/play` | Navegador do celular |

**Princípio arquitetural:** *o frontend apresenta o estado; o servidor decide o estado.*
Pontuação, cronômetro, ordem do STOP, eliminação e identidade do aluno são sempre
resolvidos no backend.

---

## O que é o Stop (Adedanha)

**Stop** — no Brasil também chamado de **Adedanha** (e variações como *Adedonha*, *Adedomí*
e *Nomes e Coisas*) — é um jogo de papel e caneta que atravessa gerações em famílias, escolas
e recreios de todo o país. O nome "Adedanha" vem da própria mecânica: cada categoria é
anunciada em voz alta como "**A de** Nome", "**A de** Animal", "**A de** Cor" — e "adedanha"
é o jeito informal de dizer "a de..." repetidas vezes.

**Como se joga na tradição:**

1. Cada jogador desenha uma tabela com uma coluna por categoria (Nome, Animal, Cor, Fruta,
   Objeto, Lugar, e outras à escolha do grupo) e uma linha para a rodada.
2. Sorteia-se uma letra — tradicionalmente abrindo uma página aleatória de um livro/lista
   telefônica e apontando às cegas, hoje em dia com um app ou giro de garrafa.
3. Todos escrevem, ao mesmo tempo, uma palavra começando com aquela letra para cada
   categoria.
4. O primeiro a preencher tudo grita **"STOP!"**, e todo mundo para de escrever na hora.
5. Pontuação por categoria: **10 pontos** se a resposta for válida e ninguém mais escreveu
   a mesma palavra, **5 pontos** se for válida mas repetida por outro jogador, **0 pontos**
   se estiver em branco ou for inválida.

Essa plataforma recria esse ritual exatamente como ele é jogado à mão — sorteio de letra,
corrida contra o tempo, grito de STOP, correção coletiva e pontuação 10/5/0 — só que como um
jogo multiplayer em tempo real, trocando as categorias tradicionais (Nome, Animal, Cor...)
pelo conteúdo de **qualquer disciplina** que o professor esteja lecionando — cada turma tem
seus próprios conjuntos de categorias, então o mesmo jogo serve para revisar React Native,
Biologia, História ou qualquer outra matéria. O papel do "juiz" humano — cronômetro, ordem
do STOP, validação das respostas — fica com o servidor, que arbitra tudo de forma justa e
instantânea para a turma inteira.

---

## Stack

* **Backend:** Node.js + Express + Socket.IO
* **Banco:** MySQL 8 (Prisma ORM)
* **Frontend:** React 18 + Vite + React Router
* **Protocolo:** HTTP/REST + WebSocket
* **Execução:** rede local da sala; pronta para servidor remoto

---

## Estrutura

```text
stop/
├── backend/
│   ├── prisma/            schema, migrações e seed
│   └── src/
│       ├── game/          regras puras: normalização, letras, pontuação,
│       │                  máquina de estados, cronômetros
│       ├── services/      regras de negócio (autoridade da partida)
│       ├── repositories/  acesso ao banco via Prisma
│       ├── controllers/   entrada HTTP
│       ├── routes/        API REST
│       ├── sockets/       eventos em tempo real
│       ├── middleware/    autenticação, validação, rate limit, erros
│       └── validators/    schemas zod de REST e Socket.IO
├── frontend/
│   └── src/
│       ├── components/{student,teacher,public,common}
│       ├── pages/         Home, Join, StudentGame, TeacherDashboard, PublicScreen
│       ├── hooks/         relógio do servidor, fullscreen, áudio, socket da sala
│       ├── state/         Context API (sessão do professor e do aluno)
│       └── styles/
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Como executar

**Caminho mais rápido** (tudo via Docker, sem instalar Node/MySQL localmente):

```bash
cp .env.example .env        # edite SESSION_SECRET, ADMIN_PASSWORD e credenciais do MySQL
docker compose up -d --build
# backend  http://localhost:3000
# frontend http://localhost:8080
```

Os passos abaixo detalham a execução manual (útil para desenvolvimento, com hot-reload).

### Requisitos

* Node.js 20+
* MySQL 8 (ou Docker)

### 1. Variáveis de ambiente

```bash
cp .env.example .env
# edite SESSION_SECRET, ADMIN_PASSWORD e as credenciais do MySQL
```

O backend lê `backend/.env` (link simbólico para o `.env` da raiz).

### 2. Banco de dados

Com Docker:

```bash
docker compose up -d mysql
```

Ou aponte `DATABASE_URL` para um MySQL já existente.

### 3. Backend

```bash
cd backend
npm install
npx prisma migrate deploy   # cria o schema
npm run seed                # professor, turma de exemplo, alunos e 3 conjuntos de categorias
npm run dev                 # http://0.0.0.0:3000
```

`migrate deploy` e `seed` são obrigatórios: sem o schema aplicado o login do professor falha,
e é o `seed` que cria a conta a partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`. O servidor
verifica o banco ao subir e registra a instrução no log caso algo esteja faltando.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://0.0.0.0:5173 (proxy de /api e /socket.io para :3000)
```

Em produção/sala de aula basta o backend: `npm run build` no frontend gera `frontend/dist`,
que o Express serve automaticamente na mesma porta — os alunos acessam apenas
`http://IP-DO-PROFESSOR:3000`.

### 5. Tudo em Docker

```bash
docker compose up -d --build
# backend  http://localhost:3000
# frontend http://localhost:8080
```

### Credenciais iniciais

Definidas por `ADMIN_EMAIL` / `ADMIN_PASSWORD` e criadas pelo seed
(padrão de desenvolvimento: `professor@stop.local` / `stop-admin`). **Troque em produção.**

---

## Rede Wi-Fi da sala de aula

A plataforma roda na rede local e depende do Wi-Fi da sala para o tráfego dos
celulares até o servidor (todos na mesma rede, no mesmo roteador/AP). Com ~30
alunos, um **roteador/AP doméstico barato é o ponto que mais derruba
conexões**: ele perde o estado do cliente (tabela ARP/lease), a conexão
WebSocket do aluno morre e só "ligar e desligar o Wi-Fi" do celular recoloca o
contato. O app já lida com isso (reconexão automática com backoff e jitter),
mas a rede precisa estar no melhor formato para o servidor aguentar a turma.

Ajustes recomendados no roteador/AP:

| Ajuste | Valor recomendado | Motivo |
| --- | --- | --- |
| Segurança | **WPA2-PSK** (não WPA3) | WPA3/PMKSA-caching falha com muitos clientes em firmware barato |
| Largura de banda / canal | **20 MHz** no 2.4 GHz, canal **fixo** | evita saltos de canal e interferência com redes vizinhas |
| Band steering / roaming | **desligado** | evita reassociações em massa dos clientes |
| Roteamento | **modo Access Point/bridge** (sem duplo NAT) | alunos alcançam o notebook em camada 2, poupando a tabela NAT do roteador |
| DHCP | pool com **≥ 50** endereços e lease longo (ou reservas fixas) | o pool padrão pequeno costuma ser o teto real de clientes |

Sempre que possível, **ligue o notebook do professor ao roteador por cabo
Ethernet**: tira um cliente do rádio (mais ar para os 30 celulares), libera um
slot do chipset e dá ao servidor um enlace estável — a WebSocket do servidor
deixa de cair e a avalanche de reconexões dos alunos desaparece.

Se mesmo assim a rede for muito limitada, o build suporta forçar HTTP
long-polling (mais robusto contra half-open) em vez de WebSocket:
`VITE_SOCKET_TRANSPORTS=polling` no build do frontend (ver `tempo-real.md #5`).

---

## Fluxo de uma aula

1. Professor entra em `/teacher` e autentica.
2. Cria a partida (nome + turma) e a sala. O servidor gera o código (`STOP-7F42`) e o QR Code.
3. O QR Code aponta para `http://IP:PORTA/join/STOP-7F42` — sem dados pessoais.
4. Alunos escaneiam, informam a **matrícula**, o servidor devolve o **nome do banco** e o aluno confirma.
5. Professor escolhe o tema (conjunto de categorias), **sorteia a letra** e **inicia a rodada**.
6. Alunos preenchem as categorias em qualquer ordem; o STOP só habilita com todas preenchidas.
7. O primeiro STOP válido — ou o fim do tempo — encerra a rodada e abre a correção.
8. Professor corrige (mouse ou teclado), pontua, o ranking é recalculado e exibido na TV.
9. `PRÓXIMA RODADA` limpa eliminações e recomeça o ciclo.

### Comandos sempre à mão

O painel mantém três botões fixos, habilitados conforme o estado da rodada:

| Botão | Quando funciona | Efeito |
| --- | --- | --- |
| `▶ INICIAR RODADA` | rodada em `READY` (letra sorteada) | libera as respostas e liga o cronômetro |
| `⏹ ENCERRAR RODADA` | rodada em `PLAYING` | encerra na hora e abre a correção |
| `✕ Cancelar rodada` | qualquer rodada não finalizada | descarta a rodada **sem pontuar** e libera a criação de outra |

`Cancelar rodada` devolve todos os alunos ao estado pronto — inclusive quem foi eliminado — e
mantém as respostas no banco apenas para auditoria. `Encerrar partida`, no cartão da sala,
fecha a partida atual e volta para a criação de uma nova.

### Um único aluno

A partida funciona com qualquer número de participantes, inclusive **um só aluno** — útil para
estudo individual ou para testar o material antes da aula. Sem outro jogador não há respostas
repetidas, então cada acerto vale os 10 pontos da resposta exclusiva.

---

## Regras implementadas no servidor

| Regra | Onde |
| --- | --- |
| Sorteio da letra sem repetição | `src/game/letters.js` |
| Normalização Unicode das respostas | `src/game/normalize.js` |
| Pontuação 10 / 5 / 0 e ranking com empates | `src/game/scoring.js` |
| Máquina de estados da rodada | `src/game/roundState.js` |
| Cronômetro autoritativo e timeout | `src/game/timers.js` |
| STOP atômico (`UPDATE ... WHERE status='PLAYING'`) | `src/services/roundService.js` |
| Eliminação por saída do fullscreen | `src/services/roundService.js` |
| Cancelamento de rodada em qualquer estado | `src/services/roundService.js` |
| Bloqueio de respostas após o STOP | `src/services/answerService.js` |
| Recuperação de rodadas após reinício do processo | `src/game/recovery.js` |

A eliminação vale **apenas para a rodada corrente**: o aluno volta na próxima.

---

## API REST

Rotas administrativas exigem `Authorization: Bearer <token>` (sessão do professor).
A sessão do aluno (`x-player-token`) **nunca** é aceita nelas.

```text
GET    /api/health

POST   /api/auth/login                 GET  /api/auth/me

POST   /api/games                      GET  /api/games/:id
POST   /api/games/:id/rooms            GET  /api/games/:id/scores
GET    /api/games/:id/history          GET  /api/games/:id/statistics
GET    /api/games/:id/letters          POST /api/games/:id/rounds/next

GET    /api/rooms/:code                (público)
POST   /api/rooms/:code/identify       (público — devolve o nome para confirmação)
POST   /api/rooms/:code/join           (público — cria a sessão do aluno)
GET    /api/rooms/:code/me             (aluno)
GET    /api/rooms/:code/public-state   (tela pública)
GET    /api/rooms/:code/qrcode         GET  /api/rooms/:code/state

POST   /api/rounds                     GET  /api/rounds/:id
POST   /api/rounds/:id/letter          POST /api/rounds/:id/start
POST   /api/rounds/:id/stop            POST /api/rounds/:id/correction
GET    /api/rounds/:id/correction      POST /api/rounds/:id/score
POST   /api/rounds/:id/finish          POST /api/rounds/:id/cancel
GET    /api/rounds/:id/answers

PATCH  /api/answers/:id                POST /api/answers/bulk-review

GET/POST/PATCH/DELETE  /api/students   /api/classes  /api/category-sets  /api/categories
```

## Eventos Socket.IO

**Cliente → servidor:** `joinRoom`, `identifyStudent`, `ready`, `submitAnswer`, `updateAnswer`,
`requestStop`, `fullscreenExited`, `telemetry`, `requestState`, `disconnect`.

**Servidor → cliente:** `roomState`, `playerJoined`, `playerLeft`, `roundCreated`,
`letterSelected`, `roundStarted`, `answerUpdated`, `playerProgress`, `playerEliminated`,
`roundStopped`, `roundTimedOut`, `correctionStarted`, `answerReviewed`, `scoreUpdated`,
`rankingUpdated`, `roundFinished`, `roundCancelled`, `nextRound`, `roomStatusChanged`, `error`.

Todo payload é validado com zod. Cada perfil recebe somente o que precisa: o aluno vê apenas
as próprias respostas, o professor vê o progresso agregado e a tela pública nunca recebe
matrículas.

---

## Testes

```bash
cd backend
npm run test:unit          # regras puras, sem banco
npm test                   # unitários + integração (exige MySQL em DATABASE_URL)
```

A configuração de teste fica em `backend/.env.test` e aponta para um banco dedicado
(`stop_test`), que precisa existir antes da primeira execução — o `globalSetup` aplica as
migrações automaticamente.

Com Docker:

```bash
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  -e "CREATE DATABASE IF NOT EXISTS stop_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
      GRANT ALL ON stop_test.* TO 'stop'@'%';"
```

Com um MySQL/MariaDB próprio, crie o banco e aponte a suíte para ele sem editar arquivos —
uma `DATABASE_URL` exportada no shell tem precedência sobre o `.env.test`:

```bash
mysql -u SEU_USUARIO -p -e "CREATE DATABASE IF NOT EXISTS stop_test \
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
DATABASE_URL="mysql://SEU_USUARIO:SENHA@127.0.0.1:3306/stop_test" npm test
```

Cobertura atual: **95 testes**.

* **Unitários** — normalização Unicode, validação da letra, sorteio sem repetição,
  pontuação 10/5/0, empates no ranking e transições da máquina de estados.
* **Integração** — identificação por matrícula, criação de sala, ciclo completo da rodada,
  correção, pontuação, histórico e isolamento de dados por perfil.
* **Testes críticos obrigatórios** — STOP incompleto rejeitado, dois STOP simultâneos com um
  único vencedor, resposta após STOP rejeitada, STOP após timeout rejeitado, eliminado sem
  responder nem dar STOP, eliminação por saída do fullscreen, matrícula inexistente negada.
* **Jogador único e controle da partida** — rodada completa com um só aluno, acúmulo de pontos
  entre rodadas, cancelamento em cada estado da máquina, e encerramento da partida seguido de
  uma nova.
* **End-to-end** — fluxo real por Socket.IO com professor, tela pública e três alunos,
  incluindo reconexão e recuperação do estado autoritativo.

---

## Segurança

* Autenticação administrativa por e-mail + senha (bcrypt) com token JWT dedicado.
* Sessão do aluno em token opaco persistido no banco; nunca reaproveitada como sessão administrativa.
* Validação de todos os payloads (REST e Socket.IO) com zod.
* Rate limiting geral e específico para login/identificação.
* Prisma como camada de acesso (consultas parametrizadas).
* CORS configurável; `helmet` nas respostas HTTP.
* Credenciais apenas em variáveis de ambiente — nunca expostas ao frontend.

---

## Limitações conhecidas

* O navegador **não permite** manter o dispositivo em tela cheia à força. A aplicação detecta a
  saída do fullscreen e o servidor elimina o aluno da rodada; `blur` e `visibilitychange` são
  registrados apenas como telemetria, nunca como prova.
* O áudio é sintetizado no cliente e depende de uma interação inicial do usuário; o jogo
  funciona normalmente sem ele.
* O estado autoritativo vive no banco e os cronômetros no processo Node. Para rodar em várias
  instâncias, será necessário um adaptador de Socket.IO (Redis) e um agendador compartilhado.
