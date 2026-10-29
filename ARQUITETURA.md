# Nexo Assist: arquitetura e decisões

Detalhes técnicos do projeto: arquitetura, como o agent decide, como a qualidade foi garantida, segurança, custo, deploy, trade-offs e próximos passos. Para apresentação e roteiro de teste, veja o [README](../README.md).

## Arquitetura

```
 Navegador ──────────────┬─ Chat do funcionário  (SSE: passos → texto → blocos → trilha)
                         └─ Console do analista  (polling)
                              │
                 Rotas de API (Next)  ── sessão (cookie assinado), limites de uso
                              │
        ┌─────────────────────┴──────────────────────┐
        │  agent/  NexoAgent: decide → regras → age → escreve
        │          ├─ LlmPort ── mastra-llm.ts (ÚNICO arquivo que conhece o Mastra)
        │          └─ policy.ts (prioridade, duplicidade, confiança: código determinístico)
        └─────────────────────┬──────────────────────┘
                              │
        services/  tickets (sistema "legado" simulado) · helpdesk (artigos) · conversations · usage
                              │
                           SQLite (conversas, mensagens, chamados, estado de cada conversa)
```

Decisões de arquitetura, e por quê:

- **Interface, agent e serviços separados.** O agent só fala com o serviço de chamados pela API pública dele (assíncrona, como se fosse remota). Trocar o simulado por um sistema real não toca o agent.
- **`LlmPort`.** O orquestrador não importa o Mastra: usa uma interface com duas operações (`decide`, `respond`). Isso isola a parte do projeto que mais muda entre versões e permite testar o agent inteiro, inclusive os fluxos de transferência e confirmação, sem rede.
- **Estado no servidor.** Conversa, rascunho pendente, status (`com_agent`, `aguardando_atendente`, `com_analista`, `encerrada`) e chamado ligado vivem no SQLite: sobrevivem a reinício (há teste que recria o store sobre o mesmo banco).
- **O serviço de chamados simula o legado:** cai de vez em quando (`TICKETS_FAILURE_RATE`), e o agent faz retry com backoff e mostra cada nova tentativa na trilha. Se não conseguir, continua respondendo o que não depende dele.

```
src/
  domain/      tipos, SLA em horas úteis, regras (reabertura em 7 dias, vencimento)
  services/    tickets/ · helpdesk/ · conversations · usage · db · seed
  agent/       nexo-agent (orquestrador) · policy · prompts · schemas · mastra-llm · blocks
  server/      sessão, container, SSE, console, limites de uso
  ui/          chat do funcionário, painel de decisão, console do analista
  app/         páginas e rotas de API (Next)
evals/         casos de ouro + execução        tests/   testes
```

## Como o agent decide o que fazer

A cada mensagem, **o modelo propõe e o código dispõe**:

1. **Contexto.** Carrega os chamados do funcionário, o estado pendente da conversa e as últimas 8 mensagens.
2. **Decidir (LLM, saída estruturada).** O modelo (Gemini) devolve um JSON validado com Zod: o que entendeu, a intenção (`duvida`, `consultar_chamado`, `abrir_chamado`, `atualizar_chamado`, `falar_com_analista`, `confirmar`, `fora_de_escopo`…), a **confiança** (0 a 1), o motivo, e os fatos do caso (quem é afetado, se impede de trabalhar, se há compromisso hoje, se algo está parado). Ele **não** escolhe a prioridade.
3. **Regras do service desk (código).** `policy.ts` e o orquestrador aplicam o Anexo A de forma determinística:
   - **Prioridade** = impacto × urgência, calculada em `derivePriority` a partir dos fatos (Crítica: algo parado para equipe/empresa; Alta: impede de trabalhar ou há compromisso no dia; Média; Baixa para pedidos sem urgência). O prazo vem de `sla.ts` (horas úteis, 8h–18h, seg–sex).
   - **Sem duplicidade.** Se o modelo aponta o mesmo problema de um chamado aberto, o rascunho vira *atualização*; resolvido há até 7 dias, vira *reabertura*; passou disso, abre um novo.
   - **Confirmação.** Nada é criado ou atualizado sem o “sim” do funcionário sobre um rascunho mostrado na tela. “Sim” sem rascunho pendente não faz nada.
   - **Transferência.** A pedido, em caso crítico (cria o chamado e chama o analista), em chamado vencido (o agent oferece; aceitando, transfere) ou **quando a confiança fica abaixo de 60%** (`NEXO_CONFIDENCE_THRESHOLD`). Leva um resumo do caso, e o agent para de responder até a conversa ser devolvida.
   - **Escopo.** RH, financeiro e facilities são redirecionados sem acionar o service desk.
   - **Privacidade.** O modelo só vê os chamados do funcionário logado; qualquer número de chamado que ele citar e que não esteja nessa lista é descartado (e a trilha registra isso).
