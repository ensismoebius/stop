# STOP — Plataforma Competitiva de Revisão de React Native

## 1. Objetivo

Desenvolver uma aplicação web multiplayer para utilização em sala de aula, inspirada no jogo brasileiro **Stop**, com foco na memorização e recuperação de conceitos de **React Native**.

A aplicação será utilizada simultaneamente em três contextos:

1. **Painel administrativo do professor** — computador do professor.
2. **Tela pública da partida** — computador conectado à TV/projetor da sala.
3. **Interface dos alunos** — navegador dos celulares dos alunos.

A aplicação deverá permitir que o professor controle as rodadas em tempo real enquanto os alunos competem entre si.

### Stack obrigatória

* **Backend:** Node.js
* **Framework HTTP:** Express
* **Comunicação em tempo real:** Socket.IO
* **Banco de dados:** MySQL
* **Frontend:** React
* **ORM recomendado:** Prisma
* **Protocolo:** HTTP/REST + WebSocket via Socket.IO
* **Frontend responsivo:** desktop e mobile
* **Execução inicial:** rede local da sala de aula

A aplicação deve ser arquitetada de maneira que posteriormente possa ser executada também em um servidor remoto.

---

# 2. Conceito do jogo

O jogo mantém a mecânica clássica do Stop:

* uma rodada possui um conjunto de categorias;
* uma letra é sorteada;
* os alunos devem preencher uma resposta para cada categoria;
* cada resposta deve começar com a letra sorteada;
* o aluno somente pode pressionar **STOP** depois de preencher todas as categorias obrigatórias;
* o primeiro aluno que pressionar STOP encerra imediatamente a rodada;
* depois do STOP, nenhuma resposta pode ser modificada;
* o professor corrige as respostas;
* a pontuação é calculada;
* o ranking é atualizado;
* uma nova rodada pode ser iniciada.

A diferença é que as categorias não são fixas.

Cada rodada possui um **tema/conjunto de categorias diferente**, relacionado ao conteúdo didático.

Exemplos:

### Rodada — React Native Components

* Componente
* Prop
* Evento
* API
* Biblioteca

### Rodada — React Hooks

* Hook
* Hook nativo
* Hook customizado
* Conceito relacionado a estado
* Conceito relacionado a efeitos

### Rodada — Navegação

* Componente
* Método
* Prop
* Evento
* Conceito

O professor poderá cadastrar novos conjuntos de categorias.

---

# 3. Arquitetura geral

A aplicação deverá possuir arquitetura cliente-servidor.

```text
                    ┌──────────────────────┐
                    │      MySQL           │
                    │                      │
                    │ alunos               │
                    │ turmas               │
                    │ salas                │
                    │ rodadas              │
                    │ categorias           │
                    │ respostas             │
                    │ pontuações            │
                    └──────────▲───────────┘
                               │
                               │ Prisma
                               │
                    ┌──────────┴───────────┐
                    │ Node.js + Express    │
                    │                      │
                    │ REST API             │
                    │ Socket.IO            │
                    │ regras do jogo       │
                    │ autenticação         │
                    │ pontuação             │
                    └──────┬─────┬─────────┘
                           │     │
             WebSocket/HTTP│     │WebSocket/HTTP
                           │     │
             ┌─────────────┘     └─────────────┐
             ▼                                 ▼
   ┌───────────────────┐             ┌───────────────────┐
   │ React — Professor │             │ React — Aluno     │
   │                   │             │                   │
   │ Painel admin      │             │ Celular           │
   │ Controle da sala  │             │ Respostas         │
   │ Correção          │             │ STOP              │
   │ Ranking           │             │ Status             │
   └───────────────────┘             └───────────────────┘

                           │
                           ▼
                 ┌─────────────────────┐
                 │ React — Tela pública│
                 │                     │
                 │ TV / Projetor       │
                 │ Letra               │
                 │ Cronômetro          │
                 │ Ranking              │
                 │ Status da rodada    │
                 └─────────────────────┘
```

O **servidor é a autoridade da partida**.

O cliente nunca deve ser considerado confiável para:

* pontuação;
* horário;
* estado da rodada;
* ordem do STOP;
* eliminação;
* respostas após encerramento;
* identificação do aluno.

---

# 4. Perfis de utilização

## 4.1 Professor

O professor possui acesso ao painel administrativo.

Pode:

* criar uma sala;
* selecionar a turma;
* visualizar alunos conectados;
* iniciar a partida;
* configurar a rodada;
* selecionar o conjunto de categorias;
* sortear a letra;
* iniciar a rodada;
* definir duração;
* visualizar o estado dos alunos;
* encerrar uma rodada;
* corrigir respostas;
* atribuir respostas válidas/inválidas;
* visualizar pontuação;
* visualizar ranking;
* iniciar a próxima rodada;
* consultar estatísticas.

---

## 4.2 Aluno

O aluno:

