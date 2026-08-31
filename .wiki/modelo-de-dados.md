# Modelo de dados

Schema completo: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma).
MySQL 8 via Prisma. Esta página documenta as relações e, principalmente, *por que*
certas decisões de `onDelete` existem — não é óbvio lendo o schema isolado.

## Entidades e relações

```
Teacher 1───* Game *───1 Class (discipline: String?)
                │            │
                │            └─1───* Enrollment *───1 Student
                │
                ├──1───* Room ──1───* PlayerSession ──1─── Student
                │         │    (roomEpoch, stateVersion)
                │         └──1───* ProcessedOperation (idempotência de comandos)
                │
                ├──1───* Round ──1───* RoundCategory ──*───1 Category ──*───1 CategorySet
                │         │              │
                │         │              └──1───* Answer ──1─── PlayerSession
                │         │                         │
                │         │                         └──*─── AnswerReview ──1─── PlayerSession (grader)
                │         │
                │         └──1───* RoundParticipant ──1─── PlayerSession
                │
                ├──1───* Score (total corrente por aluno, existe desde o início da partida)
                │
                └──1───* GameResult (registro permanente pós-finalização, um por aluno)
```

## `Restrict` vs. `Cascade`: o padrão de proteção de histórico

Regra usada de forma consistente no schema: se apagar o registro pai apagaria
**histórico acadêmico** que o professor usa para avaliação, a FK é `Restrict` (a
exclusão falha com 409 enquanto houver dependentes) em vez de `Cascade`.

| Relação | `onDelete` | Por quê |
| --- | --- | --- |
| `Game.class → Class` | `Restrict` | Apagar uma turma não pode levar junto o histórico de partidas já jogadas nela (spec 44). |
| `PlayerSession.student → Student` | `Restrict` | Apagar um aluno não pode levar junto o histórico de partidas em que participou (spec 44). |
| `GameResult.student → Student` | `Restrict` | Mesmo padrão — apagar um aluno não pode apagar o registro que o professor usa para avaliação acadêmica. |
| `Enrollment.student/class` | `Cascade` | Matrícula é um vínculo administrativo, não histórico de desempenho. |
| `Round.game`, `Answer.round`, `RoundParticipant.round` | `Cascade` | Filhos de uma rodada não têm sentido sem ela; apagar a rodada (ex.: `gameService.removeRound`) deve limpar tudo em cascata. |
| `Round.categorySet` | `SetNull` | Uma `CategorySet` pode ser removida sem invalidar rodadas passadas — `RoundCategory` já guarda uma **cópia imutável** dos dados no momento da criação da rodada (spec 17), então a rodada não depende mais do `CategorySet` original depois de criada. |

Ao adicionar uma nova entidade com histórico acadêmico, siga esse padrão: `Restrict`
na FK para `Student` (ou qualquer entidade "fonte de verdade" que não pode sumir
silenciosamente), `Cascade` para dados puramente derivados/dependentes.

## `Score` vs. `GameResult`: por que dois modelos parecidos

* **`Score`** — total corrente por aluno **enquanto a partida está em andamento**.
  Atualizado a cada rodada pontuada. Existe desde `Game.status === "CREATED"`.
