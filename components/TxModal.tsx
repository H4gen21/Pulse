'use client';
import { chain } from '@/lib/chain';
import { txUrl } from '@/lib/explorer';
import type { TxFlow } from '@/hooks/useTxFlow';
import { Modal } from './Modal';
import { Icon } from './icons';

const PHASE_TEXT = {
  idle: '',
  wallet: 'Confirm in your wallet…',
  confirming: `Waiting for confirmation on ${chain.name}…`,
  finishing: 'Confirmed. Finishing up…',
  success: 'Done.',
  error: '',
} as const;

/** Pending → confirming → success / error for a useTxFlow, with a BaseScan link per tx. */
export function TxModal({ flow, title }: { flow: TxFlow; title: string }) {
  const step = flow.steps[flow.index];
  const total = flow.steps.length;
  return (
    <Modal open={flow.open} onClose={flow.close} title={flow.phase === 'success' ? `${title}: done` : title}>
      <div className="tx-body" aria-live="polite" aria-atomic="true">
        {flow.busy && <div className="spinner" aria-hidden="true" />}
        {flow.phase === 'success' && (
          <div className="tx-ok" aria-hidden="true">
            <Icon name="check" size={28} />
          </div>
        )}
        {step && flow.phase !== 'success' && (
          <p className="tx-step">
            {total > 1 && <span className="muted">Step {flow.index + 1} of {total}: </span>}
            {step.label}
          </p>
        )}
        {flow.phase !== 'error' && <p className="muted">{PHASE_TEXT[flow.phase]}</p>}
        {step?.detail && flow.busy && <p className="muted small">{step.detail}</p>}
        {flow.phase === 'error' && (
          <p className="tx-error" role="alert">
            {flow.error}
          </p>
        )}
      </div>
      {flow.hashes.length > 0 && (
        <ul className="tx-links">
          {flow.hashes.map((h, i) => (
            <li key={h}>
              <a href={txUrl(h)} target="_blank" rel="noreferrer">
                {total > 1 ? `Transaction ${i + 1}` : 'Transaction'} on BaseScan
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions">
        {flow.phase === 'error' && (
          <button className="btn btn-primary" type="button" onClick={() => flow.retry()}>
            Try again
          </button>
        )}
        <button className="btn btn-ghost" type="button" onClick={flow.close}>
          {flow.busy ? 'Hide' : 'Close'}
        </button>
      </div>
      {flow.busy && <p className="muted small center">You can hide this; the transaction keeps going.</p>}
    </Modal>
  );
}
