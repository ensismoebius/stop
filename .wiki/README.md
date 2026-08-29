# Wiki do STOP

Referência técnica do projeto — como as peças se encaixam, por que certas decisões
foram tomadas e quais armadilhas já morderam alguém aqui. Complementa, sem duplicar:

* **[README.md](../README.md)** (raiz do projeto) — visão geral, stack, como rodar.
* **[Especificação original](especificacao-original.md)** — requisitos numerados
  ("spec 17") citados em mais de 200 comentários do código; migrou para a wiki
  (era `specifications.md`, na raiz do projeto) para viver ao lado das páginas que
  explicam *como* cada requisito foi implementado, em vez de num arquivo solto.
* **`enhancements.md`** — **não existe mais na árvore de trabalho**: foi apagado no
  commit `7fa6bae`. Cerca de dez comentários espalhados pelo código continuam
  citando-o por seção ("enhancements.md seções 9-16" em
  `reviewAssignment.js`, `CollaborativeCorrection.jsx`, `viewService.js`,
  `realtime.js`, `lifecycle.js`, `schemas.js`, `GroupedCorrectionPanel.jsx`), então
  a referência ainda é necessária para entender de onde vieram a correção
  colaborativa e a revelação sincronizada da letra. Para recuperá-lo:

  ```bash
  git show 7fa6bae^:enhancements.md > /tmp/enhancements.md
  ```

  `issues.md`, criado no mesmo commit, está vazio — não é substituto.

## Arquitetura e dados

* [Arquitetura](arquitetura.md) — os três clientes, o princípio "servidor decide o
  estado", topologia de dev vs. sala de aula, fluxo de uma requisição.
* [Modelo de dados](modelo-de-dados.md) — entidades Prisma, relações, e o padrão
  `Restrict` vs. `Cascade` usado para proteger histórico acadêmico.

## Domínio do jogo

* [Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md) — a máquina de estados
  `RoundStatus`, a regra da letra (`STARTS_WITH`/`CONTAINS`), correção colaborativa,
  correção do professor, ranking e medalhas, e o que "Finalizar partida" encerra
  de fato.
* [Tempo real (Socket.IO)](tempo-real.md) — salas de socket, catálogo de eventos, o
  padrão `broadcastState()` (com dois bugs reais desta base como estudo de caso) e o
  estudo de caso "30 alunos presos na tela de espera" (watchdog, coalescência,
  heartbeat, transporte configurável, compressão — as seções `[#N]` citadas no código
  como `tempo-real.md #N`).

## Frontend

* [Frontend](frontend.md) — páginas por cliente, componentes, hooks, onde cada
  responsabilidade mora; o montador de rosto do aluno, as quatro armadilhas de CSS
  que nenhum teste pegou, e as duas apresentações de ranking (lista entre rodadas,
  pódio olímpico no fim).

## Operação

* [Implantação em sala de aula](implantacao-em-sala.md) — hotspot, o bug do
  `changeOrigin` do Vite, por que celulares "abandonam" um Wi-Fi sem internet, o
  bundle velho que faz uma correção existir no repositório e não na tela, e o
  cabeçalho fixo que esconde o campo que o navegador acabou de "revelar".
* [Testes](testes.md) — suíte de integração do backend, suíte de componentes do
  frontend, armadilhas do `fixtures.js`, duas falhas intermitentes já corrigidas, o
  espião que se instala no protótipo errado, e o padrão de simulação E2E isolada com
  Playwright.