1. acessa o endereço/IP fornecido pelo professor;
2. escaneia o QR Code da sala;
3. informa sua matrícula;
4. recebe o nome correspondente;
5. confirma sua identidade;
6. entra na sala;
7. aguarda o início da rodada;
8. recebe a letra;
9. preenche as categorias;
10. pressiona STOP quando terminar.

O aluno não possui acesso às funções administrativas.

---

## 4.3 Tela pública

A tela pública é destinada à TV ou projetor.

Não deve exibir informações privadas dos alunos.

Deve apresentar:

* nome da partida;
* tema da rodada;
* letra;
* cronômetro;
* quantidade de jogadores;
* estado da partida;
* animações;
* ranking;
* mensagens como:

  * "Aguardando jogadores";
  * "Preparar!";
  * "Letra sorteada";
  * "VALENDO!";
  * "STOP!";
  * "Correção";
  * "Próxima rodada".

---

# 5. Fluxo de criação da partida

O professor acessa o painel administrativo.

### Passo 1

Seleciona uma turma.

### Passo 2

Cria uma nova sala.

O servidor gera um identificador único para a sala.

Exemplo:

```text
STOP-7F42
```

### Passo 3

O sistema gera um QR Code contendo a URL de entrada da sala.

Exemplo conceitual:

```text
http://192.168.0.10:3000/join/STOP-7F42
```

O QR Code é exibido na tela do professor e pode também ser exibido na TV.

### Passo 4

Os alunos escaneiam o QR Code.

---

# 6. Identificação do aluno

Ao acessar a sala, o aluno deverá informar sua matrícula.

Exemplo:

```text
Matrícula

[ 202612345 ]

[ CONTINUAR ]
```

O frontend envia a matrícula ao backend.

O backend consulta o banco de dados.

Caso exista:

```text
Você é:

João da Silva

Matrícula: 202612345

[ SIM, SOU EU ]
[ NÃO ]
```

Caso não exista:

```text
Matrícula não encontrada.
Verifique o número informado.
```

O nome deve ser obtido exclusivamente do banco de dados.

O cliente nunca deve enviar o próprio nome como mecanismo de identificação.

---

# 7. Estado de participação

Cada aluno deverá possuir um estado dentro da sala.

Estados possíveis:

```text
WAITING
READY
PLAYING
SUBMITTED
ELIMINATED
FINISHED
```

### WAITING

Aluno conectado, aguardando rodada.

### READY

Aluno identificado e pronto.

### PLAYING

Aluno participando da rodada.

### SUBMITTED

Aluno pressionou STOP.

### ELIMINATED

Aluno foi eliminado da rodada.

### FINISHED

Rodada encerrada e aluno aguardando correção/próxima rodada.

---

# 8. Tela do aluno

A interface mobile deve ser projetada **mobile-first**.

O objetivo principal é minimizar erros de interação.

## Elementos fixos

No topo:

```text
┌──────────────────────────┐
│ LETRA                    │
│          R               │
│                          │
│ ⏱ 01:23                  │
└──────────────────────────┘
```

Abaixo:

```text
7 / 10 preenchidas
```

Depois, uma lista de categorias.

Exemplo:

```text
┌──────────────────────────┐
│ COMPONENTE          ✓    │
├──────────────────────────┤
│ HOOK                     │
├──────────────────────────┤
│ PROP                ✓    │
├──────────────────────────┤
│ EVENTO                   │
├──────────────────────────┤
│ BIBLIOTECA          ✓    │
└──────────────────────────┘
```

O aluno pode tocar em qualquer categoria.

---

# 9. Navegação entre categorias

Todas as categorias devem estar acessíveis a partir da mesma tela.

Não utilizar um wizard obrigatório do tipo:

```text
Categoria 1 → Categoria 2 → Categoria 3
```

O aluno deve poder:

```text
Categoria 1
↓
Categoria 5
↓
Categoria 2
↓
Categoria 1 novamente
```

Isso reduz o custo de navegação e permite que cada aluno escolha sua própria estratégia.

A categoria atual deve possuir destaque visual.

Categorias preenchidas devem apresentar indicação clara.

Categorias vazias devem permanecer visualmente distinguíveis.

---

# 10. Campos de resposta

Ao selecionar uma categoria:

```text
HOOK

┌────────────────────────────┐
│ useState                   │
└────────────────────────────┘

[ VOLTAR ]
```

O campo deve:

* possuir tamanho adequado para teclado mobile;
* utilizar `autocomplete="off"`;
* evitar sugestões desnecessárias;
* permitir edição até o STOP;
* aceitar letras maiúsculas/minúsculas;
* preservar o texto digitado.

Não deve existir botão de "Salvar" individual para cada categoria.

A resposta deve ser mantida no estado local do React e sincronizada com o servidor de maneira controlada.

---

# 11. Botão STOP

O botão STOP deve permanecer em posição previsível, preferencialmente fixado na parte inferior da viewport.

Exemplo:

