import { Icon, type IconName } from '../icons';

/*
 * Static placeholders shown blurred behind <AuthGate>'s lock card. Everything here is
 * hard-coded sample content: no hooks, no contract reads, no API calls, no focusable elements.
 */

const HEIRS = [
  { wallet: '0x8f3a…21c4', email: 'sam@example.com', share: '50.00%', amount: '2,500.00' },
  { wallet: '0x41be…9d07', email: 'alex@example.com', share: '30.00%', amount: '1,500.00' },
  { wallet: '0xc92d…6e18', email: 'jo@example.com', share: '20.00%', amount: '1,000.00' },
];

const ACTIVITY: [IconName, string, string][] = [
  ['heart', 'Checked in', '3 days ago'],
  ['heart', 'Checked in', '2 months ago'],
  ['shield', 'Vault created: 3 heirs, 180-day period', '5 months ago'],
];

export function VaultPreview() {
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="gate-h1">Your vault</div>
          <p className="muted">USDC, 3 heirs, 180-day period</p>
        </div>
        <span className="badge b-active">Active</span>
      </div>
      <div className="layout">
        <div className="main">
          <div className="timer">
            <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#3B3260' }}>Transfer starts in</div>
              <div className="count num">
                {[['142', 'days'], ['07', 'hours'], ['31', 'min'], ['12', 'sec']].map(([v, unit], i) => (
                  <div key={unit}>
                    <b style={i === 0 ? { color: '#9E2418' } : undefined}>{v}</b>
                    <span>{unit}</span>
                  </div>
                ))}
              </div>
              <div className="bar"><i style={{ width: '22%' }} /></div>
              <div><span className="btn btn-primary"><Icon name="heart" size={18} />I’m still here</span></div>
            </div>
          </div>
          <div className="grid-auto">
            {[['Wallet balance', '5,000.00 USDC'], ['Approved for Pulse', '5,000.00 USDC'], ['Heirs would receive today', '5,000.00 USDC']].map(([k, v]) => (
              <div className="card pad" key={k}>
                <span className="muted small">{k}</span>
                <span className="stat num">{v}</span>
              </div>
            ))}
          </div>
          <div className="card pad">
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 10 }}>Heirs</div>
            <table className="tbl">
              <thead>
                <tr><th>Wallet</th><th>Email</th><th className="r">Share</th><th className="r">Would receive</th></tr>
              </thead>
              <tbody>
                {HEIRS.map((h) => (
                  <tr key={h.wallet}>
                    <td data-label="Wallet" className="addr">{h.wallet}</td>
                    <td data-label="Email">{h.email}</td>
                    <td data-label="Share" className="r num">{h.share}</td>
                    <td data-label="Would receive" className="r num" style={{ fontWeight: 600 }}>{h.amount} USDC</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="side">
          <div className="card pad">
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Activity</div>
            <ul className="feed">
              {ACTIVITY.map(([icon, text, when], i) => (
                <li key={i}>
                  <span className="ic"><Icon name={icon} size={18} /></span>
                  <span>{text}</span>
                  <span className="end">{when}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreatePreview() {
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="gate-h1">Create a vault</div>
          <p className="muted">Three settings, two wallet signatures. You can revoke at any time.</p>
        </div>
      </div>
      <div className="layout">
        <div className="main">
          <div className="card pad">
            <div style={{ fontSize: 22, fontWeight: 600, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="badge b-active">1</span>Token and approval
            </div>
            <span className="lbl" style={{ marginTop: 18 }}>Amount Pulse may move (USDC)</span>
            <div className="field num" style={{ maxWidth: 360 }}>5,000</div>
            <div style={{ marginTop: 16 }}><span className="btn btn-ghost">Approve USDC</span></div>
          </div>
          <div className="card pad">
            <div style={{ fontSize: 22, fontWeight: 600, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="badge b-active">2</span>Silence before transfer
            </div>
            <div className="num" style={{ fontWeight: 700, letterSpacing: '-.04em', fontSize: 'clamp(44px, 12vw, 64px)', lineHeight: 1, color: 'var(--accent-ink)', marginTop: 16 }}>
              180 days
            </div>
          </div>
          <div className="card pad">
            <div style={{ fontSize: 22, fontWeight: 600, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="badge b-active">3</span>Heirs
            </div>
            {HEIRS.map((h) => (
              <div className="heir-row" key={h.wallet} style={{ marginTop: 14 }}>
                <div className="w"><span className="lbl">Wallet</span><div className="field addr">{h.wallet}</div></div>
                <div className="e"><span className="lbl">Email</span><div className="field">{h.email}</div></div>
                <div><span className="lbl">Share %</span><div className="field num">{h.share.replace('%', '')}</div></div>
                <div className="rm" />
              </div>
            ))}
          </div>
        </div>
        <div className="side">
          <div className="review">
            <div style={{ fontSize: 20, fontWeight: 600 }}>Review</div>
            <ul className="feed" style={{ marginTop: 8 }}>
              <li><span>Token</span><span className="end">USDC</span></li>
              <li><span>Period</span><span className="end">180 days</span></li>
              {HEIRS.map((h, i) => (
                <li key={h.wallet}><span>Heir {i + 1}</span><span className="end num">{h.amount}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