4. **Executar** no serviço de chamados, com retry se o legado cair.
5. **Escrever (LLM, streaming).** Um segundo passo transforma os **fatos do que o código já fez** em uma resposta natural. Cartões, rascunho e botões de resposta rápida são montados pelo código, nunca pelo modelo: o texto não consegue “prometer” algo que o sistema não fez.
6. **Persistir** a mensagem com a trilha completa (`TurnTrace`): entendimento, intenção, confiança, motivo, passos (visíveis e internos), regras aplicadas, modelos, tokens e tempo.

Se o decisor falhar (API fora, JSON inválido), o funcionário recebe uma resposta de reserva com a opção de chamar um analista, nunca silêncio. Se só o redator falhar, entra um texto fixo.

## Como garanti a qualidade das decisões

Em três camadas, da mais barata à mais realista:

1. **Regras em código, com testes** (`npm test`, sem rede). Prazos em horas úteis (fim de semana, fora do expediente), prioridade, duplicidade e reabertura, privacidade entre funcionários, confirmação obrigatória, transferência e pausa do agent, concorrência no console (dois analistas não assumem a mesma conversa), persistência após reinício, migração de banco, limites de uso, retry do legado.
2. **Casos de ouro** (`evals/cases.ts`): 14 cenários, um por regra do PRD (dúvida sem chamado, consulta de chamado vencido, fluxo completo de abertura, duplicidade, reabertura, caso crítico, pedido de analista, vazamento entre funcionários, fora de escopo, tentativa de pular a confirmação, confirmação sem pendência, mensagem ambígua…). Cada turno declara o que o **sistema** deve fazer. Os mesmos casos rodam de dois jeitos:
   - `npm run eval:dry` (e dentro de `npm test`): um “modelo” que decide certo, para provar que as regras em código chegam ao desfecho esperado. Último resultado: **14/14** (`evals/last-run-dry.md`).
   - `npm run eval`: com o modelo de verdade (Gemini). Gera `evals/last-run.md` com acertos por critério, tempo médio e tokens por mensagem. O comando sai com erro se um caso objetivo falhar, então serve como verificação antes de cada deploy. O caso de mensagem ambígua é marcado como “soft”, porque depende do julgamento do modelo.
3. **A trilha é o instrumento de depuração.** Quando o agent erra, o painel “Como decidi” mostra se o erro foi de entendimento (o que ele entendeu), de segurança (confiança) ou de regra (o que o código corrigiu).



## Segurança e privacidade

- **Chaves fora do código:** só em variáveis de ambiente (`.env` está no `.gitignore`; há `.env.example`). No deploy, entram como secrets da plataforma.
- **Chamados de um funcionário nunca chegam a outro:** o serviço só aceita consultas pelo e-mail da sessão; chamado alheio responde igual a “não existe”; o modelo nunca vê chamados de terceiros; a identidade vem do cookie assinado (HMAC, `httpOnly`), nunca do corpo da requisição. A visão do analista exige papel `analista` checado **no serviço**, não só na tela.
- **Limites de uso e custo** (`src/server/abuse.ts`):
  - ritmo por pessoa e por IP (janela deslizante) e tentativas de login por IP;
  - **orçamento diário por pessoa**, persistido: vale para todas as conversas somadas, então abrir “Nova conversa” não zera o limite;
  - **orçamento diário global**: é o teto de custo da aplicação, aconteça o que acontecer;
  - conversa com analista não gasta orçamento de modelo; limite de 30 mensagens por conversa, como no PRD.
- Cabeçalhos de segurança básicos (`nosniff`, `X-Frame-Options`, `Referrer-Policy`).

## Escolha do modelo e custo por conversa

- **Provedor: Google Gemini, via Mastra.** A chave gratuita do Google AI Studio permite avaliar o projeto sem custo. O decisor precisa de saída estruturada confiável e bom português; o redator, de tom natural. Os dois passos usam por padrão o **mesmo modelo rápido** (`google/gemini-3.8-flash`), configurável por `NEXO_DECIDER_MODEL` e `NEXO_RESPONDER_MODEL`: dá para usar um modelo menor (`gemini-3.5-flash-lite`) no redator para poupar cota, ou um maior só onde fizer diferença.
- **Latência e tokens do Gemini 3.8:** é um modelo com "raciocínio" (níveis low, medium e high; o padrão é medium), então pode demorar mais e gastar mais tokens por chamada do que um modelo sem raciocínio. O painel “Como decidi” mostra o tempo e os tokens reais de cada mensagem. Se ficar lento, use `google/gemini-3.5-flash-lite` no redator (`NEXO_RESPONDER_MODEL`).
- **Trocar de provedor é configuração, não código.** O Mastra resolve `provedor/modelo` e lê a chave do provedor (`GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`); os prompts e o contrato de decisão (Zod) são independentes do modelo. Ao trocar, rode `npm run eval` para conferir que as decisões continuam boas.
- **Plano gratuito:** tem limite de requisições por minuto e por dia, e cada mensagem faz duas chamadas. Confira os limites atuais e os termos de uso de dados no AI Studio (aqui os dados são fictícios). Em caso de cota esgotada, o agent degrada para a resposta de reserva.
- **Duas chamadas por mensagem, ambas curtas.** O prompt do decisor tem ~860 tokens de instruções (estimativa por tamanho do texto) mais o contexto do funcionário; o do redator, ~420 mais os fatos. O histórico enviado é limitado às últimas 8 mensagens e só os chamados do próprio funcionário entram. Mensagens sem LLM (limite atingido, conversa com analista) não custam nada.
- **Medição real, não estimativa:** o painel “Como decidi” mostra modelos, tokens do decisor e tempo de cada mensagem; o relatório do `npm run eval` agrega tokens e latência. Multiplique pelos preços vigentes do modelo escolhido.
- **Por que duas chamadas em vez de uma só com ferramentas?** Para manter a decisão auditável (um JSON por mensagem), impedir que o texto prometa ações que o código não executou e permitir testar tudo sem rede. O custo é uma chamada extra, curta; o ganho é previsibilidade e a trilha estruturada.