```text
┌──────────────────────────┐
│                          │
│       CATEGORIAS         │
│                          │
│                          │
├──────────────────────────┤
│       🛑 STOP            │
└──────────────────────────┘
```

Inicialmente:

```text
STOP = disabled
```

O botão somente deve ser habilitado quando **todas as categorias obrigatórias possuírem resposta não vazia**.

Exemplo:

```text
5 / 5 preenchidas

[ STOP ]
```

Enquanto:

```text
4 / 5 preenchidas

[ STOP ] ← desabilitado
```

Essa validação deve existir:

1. no frontend, para feedback imediato;
2. no backend, obrigatoriamente, para segurança.

O servidor deve rejeitar um evento STOP se houver categoria obrigatória sem resposta.

---

# 12. Evento STOP

O evento STOP é crítico e deve ser processado atomicamente no servidor.

Quando o primeiro aluno enviar:

```text
stopRound
```

o servidor deve:

1. verificar se a rodada ainda está ativa;
2. verificar se o jogador ainda está elegível;
3. verificar se todas as respostas estão preenchidas;
4. registrar timestamp do servidor;
5. identificar o primeiro STOP válido;
6. alterar o estado da rodada para `STOPPED`;
7. bloquear novas respostas;
8. bloquear alterações;
9. informar todos os clientes;
10. iniciar imediatamente a fase de correção.

A ordem deve ser determinada pelo **servidor**, não pelo relógio do navegador.

---

# 13. Condição de corrida do STOP

É possível que dois celulares enviem STOP praticamente simultaneamente.

O servidor deve resolver isso atomicamente.

Somente um jogador poderá ser registrado como:

```text
firstStopper
```

Os demais eventos STOP recebidos depois devem ser rejeitados.

A implementação deve utilizar uma operação transacional/atômica no banco ou um mecanismo equivalente no servidor.

---

# 14. Finalização automática

Cada rodada deve possuir duração máxima configurável.

Valor inicial recomendado:

```text
120 segundos
```

Se o cronômetro chegar a zero antes de qualquer STOP:

```text
TIMEOUT
```

A rodada é encerrada automaticamente.

As respostas existentes são preservadas.

O aluno não poderá mais alterar respostas.

A rodada segue para correção.

---

# 15. Sorteio da letra

Antes da rodada começar, o professor deverá possuir um botão:

```text
[SORTEAR LETRA]
```

O backend gera a letra aleatoriamente.

O sorteio deve ocorrer no servidor.

Não utilizar:

```javascript
Math.random()
```

no frontend como autoridade do sorteio.

A letra sorteada deve ser persistida na rodada.

Exemplo:

```text
Rodada 4
Tema: React Native Hooks
Letra: S
```

A animação de sorteio pode ocorrer no frontend, mas o resultado oficial é aquele enviado pelo servidor.

---

# 16. Não repetição de letras

Durante uma partida, o sistema deve evitar repetir letras já utilizadas enquanto houver letras disponíveis.

Exemplo:

```text
Rodada 1 → A
Rodada 2 → M
Rodada 3 → R
Rodada 4 → T
```

Se todas as letras disponíveis forem utilizadas, o sistema poderá reiniciar o conjunto.

O professor deve poder visualizar o histórico de letras utilizadas.

---

# 17. Configuração de categorias

Categorias devem ser entidades independentes.

Exemplo:

```text
Categoria:
id
nome
descricao
tema
ativo
ordem
```

Um conjunto pode ser:

```text
React Native — Componentes
```

com:

```text
Componente
Prop
Evento
Hook
Biblioteca
```

Outro conjunto:

```text
React Native — Navegação
```

com:

```text
Navigator
Screen
Hook
Método
Prop
```

As categorias da rodada são copiadas/associadas à rodada no momento de sua criação.

Isso impede que alterações posteriores no cadastro modifiquem uma partida histórica.

---

# 18. Correção

Após o STOP, o painel administrativo deve mostrar uma interface de correção.

Exemplo:

```text
LET R = R

Aluno       Componente    Hook       Evento
------------------------------------------------
João        Refresh       useRef     Scroll
Maria       Router        useState   Press
Pedro       Refresh       useRef     Press
```

O professor poderá marcar cada resposta como:

```text
VÁLIDA
INVÁLIDA
EM BRANCO
```

Opcionalmente:

```text
DUPLICADA
```

A correção deve ser rápida.

Preferencialmente, o professor deve conseguir navegar pelas respostas com teclado.

---

# 19. Regra de pontuação

Adotar a regra clássica:

### 10 pontos

Resposta correta e exclusiva.

### 5 pontos

Resposta correta, porém também fornecida por outro aluno.

### 0 pontos

* resposta vazia;
* resposta incorreta;
* resposta que não começa com a letra;
* resposta invalidada pelo professor.

Exemplo:

Letra:

```text
R
```

Categoria:

```text
Componente
```

Respostas:

