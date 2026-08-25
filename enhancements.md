# STOP — Prompt de implementação incremental

## Contexto

Você está trabalhando em uma aplicação web multiplayer educacional chamada **STOP**, inspirada no jogo brasileiro de Stop e destinada à revisão competitiva de conceitos de React Native.

A aplicação utiliza:

* **Backend:** Node.js + Express
* **Frontend:** React
* **Banco:** MySQL
* **ORM:** Prisma
* **Comunicação em tempo real:** Socket.IO

### IMPORTANTE

**Grande parte da aplicação já está implementada.**

Não reescreva o sistema do zero.

Antes de modificar qualquer código:

1. inspecione integralmente a estrutura atual do projeto;
2. identifique as funcionalidades já implementadas;
3. identifique os modelos Prisma existentes;
4. identifique os eventos Socket.IO existentes;
5. identifique as rotas REST existentes;
6. identifique os estados atuais de jogo/rodada;
7. identifique os componentes React existentes;
8. identifique como o sistema atual trata autenticação, salas, jogadores, respostas, rodadas e pontuação;
9. preserve as funcionalidades existentes que já atendem aos requisitos;
10. faça alterações incrementais e compatíveis com a arquitetura atual.

**Não substitua uma implementação existente por outra equivalente sem necessidade.**

O objetivo é **evoluir o sistema atual**, não reconstruí-lo.

---

## Estado atual verificado (leia antes de implementar)

Esta seção substitui a necessidade de redescobrir o que já existe: cada
item abaixo foi conferido diretamente no código-fonte, não presumido.
Onde uma seção mais adiante neste documento pedir para "implementar" algo
listado aqui como já existente, a instrução correta é **reutilizar**, não
recriar.

**Máquina de estados da rodada** (`backend/prisma/schema.prisma`,
`RoundStatus`) já existe e tem exatamente estes valores:

```text
CREATED → READY → STARTING → PLAYING → STOPPED → CORRECTION → SCORED → FINISHED
```

Não existe campo `letterRevealed` nem qualquer estado `LETTER_SELECTED` /
`LETTER_DRAMA` / `LETTER_REVEALED` — os nomes sugeridos na Seção 5 são
apenas ilustrativos e **não devem ser criados como estados paralelos**.
Ver a proposta concreta de mapeamento na Seção 5.

**Animação dramática da letra já existe** (`frontend/src/components/public/LetterAnimation.jsx`):
a tela pública já faz o efeito "caça-níquel" — letras aleatórias
acelerando/desacelerando, luz de destaque, confete e som ao finalizar.
**O que falta não é a animação, é a sincronização**: hoje o aluno vê a
letra assim que `round.status !== "CREATED"` (`frontend/src/components/student/LetterDisplay.jsx:3`),
ou seja, no mesmo instante em que a letra é sorteada — antes mesmo da
animação pública começar a girar. A Seção 4 deve ser lida como "adicionar
o portão de sincronização que falta", não "criar a animação".

**Não existe botão "Pronto" bloqueando o início da rodada.** O botão em
`frontend/src/pages/StudentGamePage.jsx:344-357` ("Entrar na partida" /
"Pronto!") é uma ação única de entrada em fullscreen + identificação;
seu rótulo muda de texto após o clique, mas ele não bloqueia nem
condiciona o início da rodada — isso é decidido inteiramente pelo
professor. A Seção 3 deve ser lida como "confirmar que nenhum portão de
confirmação seja introduzido ao longo desta implementação", não "remover
um botão bloqueante existente".

**Normalização de resposta já existe** (`backend/src/game/normalize.js`,
`normalizeAnswer`) e é mais robusta que o exemplo da Seção 19 (NFD → NFC,
`toLocaleLowerCase("pt-BR")`, colapso de espaços). **Reutilizar
diretamente — não reimplementar.** Apenas o agrupamento por distância de
string (parte final da Seção 19) é trabalho novo.

**Sugestão automática de correção já existe, parcialmente**
(`backend/src/game/scoring.js`, `suggestReviewState` + `REVIEW_STATE`):
hoje pré-marca `BLANK` (vazio) e `INVALID` (não começa com a letra) por
regra mecânica. Não existe ainda a classificação `KNOWN_VALID` / `UNKNOWN`
por banco de respostas conhecidas que a Seção 22 propõe — isso é
trabalho novo, mas deve **estender** `suggestReviewState`, não criar um
mecanismo paralelo.

**Agrupamento de respostas na correção do professor não existe ainda.**
`roundService.correctionGrid` (linha ~695) já calcula duplicatas — há um
`Map` chaveado por `` `${roundCategoryId}::${normalizedValue}` `` em
`roundService.js:708-712` — mas o retorno continua **por aluno**, com uma
flag `duplicated` booleana por resposta, não uma linha por resposta
distinta com contagem. As Seções 17, 20 e 21 (agrupar por resposta,
ordenar por frequência) são trabalho novo, mas devem reaproveitar essa
mesma chave de agrupamento em vez de recalculá-la.

**Não existe uma entidade `TeacherDecision` a criar.** A decisão oficial
do professor já é o par `Answer.reviewState` + `Answer.isValid` — campos
que já existem, já são a autoridade usada por `scoreAnswers`
(`backend/src/game/scoring.js`) e já são propagados via
`answerService.review`/`reviewMany` (correção manual, spec 18). A única
entidade genuinamente nova é `AnswerReview` (avaliação de colega). Ver
correção na Seção 47.