## Deploy

Pensado para **Fly.io** (um volume persistente para o SQLite). Vercel não serve aqui porque o disco é efêmero.

```bash
fly launch --no-deploy --copy-config --name SEU-APP      # usa o fly.toml do repositório
fly volumes create nexo_data --region gru --size 1
fly secrets set GOOGLE_GENERATIVE_AI_API_KEY=... SESSION_SECRET=$(openssl rand -hex 32)
fly deploy
fly scale count 1                                        # SQLite = uma máquina
```

- Faça `npm install` antes e **commite o `package-lock.json`** (o Dockerfile usa `npm ci`).
- As chaves ficam como secrets, nunca no repositório nem no `fly.toml`. `SESSION_SECRET` é obrigatório em produção (sem ele, a aplicação recusa autenticar).
- A última barreira é a **cota do próprio provedor** (no plano gratuito do AI Studio, as requisições por minuto e por dia são limitadas), além do orçamento diário da aplicação (`NEXO_USER_DAILY_MESSAGES`, `NEXO_GLOBAL_DAILY_MESSAGES`). Se a cota acabar, o agent responde com a mensagem de reserva e oferece um analista, em vez de ficar mudo.
- Saúde em `/api/health`. A máquina para quando ociosa e sobe na primeira requisição.

## Problemas comuns

- **"This model ... is no longer available to new users"**: o Google aposenta modelos antigos para contas novas. O padrão atual é `google/gemini-3.8-flash`; a lista oficial está em https://ai.google.dev/gemini-api/docs/models. Troque o nome em `NEXO_DECIDER_MODEL`/`NEXO_RESPONDER_MODEL`.
- **O Mastra não reconhece o nome do modelo:** o roteador lê um catálogo interno que pode estar atrás dos lançamentos do Google. Atualize o `@mastra/core` (`npm update @mastra/core`) ou use o SDK do Google diretamente: `npm i @ai-sdk/google` e, em `src/agent/mastra-llm.ts`, passe `google('gemini-3.8-flash')` (de `@ai-sdk/google`) como `model` no lugar da string. Só esse arquivo muda.
- **Erro 429 / cota esgotada:** é o limite do plano gratuito. O agent responde com a mensagem de reserva e oferece um analista; aguarde a renovação da cota ou use outro modelo.

## Premissas e decisões que vale conhecer

- **Prazo reinicia a cada atualização** do chamado (o PRD diz que o prazo vale “para cada atualização”). Uma informação nova do funcionário também reinicia a contagem; o ideal seria só contar a resposta da equipe.
- **`aprovado` não corre SLA:** é um pedido já autorizado aguardando entrega.
- **Feriados** não entram no cálculo de horas úteis.
- **Caso crítico:** o funcionário confirma o rascunho, o chamado é criado e a conversa é transferida em seguida.
- **Login:** aceita qualquer senha para os funcionários de exemplo, como pede o PRD. Não é um mecanismo de autenticação real.
- **“Nova conversa”** encerra a anterior que estava só com o agent; é bloqueada enquanto há atendimento humano em andamento.

## Trade-offs

- **SQLite em uma instância.** Simples e suficiente para o desafio, mas não escala horizontalmente. O limitador por minuto é em memória (reinicia com a máquina); os orçamentos diários, não.
- **Polling no console e na conversa com analista** (3 a 5 s), em vez de SSE/WebSocket: menos código e mais robusto no deploy, com latência aceitável.
- **Busca da central por palavras**, sem embeddings: é barata, rápida e explicável na trilha; perde com sinônimos e paráfrases.
- **Decisão por intenção + regras**, em vez de um agente livre com ferramentas: menos flexível a pedidos inesperados, muito mais previsível e testável.
- **Container roda como root** para escrever no volume montado. Em produção de verdade eu ajustaria as permissões do volume e usaria um usuário sem privilégios.

## Uso de IA no desenvolvimento

O desafio permite e incentiva o uso de ferramentas de IA. Este projeto foi construído com apoio do Claude, em etapas (fundação, agent, interface do funcionário, console do analista, proteção e deploy), e cada etapa foi validada com testes automatizados.