```text
João  → Refresh
Maria → Refresh
Pedro → Router
```

Pontuação:

```text
João  → 5
Maria → 5
Pedro → 10
```

A decisão de validade semântica permanece sob responsabilidade do professor.

O sistema pode sugerir automaticamente inconsistências, mas não deve substituir a correção humana.

---

# 20. Normalização das respostas

Para identificar respostas iguais, o backend deve possuir uma função de normalização.

A comparação deve ser:

* case-insensitive;
* tolerante a espaços extras;
* tolerante a acentos para fins de comparação;
* Unicode-aware.

Exemplo:

```text
"UseState"
"usestate"
"USESTATE"
```

devem ser considerados equivalentes.

Da mesma forma:

```text
"  useState  "
```

deve ser normalizado.

A resposta original deve permanecer armazenada para exibição.

A normalização deve ser utilizada apenas para comparação.

---

# 21. Validação da letra

O sistema deve verificar se a resposta começa com a letra da rodada após normalização.

Exemplo:

```text
Letra: R

"React"
```

válida quanto ao critério lexical.

Já:

```text
"Expo"
```

não começa com R.

Essa validação automática não determina se a resposta é semanticamente correta para a categoria.

---

# 22. Tela pública

A tela pública deve ser visualmente impactante, mas não deve comprometer legibilidade.

Elementos:

```text
┌─────────────────────────────────────┐
│             STOP RN                 │
│                                     │
│        REACT NATIVE — HOOKS         │
│                                     │
│                 R                   │
│                                     │
│               01:17                 │
│                                     │
│         24 jogadores ativos         │
│                                     │
└─────────────────────────────────────┘
```

Durante o sorteio:

* animação da letra;
* efeito visual;
* som opcional.

Durante os últimos segundos:

* alteração visual do cronômetro;
* animação discreta;
* música/efeito de urgência opcional.

---

# 23. Áudio

A aplicação poderá possuir trilha sonora durante a rodada.

Estados sugeridos:

```text
WAITING
START
PLAYING
FINAL_SECONDS
STOPPED
CORRECTION
```

Cada estado pode possuir efeitos sonoros diferentes.

Entretanto, navegadores podem bloquear reprodução automática de áudio.

Portanto:

* não depender do áudio para funcionamento;
* permitir ativação/desativação;
* realizar uma interação inicial do usuário quando necessário;
* armazenar a preferência de volume localmente.

---

# 24. Tela cheia

A aplicação deve solicitar Fullscreen API no dispositivo do aluno quando a partida começar.

Porém, é importante respeitar uma limitação estrutural dos navegadores:

**JavaScript não pode obrigar o navegador a permanecer permanentemente em tela cheia.**

A aplicação deve, portanto, implementar a regra:

> Se o aluno sair do modo fullscreen durante uma rodada ativa, ele será eliminado daquela rodada.

Monitorar:

```javascript
document.fullscreenElement
```

e o evento:

```javascript
fullscreenchange
```

Quando ocorrer uma transição:

```text
fullscreenElement !== null
```

para:

```text
fullscreenElement === null
```

durante `PLAYING`, o cliente deve enviar:

```text
fullscreenExited
```

ao servidor.

O servidor deve validar o estado da sessão e eliminar o aluno da rodada.

A eliminação deve ser definitiva para aquela rodada.

O aluno poderá participar novamente na próxima rodada.

---

# 25. Limitações da detecção de foco

Não utilizar exclusivamente `blur` como prova de que o aluno saiu da aplicação.

Eventos como:

```javascript
window.blur
```

podem ocorrer por motivos legítimos.

A regra de eliminação deve ser baseada primariamente na saída do fullscreen.

`visibilitychange` e `blur` podem ser registrados como eventos de telemetria.

---

# 26. Eliminação

Quando o servidor eliminar um aluno:

```text
player.status = ELIMINATED
```

O servidor deverá:

* bloquear novas respostas;
* bloquear STOP;
* remover o aluno da competição daquela rodada;
* enviar evento para o cliente;
* atualizar a tela do aluno;
* atualizar a contagem pública de jogadores ativos.

Mensagem:

```text
Você saiu da tela cheia.

Você foi eliminado desta rodada.

Você poderá participar da próxima rodada.
```

---

# 27. Próxima rodada

Após a correção, o professor seleciona:

```text
[PRÓXIMA RODADA]
```

O servidor:

1. cria nova rodada;
2. seleciona categorias;
3. seleciona letra;
4. redefine estados dos jogadores;
5. remove eliminações anteriores;
6. inicia novo cronômetro;
7. libera respostas.

Um aluno eliminado na rodada anterior poderá participar normalmente da nova rodada.

---

# 28. Banco de dados

Modelo conceitual mínimo.

## Student

```text
id
registrationNumber
name
classId
active
createdAt
updatedAt
```

## Class

```text
id
name
code
createdAt
updatedAt
```

## Game

