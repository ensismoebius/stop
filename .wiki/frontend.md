# Frontend

React 18 + Vite + React Router. Uma página por rota (`pages/`), que orquestra hooks
e monta a UI; a lógica de apresentação fica em `components/<cliente>/`.

## Rotas e páginas

| Rota | Página | Cliente |
| --- | --- | --- |
| `/teacher` (login) | `TeacherLoginPage.jsx` | professor |
| `/teacher` (autenticado) | `TeacherDashboardPage.jsx` | professor |
| `/screen/:código` | `PublicScreenPage.jsx` | tela pública |
| `/join/:código` | `JoinPage.jsx` | aluno (entrada) |
| `/play` | `StudentGamePage.jsx` | aluno (jogo) |
| `/historico`, `/historico/:matrícula` | `StudentHistoryPage.jsx` | aluno (consulta, fora de uma partida) |
| `/` | `HomePage.jsx` | — |

### As duas páginas grandes moram em vários arquivos

`StudentGamePage` e `TeacherDashboardPage` cresceram até o ponto em que "abrir o
arquivo da página" deixou de ser a forma de achar a lógica: cada uma foi dividida por
**responsabilidade**, e o `.jsx` de mesmo nome ficou só com a composição. Procurar um
comportamento no arquivo errado é o engano mais fácil de cometer aqui:

| Arquivo | O que mora nele |
| --- | --- |
| `StudentGamePage.jsx` | composição da página; monta as partes |
| `StudentGamePage.hooks.jsx` | watchdog de recuperação, refresh versionado, envio de respostas (debounce), efeitos de rodada |
| `StudentGamePage.state.jsx` | derivação do estado do aluno a partir do `roomState` |
| `StudentGamePage.parts.jsx` | blocos de UI (cabeçalho, listas, rodapé) |
| `TeacherDashboardPage.jsx` | composição do painel |
| `TeacherDashboardPage.hooks.jsx` | `useTeacherWatchdog`, `guard` das ações, timeout de REST, derivação da visão |
| `TeacherDashboardPage.tabs.jsx` | conteúdo de cada aba |

As constantes do watchdog (`WATCHDOG_STALE_MS`, `WATCHDOG_JITTER_MS`,
`WATCHDOG_MAX_MS`) são declaradas em `StudentGamePage.hooks.jsx` e **importadas** pelo
painel do professor — os dois watchdogs são o mesmo desenho e devem continuar com a
mesma cadência.

## Hooks (`frontend/src/hooks/`)

* **`useRoomSocket.js`** — conecta o socket, registra todos os listeners de evento
  (ver [Tempo real](tempo-real.md)), e expõe `roomState` + um mapa de handlers por
  evento passado pelo chamador. É o único lugar que fala Socket.IO diretamente;
  páginas consomem o hook, não o socket cru.
* **`useServerClock.js`** — relógio sincronizado com o servidor, usado por
  `CountdownTimer`/`Countdown` para o cronômetro não divergir por causa do relógio
  local do dispositivo.
* **`useEmojiBursts.js`** — anima as reações emoji recebidas via `emojiReceived`.
* **`useFullscreen.js` / `useAutoFullscreen.js`** — controla e detecta saída de tela
  cheia no cliente do aluno (a saída aciona `fullscreenExited` → eliminação da
  rodada corrente, spec 24/26).
* **`useAudio.js`** — efeitos sonoros.

## Componentes por cliente

### `components/teacher/`

