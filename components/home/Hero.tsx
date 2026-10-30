'use client';
import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';
import { Icon } from '../icons';
import { prefersReducedMotion } from './Reveal';

const Spark = ({ size, stroke }: { size: number; stroke: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2v20M2 12h20" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
  </svg>
);

const at = (style: CSSProperties & { '--d'?: string }) => style as CSSProperties;

export function Hero() {
  const ref = useRef<HTMLElement>(null);

  // Pointer parallax: floating shapes drift by --d toward the pointer. Off for reduced motion and touch.
  useEffect(() => {
    const hero = ref.current;
    if (!hero || prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return;
    const move = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    const leave = () => {
      hero.style.setProperty('--mx', '0');
      hero.style.setProperty('--my', '0');
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
    };
  }, []);

  return (
    <div className="wrap">
      <section className="hero-card" ref={ref} aria-labelledby="hero-title">
        <div className="float f-coin" style={at({ right: '7%', top: '12%', '--d': '-18px' })} aria-hidden="true">
          <div className="coin">
            <svg width="120" height="70" viewBox="0 0 120 70">
              <path d="M4 38h24l7-16 11 30 10-40 7 26h53" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="float" style={at({ left: '5%', bottom: '8%', '--d': '14px' })} aria-hidden="true">
          <div className="ticket" style={{ rotate: '-12deg' }}>34%</div>
        </div>
        <div className="float" style={at({ right: '8%', bottom: '6%', '--d': '10px' })} aria-hidden="true">
          <div className="ticket lav" style={{ rotate: '8deg', animationDelay: '-3s' }}>60 days</div>
        </div>
        <div className="float" style={at({ left: '16%', top: '14%', '--d': '22px' })} aria-hidden="true">
          <span className="spark twinkle" style={{ display: 'block' }}><Spark size={28} stroke={2} /></span>
        </div>
        <div className="float" style={at({ right: '30%', top: '10%', '--d': '8px' })} aria-hidden="true">
          <span className="spark twinkle" style={{ display: 'block', animationDelay: '-1.2s' }}><Spark size={18} stroke={2.4} /></span>
        </div>
        <div className="hero-inner">
          <p className="hero-kicker">Inheritance on autopilot</p>
          <h1 id="hero-title">Your crypto reaches your family, even if you can’t</h1>
          <Link className="btn btn-hero" href="/vault/create">
            <Icon name="shield" size={22} />
            Set up a vault
          </Link>
        </div>
      </section>
    </div>
  );
}