```text
id
name
classId
status
createdAt
startedAt
finishedAt
```

## Room

```text
id
gameId
code
status
createdAt
```

## PlayerSession

```text
id
roomId
studentId
status
connectedAt
disconnectedAt
createdAt
```

## CategorySet

```text
id
name
description
active
createdAt
updatedAt
```

## Category

```text
id
categorySetId
name
description
required
order
active
```

## Round

```text
id
gameId
roundNumber
categorySetId
letter
durationSeconds
status
startedAt
stoppedAt
firstStopperId
createdAt
```

## Answer

```text
id
roundId
playerSessionId
categoryId
value
normalizedValue
submittedAt
isValid
score
```

## Score

```text
id
gameId
studentId
total
updatedAt
```

---

# 29. Integridade do banco

Criar índices para:

```text
Student.registrationNumber
Room.code
Round.gameId
Answer.roundId
Answer.playerSessionId
Score.gameId
```

Criar restrições únicas apropriadas.

Exemplo:

```text
Student.registrationNumber UNIQUE
Room.code UNIQUE
```

E uma resposta única por:

```text
(roundId, playerSessionId, categoryId)
```

---

# 30. API REST

A API deve possuir, no mínimo:

```text
POST   /api/games
GET    /api/games/:id
POST   /api/games/:id/rooms
GET    /api/rooms/:code
POST   /api/rooms/:code/join
POST   /api/rounds
POST   /api/rounds/:id/start
POST   /api/rounds/:id/stop
GET    /api/rounds/:id
GET    /api/rounds/:id/answers
PATCH  /api/answers/:id
GET    /api/games/:id/scores
```

Também devem existir endpoints administrativos para:

```text
GET/POST/PATCH/DELETE /api/students
GET/POST/PATCH/DELETE /api/classes
GET/POST/PATCH/DELETE /api/category-sets
GET/POST/PATCH/DELETE /api/categories
```

---

# 31. Socket.IO

Socket.IO será utilizado para eventos em tempo real.

Eventos sugeridos.

## Cliente → servidor

```text
joinRoom
identifyStudent
ready
submitAnswer
updateAnswer
requestStop
fullscreenExited
disconnect
```

## Servidor → cliente

```text
roomState
playerJoined
playerLeft
studentIdentified
roundCreated
letterSelected
roundStarted
answerUpdated
playerEliminated
roundStopped
roundTimedOut
scoreUpdated
rankingUpdated
nextRound
error
```

---

# 32. Estado da rodada

Implementar explicitamente uma máquina de estados.

```text
CREATED
   ↓
READY
   ↓
STARTING
   ↓
PLAYING
   ↓
STOPPED
   ↓
CORRECTION
   ↓
SCORED
   ↓
FINISHED
```

Não permitir transições arbitrárias.

Por exemplo:

```text
FINISHED → PLAYING
```

deve ser impossível.

Uma nova rodada deverá ser criada.

---

# 33. Estado autoritativo

O servidor deverá manter o estado oficial.

Exemplo:

```javascript
{
  roundId: 42,
  status: "PLAYING",
  letter: "R",
  startedAt: "...",
  endsAt: "...",
  firstStopper: null
}
```

O cronômetro exibido pelo React é apenas uma representação visual.

O servidor deve utilizar timestamps próprios para determinar se o tempo acabou.

---

# 34. Segurança

Mesmo sendo uma aplicação para rede local, implementar:

* validação de entrada;
* rate limiting;
* proteção contra SQL injection via ORM;
* sanitização;
* validação de payloads;
* CORS configurado;
* autenticação administrativa;
* autorização por função;
* proteção de endpoints administrativos;
* não exposição das credenciais do banco ao frontend.

O aluno não deve conseguir executar diretamente:

```text
startRound
stopRound
changeLetter
editScore
```

sem autorização.

---

# 35. Autenticação administrativa

O professor deverá possuir autenticação separada.

O sistema pode inicialmente utilizar:

```text
email + senha
```

ou uma credencial administrativa configurada no ambiente.

A sessão administrativa deve possuir autorização específica.

Não reutilizar a sessão do aluno para funções administrativas.

---

# 36. QR Code

O QR Code deverá representar a sala, não necessariamente o aluno.

Exemplo:

```text
http://HOST:PORT/join/STOP-7F42
```

O QR Code não deve conter:

* senha;
* nome do aluno;
* matrícula;
* dados pessoais.

A matrícula é informada posteriormente pelo aluno e validada no servidor.

---

# 37. Rede local

A primeira versão deve funcionar em uma rede Wi-Fi local.

Exemplo:

```text
Professor:
192.168.1.10

Servidor:
192.168.1.10:3000
```

Alunos acessam:

```text
http://192.168.1.10:3000
```

O servidor deve escutar em:

```text
0.0.0.0
```

e não apenas:

```text
localhost
```

para permitir acesso pelos celulares.

---

# 38. Responsividade

A interface deverá possuir pelo menos três breakpoints conceituais:

