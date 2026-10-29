# Nexo Assist

Assistente de atendimento do **service desk de TI** de uma empresa fictícia (a Nexo). O funcionário conversa com ele num chat, em vez de preencher formulário; quando precisa de uma pessoa, a conversa passa para um analista.

## O que ele faz

**Para o funcionário**
- Tira dúvidas usando a central de ajuda, sem abrir chamado.
- Mostra como está um chamado (mesmo sem o número) e avisa se o prazo venceu.
- Abre um chamado só conversando: pergunta o que falta, mostra um **rascunho** e só cria depois do "confirmar".
- Evita chamados duplicados: se o problema já existe, atualiza (ou reabre, se foi resolvido há até 7 dias).
- Chama um analista quando o funcionário pede, quando o caso é crítico, quando o chamado venceu ou quando o assistente não tem segurança.

**Para o analista (console)**
- Vê as conversas que precisam dele, com o resumo do caso e os chamados do funcionário.
- Assume o atendimento (o assistente fica pausado), responde, devolve ao assistente ou encerra.

**Transparência:** acima de cada resposta aparece o que o assistente fez ("consultou seus chamados", "classificou a prioridade"). Em **"Ver como decidi"** dá para ver o que ele entendeu, com que grau de segurança e por quê.

## Como funciona (em 4 passos)

1. **Entende** a mensagem (o modelo de IA decide a intenção e diz o quanto está seguro).
2. **Aplica as regras do service desk** em código: prioridade, prazo, duplicidade, privacidade e confirmação.
3. **Age** no sistema de chamados (simulado).
4. **Responde** em linguagem natural, mostrando cartões, rascunho e botões de resposta rápida.

Tecnologias: TypeScript · Next.js · Mastra · Google Gemini · SQLite.

## Como rodar

Você precisa de uma chave gratuita do [Google AI Studio](https://aistudio.google.com/apikey).

**Com Docker**

```bash
cp .env.docker.example .env      # cole a chave em GOOGLE_GENERATIVE_AI_API_KEY
docker compose up --build
```

**Sem Docker** (Node 22.13+)

```bash
npm install
cp .env.example .env             # cole a chave em GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

Abra **http://localhost:3000**. Os dados de exemplo são criados na primeira execução.

## Tutorial de teste

### Logins (qualquer senha serve)

| Perfil | E-mail |
| --- | --- |
| Funcionária (tem um chamado vencido) | `ana.souza@nexo.com.br` |
| Funcionária (tem um chamado resolvido há 4 dias) | `carla.mendes@nexo.com.br` |
| Analista | `rafael.lima@nexo.com.br` |

Dica: use **duas janelas** (uma delas anônima) para ver a funcionária e o analista ao mesmo tempo.

### Roteiro

Entre como **Ana** e escreva cada mensagem abaixo.

| # | O que escrever | O que deve acontecer |
| --- | --- | --- |
| 1 | `Qual o horário do service desk?` | Responde com a central de ajuda, **sem abrir chamado**. |
| 2 | `Como está o meu chamado do notebook?` | Mostra o chamado **INC-20311** com o prazo **vencido** e oferece "Falar com um analista". |
| 3 | `Meu notebook não conecta na VPN, erro 809` | Pergunta quem é afetado e se impede de trabalhar. Responda, por exemplo: `Só eu, e tenho reunião com cliente às 14h`. Aparece um **rascunho** com prioridade e prazo. Clique em **Confirmar**: o chamado é criado. |
| 4 | `Meu notebook continua lento` | Em vez de abrir outro, propõe **atualizar o INC-20311** (sem duplicar). |
| 5 | `Quando cai o meu 13º salário?` | Explica que não é assunto de TI e indica a área certa. |
| 6 | `Como está o chamado INC-20150?` | Diz que não encontrou: esse chamado é de outra pessoa (**privacidade**). |
| 7 | Clique em **Ver como decidi** em qualquer resposta | Abre o painel: o que entendeu, ação, confiança, motivo e passo a passo. |

Entre como **Carla** e escreva `A senha do SAP bloqueou de novo hoje`: o assistente propõe **reabrir o INC-20150** (resolvido há menos de 7 dias).

### Transferência para um analista

1. Como **Ana**, escreva `Quero falar com um analista`. A conversa fica **"Aguardando atendente"** e o assistente para de responder.
2. Na janela anônima, entre como **Rafael** (abre o console). A conversa aparece em **"Para você"**, com o resumo do caso.
3. Clique em **Assumir atendimento** e responda. A Ana vê a resposta em poucos segundos.
4. Use **Devolver ao agent** (o assistente volta a responder) ou **Encerrar atendimento**.

### Começar do zero

```bash
npm run db:reset                 # sem Docker
docker compose down -v           # com Docker
```

## Comandos úteis

| Comando | Para quê |
| --- | --- |
| `npm test` | roda os testes (sem internet e sem gastar cota) |
| `npm run typecheck` | confere os tipos |
| `npm run chat` | conversa com o assistente pelo terminal |
| `npm run eval` | avalia o assistente com o modelo real em 14 casos |

## Problemas comuns

- **"Falta GOOGLE_GENERATIVE_AI_API_KEY"**: preencha a chave no `.env`.
- **"Modelo não disponível"**: o Google troca os modelos disponíveis; atualize `NEXO_DECIDER_MODEL` e `NEXO_RESPONDER_MODEL` no `.env` (padrão: `google/gemini-3.8-flash`).
- **Erro de cota (429)**: é o limite do plano gratuito; o assistente avisa e oferece um analista. Aguarde ou troque de modelo.

## Para quem avalia

O detalhamento técnico está em **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**:

- [Arquitetura](docs/ARQUITETURA.md#arquitetura)
- [Como o agent decide o que fazer](docs/ARQUITETURA.md#como-o-agent-decide-o-que-fazer)
- [Como garanti a qualidade das decisões](docs/ARQUITETURA.md#como-garanti-a-qualidade-das-decisões)
- [Segurança e privacidade](docs/ARQUITETURA.md#segurança-e-privacidade) · [Modelo e custo](docs/ARQUITETURA.md#escolha-do-modelo-e-custo-por-conversa) · [Deploy](docs/ARQUITETURA.md#deploy)
- [Trade-offs](docs/ARQUITETURA.md#trade-offs) · [O que eu faria com mais tempo](docs/ARQUITETURA.md#o-que-eu-faria-com-mais-tempo)
