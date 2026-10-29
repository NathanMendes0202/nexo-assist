#!/bin/sh
set -e

# O AI Studio chama a chave de GEMINI_API_KEY; o Mastra lê GOOGLE_GENERATIVE_AI_API_KEY.
if [ -z "$GOOGLE_GENERATIVE_AI_API_KEY" ] && [ -n "$GEMINI_API_KEY" ]; then
  GOOGLE_GENERATIVE_AI_API_KEY="$GEMINI_API_KEY"
  export GOOGLE_GENERATIVE_AI_API_KEY
fi

# Exige a chave do(s) provedor(es) dos modelos configurados.
missing=""
for model in "${NEXO_DECIDER_MODEL:-google/gemini-3.8-flash}" "${NEXO_RESPONDER_MODEL:-google/gemini-3.8-flash}"; do
  case "$model" in
    google/*)    [ -n "$GOOGLE_GENERATIVE_AI_API_KEY" ] || missing="$missing GOOGLE_GENERATIVE_AI_API_KEY" ;;
    anthropic/*) [ -n "$ANTHROPIC_API_KEY" ]            || missing="$missing ANTHROPIC_API_KEY" ;;
    openai/*)    [ -n "$OPENAI_API_KEY" ]               || missing="$missing OPENAI_API_KEY" ;;
  esac
done
if [ -n "$missing" ]; then
  echo "ERRO: falta definir:$missing (ex.: docker run -e GOOGLE_GENERATIVE_AI_API_KEY=... ou o arquivo .env do docker compose)." >&2
  exit 1
fi

# Para testes: se ninguém definiu SESSION_SECRET, gera um aleatório neste container.
# (As sessões de login deixam de valer quando o container é recriado.)
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  export SESSION_SECRET
  echo "Aviso: SESSION_SECRET não definido; usando um valor aleatório para esta execução." >&2
fi

exec "$@"