```text
mobile
tablet
desktop
```

### Mobile

Prioridade:

* campos;
* categorias;
* cronômetro;
* STOP.

### Desktop professor

Prioridade:

* controle;
* correção;
* ranking;
* estatísticas.

### TV

Prioridade:

* legibilidade a distância;
* letra;
* cronômetro;
* estado;
* ranking.

---

# 39. Acessibilidade

Implementar:

* contraste adequado;
* fontes legíveis;
* áreas de toque grandes;
* estados visuais que não dependam exclusivamente de cor;
* navegação por teclado no painel administrativo;
* labels semânticos;
* `aria-label` quando necessário;
* feedback de erro claro.

No celular, botões interativos devem possuir área de toque confortável.

---

# 40. UX do aluno

A tela deve possuir poucos elementos.

Prioridade visual:

```text
1. Letra
2. Cronômetro
3. Categorias
4. Progresso
5. STOP
```

Evitar:

* menus desnecessários;
* modais frequentes;
* animações excessivas;
* elementos pequenos;
* navegação profunda.

---

# 41. UX do professor

O painel administrativo deve separar claramente:

```text
CONTROLE DA PARTIDA
```

de:

```text
CORREÇÃO
```

e:

```text
CONFIGURAÇÃO
```

O professor deve conseguir iniciar uma rodada sem navegar por diversas telas.

Fluxo ideal:

```text
Selecionar tema
      ↓
Sortear letra
      ↓
Iniciar rodada
      ↓
Acompanhar
      ↓
STOP
      ↓
Corrigir
      ↓
Pontuar
      ↓
Ranking
      ↓
Próxima rodada
```

---

# 42. Ranking

A tela pública poderá apresentar:

```text
🏆 RANKING

1. João ........ 120
2. Maria ....... 115
3. Pedro ....... 103
4. Ana .......... 98
```

O ranking deve ser atualizado pelo servidor.

Empates devem ser tratados explicitamente.

Critério inicial:

```text
maior pontuação = melhor posição
```

Em caso de empate:

```text
mesma posição
```

Não utilizar ordem de chegada como critério de desempate, salvo configuração futura.

---

# 43. Estatísticas

Registrar dados suficientes para produzir posteriormente:

* pontuação por rodada;
* pontuação acumulada;
* desempenho por tema;
* desempenho por categoria;
* quantidade de respostas válidas;
* quantidade de respostas inválidas;
* quantidade de eliminações;
* quantidade de STOPs;
* taxa de preenchimento;
* tempo médio até STOP.

Esses dados podem posteriormente ser usados pelo professor para identificar conteúdos que precisam de revisão.

---

# 44. Persistência e histórico

As partidas finalizadas não devem ser apagadas automaticamente.

Deve ser possível consultar:

```text
Partida
 ├── Rodada 1
 ├── Rodada 2
 ├── Rodada 3
 └── Rodada 4
```

Cada rodada deve preservar:

* letra;
* categorias;
* respostas;
* correções;
* pontuação;
* timestamps;
* jogadores;
* eliminações.

Isso permite auditoria e análise posterior.

---

# 45. Tratamento de desconexão

Se um aluno perder a conexão:

```text
disconnect
```

o servidor deve registrar o evento.

O aluno não deve ser automaticamente eliminado apenas por uma desconexão momentânea, salvo se essa for uma regra explicitamente configurada.

Ao reconectar, o servidor deve verificar:

* sala;
* rodada;
* sessão;
* status;
* elegibilidade.

Se a rodada ainda estiver ativa e a sessão puder ser restaurada, o aluno retorna ao estado anterior.

Se a rodada já terminou, ele não poderá modificar respostas.

---

# 46. Reentrada

A sessão do aluno deve possuir um identificador temporário.

Não confiar apenas na matrícula.

Exemplo:

```text
playerSessionId
```

Esse identificador pode ser armazenado em:

```text
sessionStorage
```

ou cookie apropriado.

O servidor continua sendo a autoridade.

---

# 47. Estado após STOP

Depois do primeiro STOP válido:

```text
TODOS OS CAMPOS → READ ONLY
```

No frontend:

```text
disabled = true
```

No backend:

qualquer tentativa posterior de alteração deve ser rejeitada.

Isso é obrigatório porque um aluno poderia manipular o frontend.

---

# 48. Tratamento de respostas

As respostas podem ser enviadas incrementalmente ao servidor para permitir recuperação após uma falha de conexão.

Por exemplo:

```text
Aluno preenche Hook
       ↓
React
       ↓
Socket.IO
       ↓
Servidor
       ↓
MySQL
```

Entretanto, a resposta deve continuar disponível localmente enquanto o usuário digita.

Não exigir uma requisição HTTP a cada caractere.

Preferencialmente sincronizar:

* ao sair do campo;
* após debounce;
* ao trocar de categoria;
* ou em intervalos curtos.

---