**Sincronização de relógio já existe** (`serverTime` em cada payload de
estado + hook `useServerClock`/`useCountdown` no frontend, spec 33/45).
Reutilizar para os timestamps das Seções 7 e 54 — não criar um segundo
mecanismo de sincronização.

**Trava por rodada já existe** (`backend/src/lib/asyncLock.js`,
`gameLock.run(`round:${roundId}`, ...)`), usada hoje por
`requestStop`/`forceStop`/`handleTimeout`/`submit` para serializar
seções críticas da rodada. A idempotência do fechamento da correção
(Seção 34) e a resolução de concorrência (Seção 43) devem reutilizar essa
mesma trava e o mesmo padrão de "recheque de estado dentro da seção
crítica" — não inventar um mecanismo de lock separado.

**Eventos Socket.IO já registrados** (nomes reais, não ilustrativos —
`backend/src/sockets/handlers.js` e `frontend/src/hooks/useRoomSocket.js`):

```text
cliente → servidor:  joinRoom, identifyStudent, ready, submitAnswer,
                     updateAnswer, requestStop, fullscreenExited,
                     telemetry, requestState
servidor → clientes: roomState, playerJoined, playerLeft, roundCreated,
                     letterSelected, roundStarted, answerUpdated,
                     playerProgress, playerEliminated, roundStopped,
                     roundTimedOut, correctionStarted, answerReviewed,
                     answersReviewed, scoreUpdated, rankingUpdated,
                     roundFinished, roundCancelled, nextRound,
                     roomStatusChanged
```

`correctionStarted`/`answerReviewed`/`answersReviewed` já existem para a
correção **do professor**. Os novos eventos da Seção 44
(`collaborativeCorrectionStarted`, `reviewAssigned`, etc.) precisam de
nomes que não colidam nem sejam confundidos com esses — ver nota
corrigida na Seção 44.

---

# 1. Objetivo desta alteração

Implementar e integrar as seguintes mudanças:

1. garantir que nenhum passo de confirmação equivalente a **"Pronto"** seja exigido do aluno antes de uma fase começar (já não existe hoje — ver "Estado atual verificado" — este item é preventivo para o restante da implementação);
2. fazer a letra da rodada aparecer na tela do aluno somente depois da animação/drama da letra na tela pública (a animação já existe; falta o portão de sincronização);
3. implementar **correção colaborativa entre alunos**;
4. manter a **correção oficial do professor**;
5. comparar as correções dos alunos com a correção oficial do professor;
6. conceder **pontos bônus aos alunos cuja correção coincidir com a decisão oficial do professor**;
7. tornar a correção de aproximadamente 40 alunos rápida, agregada e competitiva;
8. preservar a correção manual do professor como autoridade final;
9. evitar que a correção colaborativa revele ao aluno qual resposta pertence a qual colega;
10. manter o servidor como autoridade sobre estado, pontuação, ordem dos eventos e regras.

---

# 2. Princípio fundamental

A correção deve passar a ter três perspectivas:

```text
                    RODADA ENCERRADA
                           │
             ┌─────────────┴─────────────┐
             │                           │
             ▼                           ▼
      CORREÇÃO ALUNOS              CORREÇÃO PROFESSOR
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    DECISÃO OFICIAL
                           │
                           ▼
                    PONTUAÇÃO FINAL
```

A correção dos alunos **não substitui** a correção do professor.

O professor continua sendo a autoridade final.

A correção dos alunos serve simultaneamente para:

* tornar o jogo mais participativo;
* reduzir a carga cognitiva do professor;
* criar uma nova competição;
* gerar pontos bônus;
* permitir que os alunos analisem respostas dos colegas.

---

# 3. Nenhum portão de confirmação antes da rodada

**Já verificado (ver "Estado atual verificado"): não existe hoje um botão
que bloqueie o início da rodada.** O botão "Entrar na partida" / "Pronto!"
em `StudentGamePage.jsx` é a ação única de entrar em fullscreen — seu
rótulo muda de texto após o clique, mas ele não é uma confirmação de
prontidão que o servidor aguarda antes de iniciar.

O requisito desta seção é, portanto, preventivo: ao longo desta
implementação (em especial ao adicionar a fase de correção colaborativa),
**não introduzir** um botão ou passo equivalente a:

```text
[ PRONTO ]
```

ou

```text
[ ESTOU PRONTO ]
```

que exija confirmação explícita do aluno antes de uma fase começar para
ele. O aluno não deve precisar executar nenhuma ação adicional antes da rodada.

O fluxo deve ser:

```text
Aluno entra
    ↓
Identificação
    ↓
Aguarda rodada
    ↓
Professor inicia
    ↓
Drama da letra na tela pública
    ↓
Letra aparece na tela do aluno
    ↓
Aluno começa a responder
```

Não criar um novo botão para substituir o botão "Pronto".

---

# 4. Sincronização da letra

**Já verificado: a apresentação dramática já existe**
(`frontend/src/components/public/LetterAnimation.jsx` — giro acelerado,
desaceleração, brilho, confete e som ao revelar). O que falta é apenas o
portão de sincronização: a letra sorteada não deve aparecer imediatamente
na interface do aluno (hoje aparece, ver "Estado atual verificado"). A
tela pública já realiza a apresentação dramática da letra; falta o
servidor impedir que o aluno veja a letra antes dessa apresentação
terminar.

