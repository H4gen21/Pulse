'use client';
import { useRef, type KeyboardEvent } from 'react';
import { Icon } from '../icons';
import { prefersReducedMotion } from './Reveal';

const Star = ({ style, size }: { style: React.CSSProperties; size: number }) => (
  <svg className="twinkle" style={{ position: 'absolute', color: '#AB9FF2', ...style }} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z" fill="currentColor" />
  </svg>
);

export function FeatureRail() {
  const rail = useRef<HTMLDivElement>(null);

  const scroll = (dir: number) => {
    const el = rail.current;
    const card = el?.querySelector<HTMLElement>('.fcard');
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 24;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + gap), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') (e.preventDefault(), scroll(1));
    if (e.key === 'ArrowLeft') (e.preventDefault(), scroll(-1));
  };

  return (
    <section style={{ paddingBottom: 90 }} aria-labelledby="rail-title">
      <div className="wrap">
        <div className="rail-head">
          <h2 id="rail-title" className="h2" style={{ maxWidth: '14em' }}>
            Everything a dead man’s switch should do
          </h2>
          <div className="rail-ctrl">
            <button className="round" type="button" onClick={() => scroll(-1)} aria-label="Previous cards" aria-controls="rail">
              <Icon name="left" strokeWidth={2.2} />
            </button>
            <button className="round" type="button" onClick={() => scroll(1)} aria-label="Next cards" aria-controls="rail">
              <Icon name="right" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div
          className="rail"
          id="rail"
          ref={rail}
          role="region"
          aria-roledescription="carousel"
          aria-label="Pulse features. Use the left and right arrow keys to scroll."
          tabIndex={0}
          onKeyDown={onKey}
        >
          <article className="fcard c-lav reveal">
            <h3>Set it once. Your funds never leave your wallet.</h3>
            <div className="art" aria-hidden="true">
              <div className="phone">
                <div className="toastpill">
                  <span className="okdot"><Icon name="check" /></span>Approved 5,000 USDC
                </div>
                <div style={{ textAlign: 'center', padding: '44px 0 26px' }}>
                  <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1 }}>
                    <span style={{ fontSize: 28, verticalAlign: 'top' }}>$</span>3,240
                  </div>
                  <div style={{ color: '#9D97B5', marginTop: 10 }}>still in your wallet</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: '#9D97B5' }}>
                  <span>Pulse can move</span>
                  <span>up to 5,000 USDC</span>
                </div>
              </div>
            </div>
          </article>

          <article className="fcard c-dark reveal">
            <h3>Check in with one tap. Your timer starts over.</h3>
            <div className="art" style={{ alignItems: 'center', position: 'relative' }} aria-hidden="true">
              <Star style={{ left: '18%', top: '20%' }} size={26} />
              <Star style={{ right: '20%', top: '34%', animationDelay: '-1s' }} size={16} />
              <Star style={{ left: '28%', bottom: '22%', animationDelay: '-1.8s' }} size={18} />
              <div className="tile">
                <svg width="100" height="60" viewBox="0 0 100 60">
                  <path className="beat" d="M4 32h18l6-14 9 26 8-36 6 22h45" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', color: '#B5AECF', fontSize: 15 }}>
                “I’m still here” resets 60 to 730 days
              </div>
            </div>
          </article>

          <article className="fcard c-grey reveal">
            <h3>Heirs get paid automatically when time runs out.</h3>
            <div className="art" style={{ position: 'relative', alignItems: 'center' }} aria-hidden="true">
              <span className="tk" style={{ background: '#B7EBCF', color: '#14352A', left: '4%', top: '8%', rotate: '-14deg' }}>50%</span>
              <span className="tk" style={{ background: '#E6E0FD', color: '#2B2347', right: '2%', top: '30%', rotate: '10deg' }}>30%</span>
              <span className="tk" style={{ background: '#D7D4E0', color: '#2B2347', left: '10%', bottom: '6%', rotate: '8deg' }}>20%</span>
              <div style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--accent)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1E173A' }}>
                  <Icon name="check" size={34} strokeWidth={2.6} />
                </div>
                <div style={{ fontSize: 'clamp(56px, 12vw, 84px)', fontWeight: 700, letterSpacing: '-.05em', lineHeight: 1 }}>
                  <span style={{ fontSize: '0.48em', verticalAlign: 'top' }}>$</span>1,620
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>Sent to heir 1</div>
              </div>
            </div>
          </article>

          <article className="fcard c-mint reveal">
            <h3>Anyone can verify a vault. Emails stay private.</h3>
            <div className="art" aria-hidden="true">
              <div style={{ width: 'min(340px, 100%)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 24, padding: 22, boxShadow: '0 24px 50px rgba(20,60,40,.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="addr">0x71C4…9A3F</span>
                  <span className="badge b-active">Active</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18, fontSize: 14 }}>
                  <div><span className="muted">Period</span><div style={{ fontWeight: 700, fontSize: 18 }}>180 days</div></div>
                  <div><span className="muted">Heirs</span><div style={{ fontWeight: 700, fontSize: 18 }}>3 wallets</div></div>
                </div>
                <div style={{ marginTop: 16, height: 10, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <i style={{ display: 'block', width: '7%', height: '100%', background: 'var(--accent)' }} />
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