# 49. Performance

A aplicação deve suportar inicialmente pelo menos:

```text
1 professor
1 tela pública
50–100 alunos simultâneos
```

com margem razoável em rede local.

A comunicação de eventos deve ser pequena.

Não transmitir constantemente todas as respostas de todos os alunos para todos os clientes.

Cada cliente deve receber apenas as informações necessárias.

---

# 50. Estrutura sugerida do projeto

```text
stop-game/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── sockets/
│   │   ├── middleware/
│   │   ├── validators/
│   │   ├── game/
│   │   └── server.js
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── socket/
│   │   ├── state/
│   │   ├── styles/
│   │   └── App.jsx
│   │
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

# 51. Componentes React sugeridos

## Aluno

```text
StudentGamePage
├── GameHeader
│   ├── LetterDisplay
│   ├── CountdownTimer
│   └── ProgressIndicator
│
├── CategoryList
│   └── CategoryCard
│
├── AnswerEditor
│
└── StopButton
```

## Professor

```text
TeacherDashboard
├── RoomControl
├── RoundControl
├── PlayerMonitor
├── CorrectionPanel
├── RankingPanel
└── StatisticsPanel
```

## Tela pública

```text
PublicGameScreen
├── GameTitle
├── ThemeDisplay
├── LetterAnimation
├── Countdown
├── PlayerCount
├── GameStatus
└── Ranking
```

---

# 52. Gerenciamento de estado no React

O frontend deve possuir estado explícito para:

```text
room
student
game
round
categories
answers
timer
connection
elimination
ranking
```

Pode utilizar Context API inicialmente.

Caso a complexidade aumente, utilizar Zustand ou Redux Toolkit.

Não é necessário introduzir Redux prematuramente.

---

# 53. Contratos de eventos

Os eventos Socket.IO devem possuir payloads tipados e validados.

Exemplo conceitual:

```javascript
socket.emit("requestStop", {
  roundId
});
```

Servidor:

```javascript
socket.on("requestStop", async ({ roundId }) => {
  // validar sessão
  // validar rodada
  // validar respostas
  // registrar primeiro STOP
});
```

Não confiar em dados enviados pelo cliente.

---

# 54. Exemplo mínimo de servidor Express

```javascript
import express from "express";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("STOP server running on port 3000");
});
```

---

# 55. Exemplo mínimo de Socket.IO

```javascript
import { Server } from "socket.io";

const io = new Server(httpServer, {
  cors: {
    origin: true,
  },
});

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomCode }) => {
    socket.join(roomCode);
  });
});
```

A implementação final deve adicionar autenticação, validação e autorização.

---

# 56. Exemplo mínimo de React

```jsx
function StopButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      STOP
    </button>
  );
}
```

O frontend deve controlar a apresentação, mas a regra final de elegibilidade deve existir no servidor.

---

# 57. Exemplo mínimo de normalização

```javascript
function normalizeAnswer(value) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
```

A implementação final deve ser testada especificamente com Unicode e caracteres portugueses.

---

# 58. Variáveis de ambiente

Exemplo:

```text
PORT=3000

DATABASE_URL=mysql://user:password@mysql:3306/stop

SESSION_SECRET=change-me

NODE_ENV=development
```

Nunca versionar credenciais reais.

Fornecer:

```text
.env.example
```

sem segredos.

---

# 59. Docker

Fornecer inicialmente:

```text
docker-compose.yml
```

com:

```text
mysql
backend
frontend
```

Durante desenvolvimento, entretanto, frontend e backend podem ser executados separadamente.

---

# 60. Testes

Implementar testes em três níveis.

## Unitários

Testar:

* normalização;
* validação de letra;
* pontuação;
* estados da rodada;
* sorteio;
* eliminação;
* regras de STOP.

## Integração

Testar:

* Express + MySQL;
* criação de sala;
* identificação por matrícula;
* criação de rodada;
* envio de respostas;
* STOP;
* correção.

## End-to-end

Simular:

```text
Professor cria sala
       ↓
Aluno A entra
Aluno B entra
Aluno C entra
       ↓
Professor inicia rodada
       ↓
Todos recebem letra
       ↓
Alunos preenchem respostas
       ↓
Aluno A pressiona STOP
       ↓
Rodada encerra
       ↓
Professor corrige
       ↓
Ranking aparece
       ↓
