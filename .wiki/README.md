# Wiki do STOP

Referência técnica do projeto — como as peças se encaixam, por que certas decisões
foram tomadas e quais armadilhas já morderam alguém aqui. Complementa, sem duplicar:

* **[README.md](../README.md)** (raiz do projeto) — visão geral, stack, como rodar.
* **[specifications.md](../specifications.md)** e **[enhancements.md](../enhancements.md)**
  — requisitos numerados ("spec 17", "enhancements seção 35" etc.) citados nos
  comentários do código. Esta wiki explica *como* o requisito foi implementado; os
  specs continuam sendo a fonte da *decisão de produto* original.

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
* [Tempo real (Socket.IO)](tempo-real.md) — salas de socket, catálogo de eventos, e o
  padrão `broadcastState()` (com dois bugs reais desta base como estudo de caso).

## Frontend

* [Frontend](frontend.md) — páginas por cliente, componentes, hooks, onde cada
  responsabilidade mora; o montador de rosto do aluno e as duas apresentações de
  ranking (lista entre rodadas, pódio olímpico no fim).

## Operação

* [Implantação em sala de aula](implantacao-em-sala.md) — hotspot, o bug do
  `changeOrigin` do Vite, por que celulares "abandonam" um Wi-Fi sem internet, e o
  bundle velho que faz uma correção existir no repositório e não na tela.
* [Testes](testes.md) — suíte de integração do backend, suíte de componentes do
  frontend, armadilhas do `fixtures.js`, duas falhas intermitentes já corrigidas, e
  o padrão de simulação E2E isolada com Playwright.
