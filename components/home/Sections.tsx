import { Icon, MarkInline } from '../icons';

export function PeaceOfMind() {
  return (
    <section className="band">
      <div className="wrap">
        <h2 className="display reveal">
          Peace of mind
          <br />
          for <MarkInline /> everyone
        </h2>
        <p className="muted center reveal" style={{ fontSize: 20, maxWidth: '34em', margin: '24px auto 0' }}>
          No custody, no lawyers, no seed phrases in a drawer. Just a timer your wallet resets.
        </p>
        <div className="center reveal" style={{ marginTop: 32 }}>
          <a className="btn btn-soft" href="#how">
            See how it works <Icon name="arrowUpRight" size={18} strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ['Approve a token', 'Let the Pulse contract move up to an amount you pick. Your tokens stay in your wallet.'],
  ['Name your heirs', 'Up to 10 wallets, split to exactly 100%. Heirs with an email get one notice when setup is done.'],
  ['Check in now and then', 'One tap on “I’m still here” restarts your timer. Any period from 60 to 730 days.'],
  ['Transfer runs itself', 'When the timer runs out, Chainlink Automation pays each heir and emails the ones you listed.'],
];

export function HowItWorks() {
  return (
    <section className="band" id="how" style={{ background: 'var(--surface-2)' }}>
      <div className="wrap">
        <h2 className="h2 reveal">How it works</h2>
        <ol className="steps">
          {STEPS.map(([title, body], i) => (
            <li className="reveal" key={title}>
              <span className="n" aria-hidden="true">{i + 1}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Rules() {
  const rules = [
    ['60–730', 'days of silence before transfer'],
    ['100.00%', 'shares must add up exactly'],
    ['10', 'heirs maximum per vault'],
    ['0', 'custody before the transfer'],
  ];
  return (
    <section className="band" style={{ paddingBottom: 0 }}>
      <div className="wrap">
        <h2 className="h2 reveal">Rules the contract enforces</h2>
        <div className="rules">
          {rules.map(([big, small]) => (
            <div className="reveal" key={big}>
              <b>{big}</b>
              <span className="muted">{small}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CanCant() {
  const can = [
    'Move the token you approved, only after your deadline passes',
    'Move no more than your approval or your balance, whichever is smaller',
    'Pay only the wallets you set, in the shares you set',
  ];
  const cant = [
    'Hold your funds at any point before the transfer',
    'Touch any other token in your wallet',
    'Let anyone but you change or cancel your heirs, including us',
  ];
  return (
    <section style={{ padding: '0 0 110px' }}>
      <div className="wrap">
        <div className="two">
          <div className="card pad reveal">
            <h3 style={{ fontSize: 22, fontWeight: 600 }}>The contract can</h3>
            <ul className="list-check">
              {can.map((t) => (
                <li key={t}>
                  <span style={{ color: 'var(--ok)' }}><Icon name="check" strokeWidth={2.2} /></span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card pad reveal">
            <h3 style={{ fontSize: 22, fontWeight: 600 }}>The contract can’t</h3>
            <ul className="list-check">
              {cant.map((t) => (
                <li key={t}>
                  <span style={{ color: 'var(--pulse)' }}><Icon name="x" strokeWidth={2.2} /></span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  ['Will Pulse remind me to check in?', 'No. Pulse only emails your heirs: once at setup and once at transfer. Set a recurring calendar reminder shorter than your period.'],
  ['What if one heir’s wallet can’t receive tokens?', 'The transfer for your whole vault stops and the vault is deactivated. Nothing leaves your wallet, and you can set up a new vault with a different wallet for that heir.'],
  ['Can I change my heirs later?', 'Not in place. Revoke the vault and create a new one. Only your wallet can do either.'],
  ['How do I cancel?', 'Revoke the vault from your dashboard, then set your token approval back to zero. The dashboard does both in order.'],
];

export function Faq() {
  return (
    <section style={{ paddingBottom: 110 }}>
      <div className="wrap">
        <h2 className="h2 center reveal">Questions</h2>
        <div className="faq">
          {FAQS.map(([q, a]) => (
            <details className="reveal" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
