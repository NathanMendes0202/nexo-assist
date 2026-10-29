import type { TraceStep } from '../domain/conversation';
import { AlertIcon, CheckIcon, CrossIcon } from './icons';
import { percent } from './format';
import { INTENT_LABEL, OUTCOME_LABEL, STEP_TITLE } from './labels';
import type { ClientMessage } from './types';

const clock = (iso: string): string => {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

function StepItem({ step }: { step: TraceStep }) {
  return (
    <li className="tl-item">
      <span className={`tl-ico ${step.status}`}>
        {step.status === 'ok' ? <CheckIcon size={12} /> : <AlertIcon size={12} />}
      </span>
      <div>
        <div className="tl-title">
          {STEP_TITLE[step.kind] ?? step.label}
          <small>{clock(step.at)}{step.visible ? '' : ' · interno'}</small>
        </div>
        <p className="tl-detail">{step.detail}</p>
        {step.data !== undefined ? (
          <details className="tl-data">
            <summary>Ver dados</summary>
            <pre>{JSON.stringify(step.data, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Painel de transparência: o que o assistente entendeu, o que fez, com que segurança e por quê.
 * Tudo vem da trilha (TurnTrace) gravada junto com a resposta.
 */
export function DecisionPanel({
  message,
  threshold,
  onClose,
}: {
  message: ClientMessage | null;
  threshold: number;
  onClose: () => void;
}) {
  const trace = message?.trace ?? null;
  const confidence = trace ? percent(trace.confidence) : 0;
  const level = confidence < percent(threshold) ? 'low' : confidence < 85 ? 'mid' : '';

  return (
    <aside className="panel" aria-label="Como o assistente decidiu">
      <div className="panel-head">
        <h2>Como decidi</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar painel">
          <CrossIcon />
        </button>
      </div>
      <div className="panel-body">
        {!trace ? (
          <p className="panel-empty">Escolha uma resposta do assistente para ver o que ele entendeu e por que fez o que fez.</p>
        ) : (
          <>
            <section className="sec">
              <h3>O que entendi</h3>
              <p>{trace.understanding || 'Não cheguei a interpretar a mensagem.'}</p>
            </section>

            <section className="sec">
              <h3>O que fiz</h3>
              <div className="pair">
                <span className="tag">{INTENT_LABEL[trace.intent] ?? trace.intent}</span>
              </div>
              <p>{OUTCOME_LABEL[trace.outcome]}</p>
            </section>

            <section className="sec">
              <h3>Grau de segurança</h3>
              <div className="meter" role="img" aria-label={`Confiança de ${confidence}%`}>
                <div className={`meter-fill ${level}`} style={{ width: `${confidence}%` }} />
                <div className="meter-mark" style={{ left: `${percent(threshold)}%` }} title="Mínimo para decidir sozinho" />
              </div>
              <div className="meter-legend">
                <span>
                  Confiança <b>{confidence}%</b>
                </span>
                <span>Mínimo para decidir sozinho: {percent(threshold)}%</span>
              </div>
            </section>

            <section className="sec">
              <h3>Por quê</h3>
              <p>{trace.reasoning}</p>
            </section>

            {trace.overrides.length > 0 ? (
              <section className="sec">
                <h3>Regras do service desk aplicadas</h3>
                {trace.overrides.map((o) => (
                  <div className="rule-item" key={o}>
                    {o}
                  </div>
                ))}
              </section>
            ) : null}

            <section className="sec">
              <h3>Passo a passo</h3>
              <ol className="timeline">
                {trace.steps.map((s, i) => (
                  <StepItem key={`${s.kind}-${i}`} step={s} />
                ))}
              </ol>
            </section>

            <section className="sec">
              <h3>Modelos e tempo</h3>
              <div className="stats">
                <div className="stat">
                  <span>Decisão</span>
                  <b>{trace.models.decider?.model.replace(/^[^/]+\//, '') ?? '—'}</b>
                </div>
                <div className="stat">
                  <span>Resposta</span>
                  <b>{trace.models.responder?.model.replace(/^[^/]+\//, '') ?? 'texto fixo'}</b>
                </div>
                <div className="stat">
                  <span>Tokens (decisão)</span>
                  <b>
                    {trace.models.decider?.inputTokens ?? '—'} entrada / {trace.models.decider?.outputTokens ?? '—'} saída
                  </b>
                </div>
                <div className="stat">
                  <span>Tempo total</span>
                  <b>{(trace.durationMs / 1000).toFixed(1)} s</b>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