Exemplo:

```text
TELA PÚBLICA

      PREPARE-SE

          ↓

      categoria...

          ↓

      3
      2
      1

          ↓

      A
      B
      C
      D
      ...

          ↓

      R!
```

Somente depois que a animação pública terminar o servidor deverá sinalizar aos clientes dos alunos que a letra pode ser exibida.

---

# 5. Estado de revelação da letra

Não confundir:

```text
letra sorteada
```

com:

```text
letra revelada
```

A letra pode existir no estado da rodada antes de estar visível para os alunos.

**A máquina de estados existente já cobre essa distinção sem precisar de
estados novos nem de um campo `letterRevealed`** (ver "Estado atual
verificado" para a lista completa de `RoundStatus`). Mapeamento proposto,
reaproveitando os estados já existentes:

```text
READY     → letra já sorteada e persistida (round.letter definido),
            mas oculta do aluno: a tela pública está tocando a animação
            (LetterAnimation.jsx). Corresponde a "LETTER_SELECTED" +
            "LETTER_DRAMA" da ideia original, sem precisar de dois
            estados distintos — a UI pública já sabe que está em drama
            simplesmente por estar animando.
STARTING  → animação pública concluída; servidor emite o evento de
            revelação (ver Seção 6); a partir daqui o aluno pode ver a
            letra. Corresponde a "LETTER_REVEALED".
PLAYING   → cronômetro rodando, respostas aceitas — inalterado.
```

Não criar `LETTER_SELECTED` / `LETTER_DRAMA` / `LETTER_REVEALED` como
estados de `RoundStatus`: a distinção "sorteada mas oculta" vs "revelada"
já é exatamente a diferença entre `READY` e `STARTING`, e o gate de
visibilidade do aluno (`LetterDisplay.jsx`) já lê `status` — só precisa
passar a esperar `STARTING` (ou um evento de revelação explícito, Seção 6)
em vez de qualquer status `!== "CREATED"`.

---

# 6. Fluxo correto da revelação

Fluxo (usando os estados reais mapeados na Seção 5):

```text
Professor
   │
   │ inicia rodada
   ▼
Servidor
   │
   ├── sorteia/persiste letra, status = READY
   │
   └── emite "letterSelected" (evento já existente — reaproveitar)
             │
             ▼
       Tela pública
             │
             │ toca LetterAnimation.jsx (já existente)
             │
             ▼
       animação termina (evento do cliente ou timer server-side —
       decisão de implementação, ver nota abaixo)
             │
             ▼
       status = STARTING + evento de revelação
             │
       ┌─────┴──────┐
       ▼            ▼
Tela pública     Alunos
já mostrava a    LetterDisplay.jsx passa a
letra (é quem    mostrar a letra somente
gira/revela)     agora
       │            │
       └──────┬─────┘
              ▼
          PLAYING
```

Nota de implementação: a duração da animação (`LetterAnimation.jsx` já
usa uma sequência de `TICKS=22` giros com atraso crescente, em torno de
2-3s) pode ser tratada como uma constante conhecida por ambos os lados
(servidor aguarda X ms antes de liberar `STARTING`) em vez de depender de
um evento "terminei a animação" vindo do cliente da tela pública — mais
simples e evita um ponto de falha se a tela pública cair no meio da
animação. Ver também a nota de timeout da Seção 54, que já resolve esse
mesmo problema de forma mais geral para a contagem regressiva.

A fonte oficial da transição deve continuar sendo o servidor.

Não utilizar somente um `setTimeout()` independente em cada cliente para decidir quando a rodada começou.

---

# 7. Sincronização temporal

Para evitar diferenças significativas entre dispositivos:

* o servidor deve fornecer timestamps;
* os clientes devem calcular o tempo restante com base no relógio oficial;
* eventos Socket.IO devem carregar informações suficientes para sincronização;
* a tela pública deve ser considerada a referência visual da partida.

A animação pode ser executada no frontend, mas a transição para `PLAYING` deve ser determinada pelo servidor.

---

# 8. Nova fase: correção colaborativa

Depois que a rodada terminar:

```text
STOP
   ↓
respostas bloqueadas
   ↓
fase de correção colaborativa
   ↓
correção dos alunos
   ↓
correção oficial do professor
   ↓
pontuação
   ↓
ranking
```

A correção colaborativa deve acontecer **antes da revelação da pontuação final da rodada**.

---

# 9. Princípio da correção colaborativa

Cada aluno deverá corrigir respostas de outros alunos.

**Nunca deve corrigir as próprias respostas.**

O sistema deve distribuir respostas entre os participantes.

Exemplo:

```text
Aluno A → corrige respostas do aluno B
Aluno B → corrige respostas do aluno C
Aluno C → corrige respostas do aluno D
...
Aluno N → corrige respostas do aluno A
```

Para evitar favorecimento ou previsibilidade, o algoritmo de distribuição deve ser determinado pelo servidor.

---

# 10. Não revelar identidade

Na interface de correção do aluno, não exibir:

* nome do autor;
* matrícula;
* foto;
* identificador;
* qualquer informação que permita deduzir facilmente quem respondeu.

Em vez disso:

```text
Resposta #17
```

ou:

```text
Resposta de um colega
```

Exemplo:

```text
CATEGORIA: HOOK
LETRA: S

Resposta:

useState

[ ✓ VÁLIDA ]
[ ✗ INVÁLIDA ]
```

O aluno deve avaliar somente a resposta.

---

# 11. Não permitir autocorreção

O servidor deve garantir que:

```text
grader.studentId !== answer.studentId
```

Se por algum erro de distribuição isso ocorrer, o servidor deve rejeitar a atribuição.

Nunca confiar somente no frontend.

---

# 12. Quantidade de respostas atribuídas

Não é necessário que cada aluno corrija todas as respostas da turma.

Isso seria inviável.

O sistema deve distribuir um subconjunto de respostas para cada aluno.

A quantidade deve ser configurável.

Exemplo:

```text
5 respostas por aluno
```

ou:

```text
10 respostas por aluno
```

Valor padrão sugerido:

```text
8 respostas
```

O administrador/professor poderá futuramente alterar esse valor.

---

# 13. Distribuição equilibrada

O algoritmo deve buscar distribuir as respostas de forma aproximadamente uniforme.

Exemplo com 40 alunos:

```text
40 alunos
8 avaliações por aluno
= 320 avaliações
```

As respostas devem ser distribuídas de modo que nenhuma resposta receba quantidade excessivamente diferente de avaliações, dentro do possível.

Não é necessário garantir perfeitamente a mesma quantidade em todos os casos, mas a distribuição deve ser equilibrada.

---

# 14. Evitar correções duplicadas

Evitar atribuir a mesma combinação:

```text
grader + answer
```

mais de uma vez.

Criar uma restrição lógica ou única equivalente:

```text
(roundId, graderStudentId, answerId)
```

deve ser único.

---

# 15. Modelo de correção

Criar ou adaptar uma entidade equivalente a:

```text
AnswerReview
```

Campos conceituais:

```text
id
roundId
answerId
graderStudentId
decision
createdAt
updatedAt
```

Onde:

```text
decision = VALID | INVALID
```

Caso o sistema já possua um modelo de avaliação, reutilizá-lo.

---

# 16. Não revelar a decisão oficial

Durante a correção colaborativa, o aluno não deve saber:

* qual decisão o professor dará;
* qual é a resposta considerada correta;
* quantos alunos concordaram;
* se sua decisão coincide com a decisão oficial.

Essas informações somente poderão ser reveladas após o fechamento da correção.

---

# 17. Correção agregada do professor

**Já existe uma base parcial para isso:** `roundService.correctionGrid`
já calcula, para detectar duplicatas, um `Map` chaveado por
`` `${roundCategoryId}::${normalizedValue}` `` (`roundService.js:708-712`).
O que falta é transformar isso de uma flag booleana por resposta em uma
estrutura agrupada — uma linha por chave distinta, com a lista de
`answerId`s que caem nela e a contagem. Reaproveitar exatamente essa
mesma chave de agrupamento (e a normalização da Seção 19) em vez de
recalculá-la do zero.

A correção do professor deve ser otimizada para grandes turmas.

Em vez de apresentar:

```text
40 alunos × 8 categorias
```

como 320 itens independentes, agrupar respostas iguais.

Exemplo:

```text
HOOK — letra U

useState
17 alunos

useEffect
11 alunos

useMemo
6 alunos

useReducer
4 alunos
```

O professor corrige cada **resposta distinta** uma única vez.

---

# 18. Propagação da decisão

Se o professor marcar:

```text
useState → VÁLIDA
```

todos os alunos que responderam `useState` nessa categoria deverão receber a decisão:

```text
isValid = true
```

Se marcar:

```text
banana → INVÁLIDA
```

todos os alunos com essa resposta deverão receber:

```text
isValid = false
```

A propagação deve ser feita pelo backend.

---

# 19. Normalização

**Já existe e deve ser reutilizada sem alterações:**
`normalizeAnswer` em `backend/src/game/normalize.js` — NFD → remove
diacríticos → NFC → `toLocaleLowerCase("pt-BR")` → colapsa espaços →
trim. Mais robusto que qualquer reimplementação simples (trata Unicode
corretamente), já é a fonte de `Answer.normalizedValue`, e já é usado
por `scoreAnswers`/`correctionGrid`/`suggestReviewState`. **Não
reimplementar.**

A resposta original (`Answer.value`) já é preservada separadamente do
valor normalizado — nenhuma mudança necessária aqui.

Exemplo:

```text
Original:
"  UseState "

Normalizada:
"usestate"
```

Respostas com a mesma representação normalizada **já são agrupadas** por
igualdade exata (é a base de `Answer.normalizedValue` e da detecção de
duplicata em `scoreAnswers`/`correctionGrid`). O trabalho genuinamente
novo desta seção é ir além da igualdade exata: agrupar por
**proximidade**, para que erros de digitação (`"useStat"`, `"usestte"`)
caiam no mesmo grupo de `"usestate"` na correção agregada do professor
(Seções 17/20/21).

Recomendação concreta, alinhada ao princípio da Seção 53 (evitar
complexidade desnecessária): como as respostas são palavras curtas de um
único token, uma distância de edição clássica (Levenshtein ou
Damerau-Levenshtein) sobre o valor já normalizado, com um limiar pequeno
e proporcional ao tamanho da palavra (ex.: distância ≤ 1 para palavras de
até 5 caracteres, ≤ 2 para palavras maiores), é suficiente e barata de
calcular para o volume desta aplicação (algumas dezenas de respostas por
categoria). Não introduzir uma dependência de ML/embeddings para isso —
seria desproporcional ao problema e conflita com a Seção 53.

---

# 20. Correção por categoria

A interface do professor deve permitir selecionar uma categoria.

Exemplo:

```text
CORREÇÃO

[ COMPONENTE ] [ HOOK ] [ EVENTO ] [ PROP ]

HOOK
Letra: U
```

Abaixo:

```text
useState       17 alunos     [✓] [✗]
useEffect      11 alunos     [✓] [✗]
useMemo          6 alunos     [✓] [✗]
useReducer       4 alunos     [✓] [✗]
```

O professor deve conseguir avançar rapidamente entre categorias.

---

# 21. Ordenação das respostas

Ordenar respostas preferencialmente por:

1. quantidade de ocorrências, decrescente;
2. depois ordem alfabética.

Assim, respostas dadas por muitos alunos aparecem primeiro.

Isso permite ao professor resolver rapidamente a maior parte da turma.

---

# 22. Sugestão automática

**Já existe, parcialmente:** `suggestReviewState` em
`backend/src/game/scoring.js` já pré-classifica `BLANK` (resposta vazia)
e `INVALID` (não começa com a letra sorteada) por regra puramente
mecânica, sem qualquer banco de respostas. `KNOWN_VALID` / `UNKNOWN` /
`KNOWN_INVALID` a partir de um histórico de respostas já aprovadas pelo
professor em rodadas anteriores é trabalho novo — deve **estender**
`suggestReviewState` (mesma função, mais um branch de classificação),
não criar um mecanismo de sugestão paralelo.

Mas isso é apenas uma sugestão.

O professor sempre poderá alterar a decisão.

Não introduzir dependência obrigatória de IA para essa funcionalidade — a
combinação de normalização exata + distância de string (Seção 19) +
histórico de decisões já é suficiente para a maioria dos casos.

---

# 23. Correção colaborativa — interface

A interface do aluno deve ser extremamente simples.

Exemplo:

```text
CORRIJA UM COLEGA

Categoria:
HOOK

Letra:
U

Resposta:
useState

Você considera essa resposta:

[ ✓ VÁLIDA ]

[ ✗ INVÁLIDA ]

Progresso:
5 / 8
```

Depois da decisão:

```text
Resposta registrada.

Próxima →
```

Não mostrar o resultado imediatamente.

---

# 24. Não utilizar "Próxima" obrigatoriamente

Se possível, após a decisão:

```text
[ ✓ VÁLIDA ]
```

o sistema deve avançar automaticamente para a próxima resposta após uma pequena transição.

O objetivo é minimizar cliques.

Se a implementação atual necessitar de confirmação, manter apenas se houver justificativa de UX.

---

# 25. Correção simultânea

Todos os alunos entram na fase de correção colaborativa simultaneamente.

O servidor deve controlar:

```text
COLLABORATIVE_CORRECTION
```

e posteriormente:

```text
TEACHER_CORRECTION
```

Um aluno não deve conseguir acessar a fase de professor.

---

# 26. Professor como autoridade final

A decisão final de cada resposta é:

```text
teacherDecision
```

Não:

```text
studentMajorityDecision
```

e não:

```text
firstStudentDecision
```

A decisão dos alunos serve para determinar bônus de participação/precisão.

---

# 27. Bônus por concordância

Depois que o professor finalizar a correção, comparar:

```text
decisão do aluno
```

com:

```text
decisão oficial do professor
```

Se forem iguais:

```text
studentDecision === teacherDecision
```

o aluno recebe pontos bônus.

---

# 28. Pontuação do bônus

Criar uma constante configurável:

```text
COLLABORATIVE_REVIEW_BONUS = 2
```

Por padrão:

```text
+2 pontos
```

por decisão que coincidir com a decisão oficial do professor.

Exemplo:

Aluno João corrigiu 8 respostas.

```text
6 coincidiram
2 divergiram
```

Bônus:

```text
6 × 2 = +12
```

O bônus deve ser calculado no servidor.

Não permitir que o cliente envie diretamente:

```text
bonus = 12
```

---

# 29. O bônus não depende de o aluno ter respondido corretamente

O bônus é referente à **qualidade da correção colaborativa**, não à resposta que o próprio aluno forneceu.

Portanto, são conceitos independentes:

```text
Pontuação pelas respostas do aluno
+
Bônus pela qualidade da correção
=
Pontuação da rodada
```

---

# 30. Exemplo completo

Aluno A respondeu:

```text
HOOK → useState
```

Aluno B recebeu essa resposta para corrigir.

Aluno B marca:

```text
VÁLIDA
```

Professor posteriormente marca:

```text
VÁLIDA
```

Resultado:

```text
Aluno B: +2 bônus
Aluno A: pontuação normal da resposta
```

Se B tivesse marcado:

```text
INVÁLIDA
```

e o professor:

```text
VÁLIDA
```

resultado:

```text
Aluno B: +0 bônus
```

---

# 31. Exibição do bônus

Após a correção oficial, apresentar:

```text
CORREÇÃO COLABORATIVA

João
8 avaliações
7 coincidentes
+14 bônus

Maria
8 avaliações
6 coincidentes
+12 bônus
```

Não mostrar isso antes do professor concluir a correção.

---

# 32. Resultado final

A tela pública pode apresentar:

```text
RESULTADO DA RODADA

🥇 João
82 pontos
+14 bônus

🥈 Maria
76 pontos
+12 bônus

🥉 Pedro
71 pontos
+10 bônus
```

O bônus deve ser explicitamente identificado.

---

# 33. Pontuação e transações

O cálculo final da pontuação deve ocorrer em uma operação transacional.

A sequência lógica:

```text
1. finalizar correções do professor
2. obter decisões oficiais
3. comparar avaliações dos alunos
4. calcular bônus
5. calcular pontuação das respostas
6. atualizar Score
7. persistir resultado
8. emitir ranking
```

Se uma etapa falhar, evitar deixar o jogo em estado parcialmente pontuado.

---

# 34. Idempotência

O fechamento da correção deve ser idempotente.

Se o professor clicar duas vezes em:

```text
FINALIZAR CORREÇÃO
```

não devem ser concedidos bônus duas vezes.

O servidor deve verificar se a rodada já foi pontuada.

---

# 35. Estados adicionais

Se o sistema já possui uma máquina de estados, adaptá-la.

Conceitualmente:

```text
PLAYING
   ↓
STOPPED
   ↓
COLLABORATIVE_CORRECTION
   ↓
TEACHER_CORRECTION
   ↓
SCORED
   ↓
FINISHED
```

Não criar estados paralelos conflitantes.

---

# 36. Tela pública durante correção

Durante a correção colaborativa, a TV pode mostrar:

```text
CORREÇÃO

Os jogadores estão corrigindo
as respostas dos colegas.

██████████████░░░░░░

32 / 40 jogadores concluíram
```

Não mostrar respostas individuais.

Depois:

```text
CORREÇÃO DO PROFESSOR
```

e, posteriormente:

```text
RESULTADO
```

---

# 37. Aluno que termina antes

Se um aluno concluir suas avaliações antes dos outros:

```text
Você terminou!

Aguarde os demais jogadores.
```

Não permitir que ele veja respostas ainda não avaliadas.

Não permitir que ele altere decisões já enviadas, salvo se houver uma funcionalidade explícita de revisão antes do fechamento.

---

# 38. Aluno desconectado durante correção

Se o aluno desconectar:

* preservar avaliações já enviadas;
* não apagar progresso;
* permitir reconexão quando possível;
* não duplicar avaliações;
* manter a sessão associada ao aluno.

Se o aluno não retornar, o professor poderá finalizar a correção sem aguardar indefinidamente.

Adicionar um timeout ou opção administrativa:

```text
[ FINALIZAR CORREÇÃO ]
```

mesmo que alguns alunos não tenham concluído.

---

# 39. Não bloquear o professor

O professor não deve ficar impossibilitado de finalizar a rodada porque um aluno:

* desconectou;
* fechou o navegador;
* saiu da sala;
* não terminou a correção.

O painel deve mostrar:

```text
32 / 40 concluíram
```

e permitir que o professor prossiga.

---

# 40. Tempo da correção colaborativa

A correção colaborativa deve possuir tempo configurável.

Valor inicial sugerido:

```text
60 segundos
```

Se o tempo terminar:

* avaliações já enviadas são preservadas;
* avaliações não realizadas ficam sem bônus;
* a fase de correção do professor começa.

---

# 41. Competitividade

A correção colaborativa deve ser apresentada como uma segunda competição.

Exemplo:

```text
RODADA ENCERRADA!

Agora você vai corrigir
as respostas de seus colegas.

Acerte as avaliações
e ganhe pontos bônus.
```

Isso evita que a correção seja percebida como uma tarefa burocrática.

---

# 42. Ranking temporário

Não revelar ranking completo durante a correção colaborativa.

O objetivo é preservar suspense.

Mostrar somente:

```text
Correção:
6 / 8
```

e eventualmente uma barra de progresso.

O resultado final aparece após a correção do professor.

---

# 43. Segurança da correção

O servidor deve validar:

* aluno pertence à rodada;
* aluno não está eliminado quando aplicável;
* resposta pertence à rodada;
* aluno não é autor da resposta;
* resposta foi atribuída ao aluno;
* avaliação ainda não foi enviada;
* rodada está em `COLLABORATIVE_CORRECTION`.

Qualquer violação deve resultar em erro controlado.

---

# 44. API / Socket.IO

Adaptar a API existente.

Eventos conceituais:

### Servidor → aluno

```text
collaborativeCorrectionStarted
reviewAssigned
reviewCompleted
collaborativeCorrectionFinished
teacherCorrectionStarted   ← ATENÇÃO: já existe um evento "correctionStarted"
                             (correção do professor, spec 18). Escolher entre
                             renomear o existente para maior clareza (ex.:
                             "teacherCorrectionStarted") ou usar um nome
                             claramente distinto ("collaborativeCorrectionStarted"
                             vs "correctionStarted") — não deixar os dois
                             nomes coexistindo de forma ambígua. Decisão de
                             implementação: preferir reaproveitar
                             "correctionStarted" tal como está (ele já
                             sinaliza o início da correção do professor) e
                             usar apenas "collaborativeCorrectionStarted"/
                             "collaborativeCorrectionFinished" como os dois
                             nomes genuinamente novos.
roundScored
```

### Aluno → servidor

```text
submitReview
```

### Professor → servidor

```text
startTeacherCorrection   ← redundante se "correctionStarted" já existir
                            (ver nota acima); avaliar se é necessário um
                            evento novo ou se o fluxo já dispara a fase de
                            correção do professor automaticamente ao fim da
                            correção colaborativa.
submitTeacherDecision
finishTeacherCorrection
```

Reutilizar nomes existentes quando possível — a lista completa de eventos
já registrados está em "Estado atual verificado", no topo deste
documento.

Não criar eventos duplicados com responsabilidades equivalentes.

---

# 45. Payload da avaliação

Exemplo:

```javascript
{
  reviewId: "abc123",
  decision: "VALID"
}
```

O aluno não deve enviar:

```javascript
{
  answerId: "...",
  graderStudentId: "...",
  roundId: "...",
  bonus: 2
}
```

como fonte de verdade.

O servidor já conhece essas informações a partir da sessão autenticada e da atribuição da avaliação.

Quanto menos informação sensível o cliente precisar enviar, melhor.

---

# 46. Payload da decisão do professor

O professor pode enviar:

```javascript
{
  answerId: "abc123",
  decision: "VALID"
}
```

O servidor identifica:

* rodada;
* categoria;
* resposta;
* alunos associados;
* avaliações relacionadas.

---

# 47. Atualização do modelo de dados

Antes de criar migrations, inspecionar o schema atual (ver "Estado atual
verificado" para os campos relevantes já mapeados).

Adicionar apenas os campos/tabelas necessários.

**`TeacherDecision` não deve ser criado como entidade separada** — a
decisão oficial do professor já existe: `Answer.reviewState` +
`Answer.isValid`, que já são a fonte usada por `scoreAnswers` e já são
gravados por `answerService.review`/`reviewMany` (correção manual, spec
18). Criar uma segunda tabela para a mesma informação duplicaria dados
que já existem — exatamente o que esta seção pede para evitar.

A única entidade genuinamente nova é:

```text
AnswerReview   (avaliação de um colega sobre a resposta de outro aluno)
  id
  roundId
  answerId
  graderStudentId       — ou graderPlayerSessionId, para reaproveitar o
                           mesmo padrão de identidade que PlayerSession já
                           usa em Answer/RoundParticipant
  decision               (VALID | INVALID)
  createdAt
  updatedAt

  @@unique([answerId, graderStudentId])   — impede avaliação duplicada (Seção 14)
```

Não duplicar dados já existentes.

---

# 48. Migração

Criar migration Prisma incremental.

Não apagar dados existentes.

Testar:

```text
npx prisma migrate dev
```

e posteriormente o fluxo equivalente para produção.

---

# 49. Compatibilidade

A implementação deve funcionar com:

* partidas antigas;
* alunos existentes;
* categorias existentes;
* respostas existentes.

Se uma partida antiga não possui suporte à correção colaborativa, o sistema deve tratá-la explicitamente como versão anterior ou impedir a execução dessa nova fase.

Não presumir que dados históricos possuem os novos campos.

---

# 50. UX visual

Manter a identidade visual já implementada.

Não redesenhar toda a aplicação.

A nova interface deve ser integrada ao design existente.

Priorizar:

* cores claras para estados;
* tipografia grande;
* feedback imediato;
* poucas ações;
* animações curtas;
* consistência.

Para o aluno:

```text
resposta → decidir → próxima
```

Para o professor:

```text
resposta agrupada → validar → próxima
```

---

# 51. Performance da correção

Com 40 alunos e aproximadamente 8 avaliações por aluno:

```text
40 × 8 = 320 avaliações
```

A aplicação deve tratar isso facilmente.

Não enviar 320 mensagens individuais para todos os clientes.

A distribuição deve ser enviada individualmente a cada aluno.

O professor pode receber dados agregados.

---

# 52. Regra de ouro da correção

A interface do professor deve responder à pergunta:

> "Como eu corrijo 40 alunos rapidamente?"

A resposta arquitetural deve ser:

> **Eu não corrijo 40 alunos. Eu corrijo cada resposta distinta uma vez.**

E a interface do aluno deve responder:

> "Como faço minha parte da correção rapidamente?"

A resposta deve ser:

> **Recebo algumas respostas anônimas, clico em válida ou inválida e avanço automaticamente.**

---

# 53. Não implementar IA desnecessariamente

Não introduzir um modelo de linguagem somente para tornar a correção automática.

A primeira versão deve utilizar:

* agrupamento;
* normalização;
* banco de respostas conhecidas, se disponível;
* decisão humana.

A IA poderá ser adicionada futuramente como mecanismo de sugestão, não como autoridade.

---

# 54. Contagem regressiva sincronizada

Uma contagem regressiva deve ser exibida na tela dos alunos antes das categorias serem mostradas.

Regras:

* a contagem regressiva só deve começar quando todos os dispositivos conectados estiverem sincronizados nela — não cada cliente disparando seu próprio `setTimeout()` de forma independente (mesmo princípio da Seção 6);
* o servidor deve fornecer o momento exato (timestamp absoluto, não uma duração relativa) em que todos os dispositivos devem exibir a contagem — reutilizar o mesmo mecanismo de relógio já usado por `serverTime`/`useServerClock`/`useCountdown` (spec 33/45; ver "Estado atual verificado"), não criar um segundo mecanismo de sincronização;
* o servidor só libera a contagem regressiva depois que todos os dispositivos reconhecerem (`ack`) o momento combinado;
* deve haver um timeout de reconhecimento: um dispositivo desconectado ou que não confirma a tempo não pode travar a partida inteira para os demais.

Fluxo:

```text
Servidor solicita contagem regressiva para daqui a 5 segundos
   ↓
Todos os dispositivos conectados reconhecem (ack)
   ↓ (ou timeout de reconhecimento vencido — segue sem os que não confirmaram)
Servidor emite sinal de liberação
   ↓
Dispositivos iniciam a contagem regressiva no momento absoluto informado
```

Este mesmo padrão de "esperar acks com timeout antes de liberar um evento
sincronizado" resolve, de forma mais geral, o mesmo problema já apontado
na nota de implementação da Seção 6 (esperar a animação da letra
terminar sem depender de um único cliente). Considerar implementar um
único mecanismo reutilizável de "evento sincronizado com ack + timeout"
em vez de dois códigos paralelos para os dois casos.


# 55. Critérios de aceitação específicos desta alteração

A implementação será considerada concluída quando:

* [ ] o aluno não precisa executar nenhuma confirmação equivalente a "Pronto" antes de uma fase começar;
* [ ] a letra é sorteada pelo servidor (já verdade hoje);
* [ ] a tela pública executa o drama (já verdade hoje — `LetterAnimation.jsx`);
* [ ] a letra não aparece prematuramente na tela do aluno (gap real a fechar — hoje aparece);
* [ ] a letra aparece no aluno somente após a revelação;
* [ ] o cronômetro inicia de forma sincronizada;
* [ ] após STOP inicia a correção colaborativa;
* [ ] cada aluno recebe respostas de outros alunos;
* [ ] nenhum aluno recebe sua própria resposta;
* [ ] respostas não revelam a identidade do autor;
* [ ] cada aluno corrige um número limitado de respostas;
* [ ] avaliações duplicadas são impedidas;
* [ ] alunos não podem alterar uma avaliação já enviada;
* [ ] professor recebe respostas agrupadas por equivalência;
* [ ] professor consegue validar uma resposta distinta;
* [ ] a decisão do professor é propagada aos alunos daquela resposta;
* [ ] professor continua sendo autoridade final;
* [ ] decisões dos alunos são comparadas às decisões do professor;
* [ ] coincidências geram bônus;
* [ ] bônus padrão é +2;
* [ ] bônus é calculado pelo servidor;
* [ ] bônus não pode ser manipulado pelo cliente;
* [ ] bônus não é aplicado duas vezes;
* [ ] pontuação normal continua funcionando;
* [ ] ranking final inclui bônus;
* [ ] alunos que não terminarem a correção não bloqueiam o professor;
* [ ] desconexão durante a correção preserva avaliações já realizadas;
* [ ] o sistema mantém histórico das avaliações;
* [ ] testes unitários cobrem pontuação e bônus;
* [ ] testes de integração cobrem o fluxo completo;
* [ ] testes concorrentes cobrem STOP e fechamento da correção.

---

# 56. Fluxo final esperado

A experiência completa deverá ser:

```text
┌─────────────────────────────────────────────┐
│                 PROFESSOR                   │
│                                             │
│ cria sala                                   │
│ seleciona tema                              │
│ sorteia letra                               │
│ inicia rodada                               │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  TELA PÚBLICA   │
              │                 │
              │     DRAMA       │
              │        ↓        │
              │       "R"       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     ALUNOS      │
              │                 │
              │ letra aparece   │
              │       ↓         │
              │ respondem       │
              │       ↓         │
              │      STOP       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   CORREÇÃO      │
              │   COLABORATIVA  │
              │                 │
              │ aluno → colega  │
              │ colega → aluno  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    PROFESSOR    │
              │                 │
              │ corrige grupos  │
              │ de respostas    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     SERVIDOR    │
              │                 │
              │ compara         │
              │ decisões        │
              │       ↓         │
              │ calcula bônus   │
              │       ↓         │
              │ pontua          │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    RANKING      │
              │                 │
              │  🥇 João        │
              │  🥈 Maria       │
              │  🥉 Pedro       │
              └─────────────────┘
```

---

# 57. Instrução final para o agente

**Não comece programando imediatamente.**

Primeiro faça uma análise do código existente e apresente internamente um plano de alteração baseado nos componentes, serviços, modelos e eventos já existentes.

Depois:

1. implemente as mudanças incrementalmente;
2. reutilize código existente;
3. evite duplicação;
4. preserve APIs compatíveis sempre que possível;
5. crie migrations apenas quando necessárias;
6. atualize testes;
7. execute os testes existentes;
8. execute testes específicos das novas funcionalidades;
9. corrija regressões;
10. verifique o fluxo completo ponta a ponta.

Ao terminar, forneça um resumo objetivo contendo:

* arquivos modificados;
* arquivos criados;
* migrations criadas;
* novos eventos Socket.IO;
* novos endpoints, se houver;
* alterações no modelo de dados;
* regras de negócio implementadas;
* testes executados;
* eventuais limitações ou decisões que exigem intervenção humana.

**Não reimplemente funcionalidades já existentes. Evolua a aplicação atual.**