* **`GameResult`** — registro **permanente**, criado só quando o professor finaliza a
  partida (`gameService.finish`, ver [Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md)).
  Guarda `score` (cópia do total final), `position` (com empates — ver algoritmo de
  ranking) e `medal` (GOLD/SILVER/BRONZE para o top 3, `null` para os demais). É a
  fonte de dados do painel de [Relatórios](frontend.md#reportspaneljsx).

Eles não são o mesmo dado com nomes diferentes: `Score` pode mudar a qualquer
momento até o fim da partida; `GameResult` é gravado uma vez (via `upsert` idempotente
por `@@unique([gameId, studentId])`, seguro para reexecução) e nunca mais muda depois
que `finish()` roda.

## `RoundCategory`: cópia imutável, não referência

`RoundCategory` duplica `name`/`description`/`required`/`order` de `Category` no
momento em que a rodada é criada (spec 17), em vez de apenas referenciar
`categoryId`. Isso é o que permite editar ou apagar um `CategorySet` livremente sem
corromper rodadas já jogadas — e é a razão pela qual `Round.categorySet` pode ser
`SetNull` com segurança.

## Discipline em `Class`

`Class.discipline` (`String?`, nullable) foi adicionado para permitir filtrar
relatórios por matéria (ex.: "React Native") quando várias turmas/ofertas da mesma
disciplina existem. É opcional e não retroativo — turmas antigas ficam com
`discipline = null` até o professor preencher via `ConfigPanel.jsx`. Uma turma =
uma oferta de uma disciplina; se a mesma disciplina for oferecida a duas turmas
diferentes, cada uma tem seu próprio registro `Class` com o mesmo valor de
`discipline`.

## `letterRule` em `Round`

`Round.letterRule` (`enum LetterRule { STARTS_WITH | CONTAINS }`, default
`STARTS_WITH`) guarda como a letra sorteada é cobrada naquela rodada. Fica no
`Round`, não no `Game` nem em configuração global, porque o professor escolhe por
rodada — e porque uma rodada já jogada precisa continuar sendo lida com a regra que
valia quando foi jogada (mesmo princípio de imutabilidade do `RoundCategory` acima).
Ver [Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md#regra-da-letra-letterrule-spec-21).

## `Room.roomEpoch` / `Room.stateVersion`: a posição autoritativa

Duas colunas `Int` na `Room` (`roomEpoch @default(1)`, `stateVersion @default(0)`)
formam o par que ordena os estados enviados aos clientes. Cada difusão autoritativa
incrementa `stateVersion`; o cliente guarda a última posição adotada e **descarta**
qualquer estado com posição menor (ver
[Tempo real](tempo-real.md#posição-autoritativa-roomepoch-stateversion)).

Ficam **no banco**, e não só em memória, por um motivo específico: se a versão
vivesse no processo, um restart do servidor a devolveria a zero e todos os clientes
já conectados passariam a rejeitar todo estado novo como "antigo" — o servidor
reiniciaria e a sala inteira congelaria. Persistidas, a monotonicidade sobrevive ao
restart. `Int` (2³¹ mudanças) é folgado para uma sala de aula; `BigInt` só arrastaria
problemas de serialização para o cliente.

## `ProcessedOperation`: idempotência de comandos (spec 3.1)

Chave composta `@@id([roomId, id])`, onde `id` é o `operationId` (UUID) que o cliente
gera por comando de escrita. O `create` funciona como trava: o primeiro vence, um
reenvio do mesmo comando (ack perdido, retry após timeout) colide com P2002 e recebe
de volta o `responseJson` já gravado em vez de reexecutar o efeito. `status` é
`PENDING` durante o processamento e `DONE` ao gravar o resultado; **falha apaga a
linha**, para que um retry legítimo possa reexecutar do zero.

A FK para `Room` é `Cascade` — e aqui isso é o correto, não uma exceção ao padrão de
proteção de histórico acima: estas linhas são travas efêmeras, não registro
acadêmico. É também o que faz `maintenanceService` continuar íntegro sem listar o
modelo: ao restaurar um backup, o `deleteMany` das salas leva as operações junto pelo
cascade do próprio banco.

## `avatarUrl`: dois formatos, um só validador

`Student.avatarUrl` (`String?  @db.Text`) aceita **exatamente dois** formatos, e o
regex em `roomAvatarSchema` (`validators/schemas.js`) é a única porta:

| Formato | O que é |
| --- | --- |
| `face:v1:<12 dígitos base36>` | a receita do rosto montado pelo aluno — só índices |
| `data:image/(png\|jpeg\|webp);base64,…` | foto tirada na hora, já reduzida no cliente |

O ponto de segurança: a receita guarda **números**, não marcação. `data:image/svg+xml`
é recusado de propósito — aceitar SVG arbitrário do cliente seria aceitar marcação de
origem desconhecida num campo que depois é renderizado. Há teste para as duas coisas
(receita aceita; `svg+xml`, `face:v1:<svg onload=…>`, `face:v2:` e `javascript:` todos
recusados com 400).

Caminhos de arquivo (`/avatars/*.svg`) **não valem mais**: a pasta de avatares
prontos deixou de existir quando o montador entrou. Se aparecer um `avatarUrl` assim
num banco antigo, ele vira imagem quebrada — a limpeza é
`UPDATE Student SET avatarUrl = NULL WHERE avatarUrl LIKE '/avatars/%'`.

## Migrações

Fluxo usado neste projeto (ver [Testes](testes.md) para o setup do banco isolado):

1. `DATABASE_URL=...stop_test npx prisma migrate dev --name <nome>` — gera e aplica
   a migração no banco de teste, produz `prisma/migrations/<timestamp>_<nome>/migration.sql`.
2. Inspecionar o SQL gerado manualmente antes de tocar produção.
3. `npx prisma migrate deploy` (usando o `DATABASE_URL` de produção do `.env`) —
   aplica a **mesma** migração já testada, nunca `migrate dev` direto em produção.

> **Quando `migrate dev` não roda.** Ele precisa criar um *shadow database*, e o
> usuário do MySQL pode não ter `CREATE DATABASE`. Nesse caso: escrever o
> `migration.sql` à mão (copiando o estilo das migrações vizinhas), colocá-lo numa
> pasta `prisma/migrations/<timestamp>_<nome>/` e aplicar com `migrate deploy`, que
> **não** usa shadow database. Foi assim que `letterRule` entrou.
