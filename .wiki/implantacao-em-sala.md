# Implantação em sala de aula

O uso real do STOP é: computador do professor roda backend + frontend, ativa um
hotspot Wi-Fi (geralmente **sem internet**, intencionalmente — só a rede local
importa), e os celulares dos alunos se conectam a esse hotspot para acessar
`http://<ip-do-hotspot>:5173`. Três armadilhas reais já apareceram nesse cenário
específico — nenhuma delas visível em desenvolvimento normal (`localhost`).

## 1. Proxy do Vite reescrevendo o header `Host`

**Sintoma:** QR Code / link de entrada da sala gerado pelo backend apontava para
`localhost`, que os celulares obviamente não alcançam.

**Causa:** `backend/src/controllers/roomController.js`'s `baseUrlFromRequest`
constrói a URL de entrada a partir de `req.headers["x-forwarded-host"] ??
req.get("host")` — ou seja, confia no header `Host` da requisição que chegou. Com
`changeOrigin: true` no proxy do Vite, o header `Host` original (IP do
hotspot:5173, do ponto de vista do celular) era **reescrito** para
`localhost:3000` antes de chegar ao backend.

**Correção** (`frontend/vite.config.js`): removido `changeOrigin` de ambos os
proxies (`/api` e `/socket.io`) — o `Host` original passa intacto. Comentário
deixado no próprio arquivo explicando o porquê, para não ser "corrigido de volta"
no futuro por alguém copiando um exemplo padrão de config do Vite.

```js
// Sem changeOrigin: o Host original (IP do hotspot:5173, do ponto de vista do
// celular) chega intacto ao backend. Com changeOrigin, o proxy reescreve o
// Host para "localhost:3000" antes de repassar a requisição — o backend usa
// esse header para montar o link/QR Code de entrada, então o QR acabava
// sempre apontando para "localhost", que o celular não alcança.
```

## 2. Detecção de captive portal desviando celulares para dados móveis

**Sintoma:** mesmo com o bug acima corrigido, celulares conectados ao hotspot
continuavam sem acessar o servidor — mas *apenas* quando o hotspot estava
intencionalmente sem internet.

**Causa:** não é um bug do STOP. Todo sistema operacional móvel testa, ao conectar
a um Wi-Fi, se há internet de verdade (requisição a um domínio de "captive portal
check" — ver tabela abaixo). Se o teste falhar, o SO considera essa rede "sem
internet" e **silenciosamente desvia o tráfego de apps para os dados móveis**,
mesmo mostrando o ícone como "conectado" ao Wi-Fi. Isso é intencional por parte do
Android/iOS/Windows (evitar que o usuário use uma rede "morta"), mas quebra
qualquer app local — como o STOP — cujo dev quer justamente que o tráfego fique na
LAN do hotspot.

| Plataforma | Domínio/URL testado | Resposta esperada |
| --- | --- | --- |
| Android | `connectivitycheck.gstatic.com/generate_204` | HTTP 204 |
| Apple (iOS/macOS) | `captive.apple.com/hotspot-detect.html` | HTML de sucesso específico |
| Windows | `msftconnecttest.com/connecttest.txt`, `msftncsi.com/ncsi.txt` | texto específico |
| Firefox | `detectportal.firefox.com/success.txt` | texto específico |

**Correção — spoofing local do captive-portal check**, implementada **no próprio
computador do professor** (fora do repositório STOP, em `~/dotfiles`; não faz parte
desta base de código):

1. `dnsmasq-shared.d/captive-portal-spoof.conf` — resolve os domínios de checagem
   acima para `10.42.0.1` (o próprio gateway do hotspot).
2. Um responder HTTP (`captive-portal-responder.py`, `ThreadingHTTPServer` na porta
   80) devolve exatamente a resposta que cada plataforma espera (204, o HTML da
   Apple, os textos do Windows/Firefox), fazendo o celular concluir "esta rede tem
   internet" e **não** desviar tráfego.
3. Um serviço `systemd` (`captive-portal-responder.service`,
   `AmbientCapabilities=CAP_NET_BIND_SERVICE` para bindar a porta 80 sem rodar como
   root) sobe/derruba o responder junto com o hotspot, controlado por um checkbox
   "spoof the captive-portal check" no painel QuickShell de hotspot do usuário
   (`WifiCard.qml`).

Esse conjunto de arquivos não vive neste repositório — é infraestrutura do posto de
trabalho, não do app. Mencionado aqui porque é a explicação completa do "por que às
vezes funciona e às vezes não" ao testar em sala de aula sem essa configuração
ativa: **sem** o spoof, um hotspot sem internet real vai intermitentemente perder
alunos que o SO decidiu desviar para dados móveis.

## 3. Bundle velho: a correção existe no repositório e não existe na tela

**Sintoma:** uma correção de frontend está no código, passa nos testes, foi
revisada — e simplesmente **não acontece** no navegador. Nenhum erro, nenhum aviso.
Repetidamente, para a mesma correção.

**Causa:** em sala de aula quem serve o frontend é o próprio backend, a partir de
`frontend/dist` já compilado (`app.js`: `express.static(frontendDist)` + fallback do
SPA). Não há Vite em modo dev nesse cenário. Editar `frontend/src/` não muda
absolutamente nada até rodar `npm run build` — o navegador continua recebendo o
bundle antigo, e como nada falha, parece que a correção nunca foi feita.

Aconteceu de verdade aqui: o pódio pós-"Finalizar partida" ficou invisível por
várias rodadas de "já está implementado" porque o `dist` servido era de horas antes
de o código do pódio existir.

**Proteção:** `createApp()` compara a data de modificação mais recente de
`frontend/src` com a de `frontend/dist` e, se o fonte for mais novo, registra um
`WARN` alto na subida:

```
WARN frontend/dist esta DESATUALIZADO: frontend/src foi alterado 12 min depois do
     ultimo build. O navegador vai receber o bundle antigo.
     Rode: cd frontend && npm run build
```

É só um aviso — nunca derruba o servidor. Mas se ele aparecer no log, **qualquer**
teste de frontend feito naquela instância é inválido.

**Regra prática:** mexeu em `frontend/src` → `npm run build`; mexeu em
`backend/src` → reiniciar o processo. E o navegador guarda o bundle em cache, então
o teste manual final pede recarga forçada (Ctrl+Shift+R) — o hash no nome do arquivo
(`index-<hash>.js`) é a forma rápida de conferir qual bundle está de fato no ar:

```bash
curl -s http://127.0.0.1:3000/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

## Verificando ausência de dependência de internet no próprio app

Investigado exaustivamente por grep no código: o STOP **não** faz nenhuma chamada de
rede para fora da LAN (sem CDN externo, sem fontes/ícones remotos, sem API de
terceiros). O único requisito de rede é que o dispositivo alcance o IP do hotspot —
qualquer sintoma de "sem internet = sem app" vem inteiramente do comportamento do SO
do celular descrito acima, nunca do código do STOP.