Próxima rodada
```

Também testar:

```text
Aluno sai do fullscreen
```

e verificar:

```text
ELIMINATED
```

---

# 61. Testes críticos

Os seguintes testes são obrigatórios.

### STOP sem completar respostas

Resultado:

```text
STOP rejeitado
```

### Dois STOP simultâneos

Resultado:

```text
somente um vencedor
```

### Resposta após STOP

Resultado:

```text
rejeitada
```

### STOP após timeout

Resultado:

```text
rejeitado
```

### Aluno eliminado tentando responder

Resultado:

```text
rejeitado
```

### Aluno eliminado tentando STOP

Resultado:

```text
rejeitado
```

### Saída do fullscreen

Resultado:

```text
ELIMINATED
```

### Matrícula inexistente

Resultado:

```text
acesso negado
```

### Matrícula válida

Resultado:

```text
nome exibido para confirmação
```

---

# 62. Critérios de aceitação

A primeira versão será considerada funcional quando:

* [ ] professor consegue criar uma sala;
* [ ] sistema gera QR Code da sala;
* [ ] aluno consegue acessar pelo celular;
* [ ] aluno informa matrícula;
* [ ] sistema valida matrícula no MySQL;
* [ ] nome correspondente é exibido;
* [ ] aluno confirma identidade;
* [ ] professor consegue visualizar alunos conectados;
* [ ] professor consegue selecionar um conjunto de categorias;
* [ ] sistema sorteia uma letra;
* [ ] letra aparece em todos os clientes;
* [ ] professor consegue iniciar a rodada;
* [ ] cronômetro funciona sincronizado;
* [ ] aluno consegue preencher todas as categorias;
* [ ] aluno pode navegar livremente entre categorias;
* [ ] STOP permanece desabilitado enquanto houver campos vazios;
* [ ] STOP habilita após completar todas as categorias;
* [ ] primeiro STOP válido encerra a rodada;
* [ ] respostas são bloqueadas;
* [ ] professor consegue corrigir respostas;
* [ ] pontuação 10/5/0 funciona;
* [ ] ranking é calculado pelo servidor;
* [ ] ranking aparece na tela pública;
* [ ] saída do fullscreen elimina o aluno;
* [ ] aluno eliminado não pode voltar à rodada;
* [ ] aluno eliminado pode participar da próxima rodada;
* [ ] timeout encerra automaticamente a rodada;
* [ ] histórico das rodadas é preservado;
* [ ] aplicação funciona para múltiplos alunos simultaneamente.

---

# 63. Prioridade de implementação

Implementar em fases.

## Fase 1 — infraestrutura

* Node.js
* Express
* MySQL
* Prisma
* React
* Socket.IO
* Docker
* estrutura inicial

## Fase 2 — alunos e salas

* cadastro de alunos;
* turmas;
* criação de sala;
* QR Code;
* identificação por matrícula.

## Fase 3 — jogo

* categorias;
* rodada;
* letra;
* cronômetro;
* respostas;
* STOP.

## Fase 4 — competição

* correção;
* pontuação;
* ranking;
* tela pública.

## Fase 5 — controle de integridade

* fullscreen;
* eliminação;
* reconexão;
* validação server-side;
* concorrência.

## Fase 6 — UX

* animações;
* sons;
* responsividade;
* acessibilidade;
* refinamento visual.

## Fase 7 — análise

* histórico;
* estatísticas;
* desempenho por categoria;
* desempenho por aluno.

---

# 64. Princípio arquitetural fundamental

A implementação deve seguir uma regra central:

> **O frontend apresenta o estado; o servidor decide o estado.**

Consequentemente:

* o cliente não decide quem venceu;
* o cliente não decide quando a rodada terminou;
* o cliente não decide a pontuação;
* o cliente não decide quem foi eliminado;
* o cliente não decide a letra oficial;
* o cliente não decide se STOP foi o primeiro;
* o cliente não decide se uma resposta foi aceita.

O React deve ser responsável principalmente por:

```text
renderização
interação
UX
animação
estado visual
```

O backend deve ser responsável por:

```text
regras de negócio
estado da partida
persistência
concorrência
autorização
pontuação
integridade
```

---

# 65. Resultado esperado

O produto final deve funcionar como uma plataforma de competição educacional em tempo real, preservando a mecânica essencial do Stop, mas adaptada ao ensino de React Native.

A experiência ideal é:

```text
PROFESSOR
    │
    ├── cria partida
    ├── exibe QR Code
    │
    ▼
ALUNOS
    │
    ├── escaneiam QR
    ├── informam matrícula
    ├── confirmam identidade
    │
    ▼
SALA
    │
    ├── professor sorteia letra
    ├── categorias aparecem
    ├── cronômetro começa
    │
    ▼
COMPETIÇÃO
    │
    ├── alunos preenchem
    ├── navegam entre categorias
    ├── primeiro STOP encerra
    │
    ▼
CORREÇÃO
    │
    ├── professor valida respostas
    ├── servidor calcula pontos
    │
    ▼
RANKING
    │
    ├── pontuação atualizada
    ├── tela pública atualizada
    │
    ▼
PRÓXIMA RODADA
```

A implementação deve priorizar **determinismo, baixa latência, tolerância a desconexões, integridade das regras e simplicidade da interface do aluno**. A aplicação não deve depender de funcionalidades impossíveis de garantir pelo navegador; especificamente, fullscreen deve ser tratado como uma condição detectável e não como uma capacidade de bloqueio absoluto do dispositivo.