| Componente | Papel |
| --- | --- |
| `ConfigPanel.jsx` | CRUD de Turmas (incluindo `discipline`), Alunos, e vínculo com `CategorySetsPanel` |
| `CategorySetsPanel.jsx` | CRUD de conjuntos de categorias e categorias |
| `RoomControl.jsx` | abrir/fechar sala, ver QR/link de entrada — com a partida encerrada mostra "Sala encerrada" **sem QR nem URL de entrada** (exibi-los seria mentira: `join` recusa sala `CLOSED`), mantendo só o link da tela pública, que é onde fica o pódio |
| `RoundControl.jsx` | criar/iniciar/avançar rodada, incluindo a escolha da regra da letra (`STARTS_WITH`/`CONTAINS`) |
| `PlayerMonitor.jsx` | status ao vivo de cada aluno conectado |
| `CorrectionPanel.jsx` | grade de correção "crua" (uma linha por aluno × categoria) |
| `GroupedCorrectionPanel.jsx` | grade agrupada por resposta distinta, com auto-avanço para a próxima categoria pendente após Válida/Inválida — sem botão "Em branco" (respostas vazias já chegam marcadas automaticamente, ver [Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md#correção-do-professor)) |
| `RankingPanel.jsx` | ranking da partida em andamento |
| `StatisticsPanel.jsx` | estatísticas por partida |
| `ReportsPanel.jsx` | relatórios acadêmicos entre partidas/turmas — ver abaixo |

#### Abas e barra de estado do painel

As abas do `TeacherDashboardPage` implementam o padrão **Tabs da WAI-ARIA**
completo: cada aba tem `aria-controls` apontando para seu `tabpanel`, o painel
aponta de volta com `aria-labelledby`, as setas ← → navegam entre abas e o
*roving tabindex* faz o Tab entrar na lista de abas **uma vez** em vez de percorrer
as cinco. Antes a marcação anunciava `role="tab"` sem entregar nada disso — dizia ao
leitor de tela que era uma aba e não se comportava como uma.

A barra de ações (`QuickActions`) mostra o **estado da partida** ("Partida aberta" /
"Rodada em andamento" / "Partida encerrada"), em vez de obrigar o professor a
deduzir a fase a partir de quais botões existem. Com a partida encerrada, "Finalizar
partida" some (clicar de novo não faz nada de útil) e dá lugar a **"Nova partida"**,
que limpa a partida selecionada e volta ao seletor.

#### `ReportsPanel.jsx`

Lê de `GET /reports/results` (`api.searchReports`), que por sua vez consulta
`GameResult` (ver [Modelo de dados](modelo-de-dados.md)). Filtros: disciplina, turma,
aluno, partida, medalha, intervalo de data, intervalo de pontuação — todos
opcionais e combináveis. **Sempre** ordenado por nome do aluno
(`orderBy: { student: { name: "asc" } }` no backend, `reportService.js`), independente
de quais filtros estão ativos — não é uma opção de ordenação da UI, é fixo no
serviço.

Duas ações adicionais na mesma tela:

* **Exportar CSV** — gera o arquivo inteiramente no cliente a partir do `results` já
  carregado (sem round-trip ao servidor); usa BOM UTF-8 para acentuação abrir
  corretamente no Excel.
* **Desempenho por categoria** — dispara `GET /reports/category-stats`
  (`api.categoryStats`), reaproveitando só os filtros de disciplina/turma/partida do
  mesmo formulário (não aluno/medalha/data/pontuação, que não fazem sentido nessa
  granularidade). Agrega `Answer` por `roundCategory.name` — estável entre partidas
  diferentes que reusam o mesmo `CategorySet`, pelo mesmo motivo que
  `RoundCategory` é uma cópia imutável (ver
  [Modelo de dados](modelo-de-dados.md#roundcategory-cópia-imutável-não-referência))
  — e ordena por taxa de acerto **crescente**: a categoria em que a turma mais erra
  aparece primeiro, o dado mais acionável para o professor.

### `components/student/`

`AvatarPicker` + `FaceBuilder`, `GameHeader`, `LetterDisplay`, `CountdownTimer`,
`CategoryList` + `CategoryCard`, `AnswerEditor`, `StopButton`, `ProgressIndicator`,
`CollaborativeCorrection`, `EmojiPicker`. Compostos por `StudentGamePage.jsx`, que
também renderiza o ranking final (com medalha) quando `game.status === "FINISHED"` —
incluindo a **própria colocação** do aluno mesmo quando ele está fora do top 10 (ver
[Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md#o-aluno-precisa-se-ver-não-só-o-pódio)).

#### Regra da letra na tela do aluno

`round.letterRule` chega no estado da sala e aparece em **três** lugares, para que o
critério nunca dependa de o aluno abrir uma categoria:

* `LetterDisplay` — o rótulo acima da letra **é** a regra ("Começa com" / "Contém"),
  visível a rodada inteira e já antes do sorteio.
* `AnswerEditor` — placeholder e o aviso de resposta fora da regra.
* `CollaborativeCorrection` — quem corrige o colega precisa saber por qual critério
  julgar; "Letra A" sozinho não diz isso.

#### `AnswerEditor` — "Salvar", e a rolagem que o navegador faz sozinho

A resposta é gravada por debounce, no `blur` e ao trocar de categoria (spec 48) — o
botão do rodapé nunca foi obrigatório para não perder texto. Ainda assim ele **grava
explicitamente** antes de fechar, em vez de confiar no `blur`:

```jsx
onClick={() => { onCommit(category.id); onClose(); }}
```

Se o aluno tocar no botão com o campo já desfocado, o `blur` não acontece — e um
botão escrito "Salvar" que às vezes não salva é pior do que não ter botão. O rótulo
também mudou: era **"Voltar"**, que descreve para onde a tela vai e não o que
acontece com o que foi digitado; quem está com pressa lê "Voltar" e hesita em tocar.
(O "Voltar" do `FaceBuilder` continua "Voltar" — lá ele de fato só anda um passo
para trás no assistente.)

**A caixa de resposta aparecia cortada no celular.** O cabeçalho do aluno é
`position: sticky` e a barra do STOP é `position: fixed`; a rolagem automática que o
navegador faz ao focar um campo mira a **viewport inteira**, não a faixa livre entre
os dois — o campo parava atrás do cabeçalho e sobrava só o rodapé do cartão. A
correção tem duas camadas, e nenhuma das duas basta sozinha:

* `AnswerEditor` rola o **cartão inteiro** para o centro depois de focar
  (`scrollIntoView({ block: "center" })`) — centralizar não exige saber a altura do
  cabeçalho, que muda de fase para fase.
* `.editor` declara `scroll-margin-top/bottom` como rede para as rolagens que o
  navegador faz por conta própria e que nem passam pelo nosso código — abrir o
  teclado virtual, por exemplo.

A primeira cobre o foco que **nós** causamos; a segunda, o que o **sistema** causa.
Ver também [Implantação em sala](implantacao-em-sala.md#4-cabeçalho-sticky--barra-fixed-vs-a-rolagem-automática-do-navegador).

#### Avatar: `FaceBuilder` (assistente) + `lib/face.js`

O aluno **monta** o próprio rosto; não existe mais galeria de avatares prontos.

* **Peças** — `src/data/faceParts.js` é **gerado** por
  `scripts/extract-face-parts.mjs` a partir do estilo *Adventurer* do DiceBear
  (CC BY 4.0, Lisa Wischofsky): 45 cabelos, 26 olhos, 15 sobrancelhas, 30 bocas.
  DiceBear é **devDependency** — roda no build, nunca no navegador.
  Cabelo e pele saem com uma cor-sentinela trocada em tempo de execução, e é por
  isso que 22 cores de cabelo custam 45 peças, não 990.
* **Receita** — `lib/face.js` guarda só índices e os codifica como
  `face:v1:020100010203` (dois dígitos base36 por campo: 45 cabelos não cabem em um).
  O que vai para o banco é isso, **nunca marcação** — ver
  [Modelo de dados](modelo-de-dados.md#avatarurl-dois-formatos-um-só-validador).
* **Assistente** — uma decisão por tela (pele → cabelo → cor → olhos → sobrancelhas
  → boca). Cada miniatura da galeria é **o rosto inteiro do aluno com aquela peça
  trocada**: escolher olhando o resultado, nunca um nome como `variant07`.
* **Renderização** — `components/common/FaceSvg.jsx` compõe o SVG;
  `components/common/Avatar.jsx` é o único lugar que sabe distinguir receita de foto
  (data URL) e é usado por **todas** as telas (ranking, pódio, monitor do professor,
  cabeçalho do aluno).

Quatro armadilhas visuais que passaram por centenas de testes verdes e só
apareceram em screenshot — todas de CSS, nenhuma de lógica:

1. `FaceSvg` embrulha o SVG num `<span>`. `span` é `display: inline`: ele colapsa
   para a altura de linha e o rosto sai cortado na testa. Daí `.face { display:block }`.
2. As classes de avatar espalhadas pelo app foram escritas para `<img>` e usam
   `object-fit`, que **não vale para um `<span>`**. `.face` carrega
   `overflow:hidden; border-radius:inherit` para respeitar o recorte redondo de quem
   a hospeda.
3. Itens de grid **esticam por padrão, e o stretch ganha do `aspect-ratio`** — as
   miniaturas ficavam baixas e largas, e o rosto quadrado aparecia cortado na linha
   do cabelo. Corrigido com `align-items: start` na grade.
4. `.face` **não define tamanho** — e isso é contrato, não esquecimento. Ver a
   seguir.

##### `.face` não dimensiona: quem manda é a classe do lugar

A primeira versão fechava com `.face { width:100%; height:100% }`, o que parecia
inofensivo — o wrapper preenche quem o hospeda. Só que `.face` mora em `student.css`
**depois** de `.student__avatar`, no mesmo arquivo: mesma especificidade (uma
classe), e nesse empate quem vem depois ganha. O avatar de 22px do cabeçalho do
aluno virava 100% do pai para todo aluno com rosto montado.

O que tornou o bug difícil de ver foi a **ordem de importação**: `teacher.css` e
`public.css` carregam depois de `student.css`, então o pódio e o monitor do professor
estavam acidentalmente protegidos, e só o cabeçalho do próprio aluno pagava a conta.
Um seletor genérico que dimensiona é uma bomba-relógio de cascata — ele só quebra as
telas cujo CSS carrega antes dele, então o sintoma parece aleatório e específico
demais para ser cascata.

O contrato agora é explícito, e os comentários em `student.css` o repetem para não
ser "otimizado" de volta:

| Quem | Responsabilidade |
| --- | --- |
| a classe do lugar (`.podium__avatar`, `.student__avatar`, …) | **dimensiona**, sempre |
| `.face` | só **recorta** — `display:block; overflow:hidden; border-radius:inherit` |
| `.face > svg` | preenche a largura, altura vem do `viewBox` quadrado (`width:100%; height:auto`) |

Essa divisão faz `.face` funcionar nos dois arranjos que existem no app: quando ela
própria é o elemento dimensionado, e quando ela vive dentro de um contêiner de
tamanho fixo.

A galeria fica num painel de rolagem de **altura fixa** (`.wz__panel`), não
`max-height`: com altura variável, a lista de 45 cabelos empurrava "Voltar/Próximo"
para fora da tela do telefone.

`EmojiPicker.jsx`'s `EMOJI_REACTIONS` (conjunto fixo, sem digitação livre — spec:
fácil de moderar) é **duplicado** em `backend/src/validators/schemas.js` como
`z.enum(EMOJI_REACTIONS)`: o servidor rejeita qualquer emoji fora dessa lista via
`sendEmoji`. Adicionar uma reação nova exige editar os dois lugares — esquecer o
backend faz o clique do aluno falhar silenciosamente na validação do socket.

### `StudentHistoryPage.jsx` (`/historico`)

Consulta o histórico do próprio aluno (medalhas/pontuação por partida) só pela
matrícula, via o endpoint público `GET /students/history/:registrationNumber` — ver
[Arquitetura](arquitetura.md#autenticação-dois-níveis-mais-rotas-públicas-por-matrícula)
para o porquê desse endpoint não exigir token de professor. Aceita tanto `/historico` (formulário) quanto
`/historico/:matrícula` (link direto, para favoritar/compartilhar). Link visível para
todos na `HomePage`, sem gate de autenticação — diferente dos atalhos de professor,
que só aparecem para quem já está autenticado.

### `components/public/`

`GameTitle`, `ThemeDisplay`, `LetterAnimation`, `Countdown`, `PlayerCount`,
`GameStatus`, `Ranking`, `PublicBackdrop`.

`PublicBackdrop.jsx` desenha o fundo animado da tela pública (o céu calculado por
`lib/sky.js` conforme a hora do servidor, mais as nuvens). É puramente decorativo e
não recebe nada do estado da sala.

**`hidePoints` é um ajuste de apresentação, não de privacidade.** O interruptor
"ocultar pontos" do painel vive em `roomSettings` (memória do servidor, propagado por
`roomSettingsChanged`) e faz o `Ranking` renderizar um marcador no lugar do número —
mas o `total` continua no payload, porque é o mesmo ranking que alimenta o pódio, que
sempre mostra pontuação. Serve para não estragar a virada durante a partida na TV da
sala; não serve como segredo (quem abrir o devtools vê os números).

**Vale para a TV e para a tela de cada aluno.** Esconder só na projeção não escondia
nada: o placar continuava no celular de todo mundo. Hoje o evento leve vai para a
sala inteira (`realtime.toRoom` em `roomController.updateSettings`), a projeção do
aluno carrega `settings` como linha de base (para quem entra ou reconecta depois do
clique) e `StudentRankingList` mascara os totais — mantendo colocação e nomes, que
são o que dá sentido ao ranking. **A partida encerrada sempre mostra os pontos**, no
aluno como no pódio: o interruptor existe para não estragar a virada durante o jogo,
não para esconder do aluno como ele terminou.

#### `Ranking.jsx` — dois placares, não um

`Ranking` é um despachante entre duas apresentações, escolhidas pela prop
`finished` (`view.game.status === "FINISHED"`, passada por `PublicScreenPage`):

| Quando | O quê |
| --- | --- |
| **entre rodadas** (`round.status === "SCORED"`) | `RankingList` — a lista de sempre, revelada do último colocado para o primeiro, top 8 |
| **fim da partida** (`game.status === "FINISHED"`) | `PodiumCeremony` — cerimônia olímpica |

Usar a cerimônia a cada rodada gastaria o efeito e alongaria a aula; por isso a
separação é explícita e tem teste dos dois modos **e da troca entre eles**.

A cerimônia segue um roteiro (`SCRIPT`): anuncia o 3º lugar (suspense, `DRUMROLL`),
revela, repete para o 2º, segura mais tempo no 1º e fecha com `FANFARE` + fogos de
CSS; só então a turma inteira aparece no rodapé. A ordem visual dos degraus é a
olímpica (2º à esquerda, **1º ao centro e mais alto**, 3º à direita), e cada degrau
recebe uma **lista** — empates são reais aqui, dois alunos em 1º sobem juntos.

Quem carrega a identidade no pódio é o **rosto**, não o degrau: o avatar é o maior
elemento da cerimônia (`clamp(5rem, 17vh, 11rem)`; o 1º lugar sobe para
`clamp(6.5rem, 22vh, 14rem)` e troca o aro branco pelo dourado), e os três blocos
foram encolhidos para o conjunto continuar cabendo em 720p. O valor *preferido* de
cada `clamp` é `vh`, não `vw`: a tela pública roda em projetor/TV, altura fixa e sem
rolagem — o eixo que aperta é o vertical, e um pódio que escala pela largura
transborda por baixo numa tela 21:9. Os limites continuam em `rem` para o rosto não
sumir num monitor baixo nem virar um pôster num 4K.

Ao testar: cada passo do roteiro só agenda o próximo **depois de renderizar**, então
avançar o tempo de dois passos de uma vez não funciona — avance pelo maior atraso do
roteiro, uma vez por passo (ver [Testes](testes.md)).

### `components/common/`

Elementos genéricos reaproveitados entre clientes (ex.: `Field.jsx`, usado por
formulários em `ConfigPanel` e `ReportsPanel`).

## Serviços

* **`services/api.js`** — todas as chamadas REST num único módulo, uma função por
  endpoint (ex.: `searchReports(token, filters)` usa `URLSearchParams` para montar a
  query string).
* **`socket/socket.js`** — `createSocket()` e `emitAck()` (emit que devolve uma
  Promise resolvida pelo ack do servidor).

## Estado

`state/` guarda o que não é local de um componente nem vem direto do socket (ex.:
sessão do professor autenticado). O grosso do estado de jogo, porém, vive no
`roomState` que `useRoomSocket` mantém e que o servidor é sempre quem decide — ver
o princípio central em [Arquitetura](arquitetura.md).
