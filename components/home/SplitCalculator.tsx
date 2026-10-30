'use client';
import { useId, useState } from 'react';
import { equalBps, formatAmount, parseAmount, splitAmount } from '@/lib/split';

/** "Try the split": equal heirs, same integer math as the contract (dust to the last heir). */
export function SplitCalculator() {
  const [amount, setAmount] = useState('100');
  const [n, setN] = useState(3);
  const id = useId();
  const total = parseAmount(amount);
  const parts = total === null ? [] : splitAmount(total, equalBps(n));

  return (
    <section style={{ paddingBottom: 110 }} aria-labelledby={`${id}-t`}>
      <div className="wrap">
        <div className="fcard c-dark reveal" style={{ minHeight: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 32 }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 id={`${id}-t`} className="h2">Try the split</h2>
            <p style={{ marginTop: 14, color: '#B5AECF', maxWidth: '28em', fontSize: 18 }}>
              Blockchains can’t store fractions, so shares are whole numbers. Whatever can’t divide evenly goes to the
              last heir. Nothing is lost.
            </p>
          </div>
          <div className="card pad" style={{ flex: '1 1 380px', minWidth: 0, color: 'var(--ink)' }}>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <label className="lbl" htmlFor={`${id}-amt`}>Amount (USDC)</label>
                <input
                  className="field num"
                  id={`${id}-amt`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  aria-invalid={total === null}
                  aria-describedby={`${id}-out`}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="lbl" htmlFor={`${id}-n`}>Equal heirs</label>
                <select className="field" id={`${id}-n`} value={n} onChange={(e) => setN(Number(e.target.value))}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            </div>
            <ul className="feed" id={`${id}-out`} style={{ marginTop: 12 }} aria-live="polite">
              {total === null ? (
                <li><span className="muted">Enter a number like 100 or 2,500.50 (up to 6 decimals)</span></li>
              ) : (
                parts.map((a, i) => (
                  <li key={i}>
                    <span className="ic">{i + 1}</span>
                    <span>
                      Heir {i + 1}
                      {i === n - 1 && n > 1 && <span className="badge b-active" style={{ marginLeft: 6 }}>gets the leftover</span>}
                    </span>
                    <span className="end num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatAmount(a)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
