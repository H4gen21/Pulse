import { Hero } from '@/components/home/Hero';
import { FeatureRail } from '@/components/home/FeatureRail';
import { SplitCalculator } from '@/components/home/SplitCalculator';
import { RevealObserver } from '@/components/home/Reveal';
import { CanCant, Faq, HowItWorks, PeaceOfMind, Rules } from '@/components/home/Sections';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <PeaceOfMind />
      <FeatureRail />
      <HowItWorks />
      <Rules />
      <CanCant />
      <SplitCalculator />
      <Faq />
      <RevealObserver />
    </main>
  );
}
