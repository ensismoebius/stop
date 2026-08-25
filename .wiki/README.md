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
  `RoundStatus`, correção colaborativa, correção do professor, ranking e medalhas.
* [Tempo real (Socket.IO)](tempo-real.md) — salas de socket, catálogo de eventos, e o
  padrão `broadcastState()` (com dois bugs reais desta base como estudo de caso).

## Frontend

* [Frontend](frontend.md) — páginas por cliente, componentes, hooks, onde cada
  responsabilidade mora.

## Operação

* [Implantação em sala de aula](implantacao-em-sala.md) — hotspot, o bug do
  `changeOrigin` do Vite, e por que celulares "abandonam" um Wi-Fi sem internet.
* [Testes](testes.md) — suíte de integração do backend, armadilhas do
  `fixtures.js`, e o padrão de simulação E2E isolada com Playwright.
