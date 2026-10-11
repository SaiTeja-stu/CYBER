import { useEffect, useRef } from 'react';

/**
 * Fixed ambient background: a soft accent glow top and bottom, two slow light beams and a few drifting
 * particles. Colours follow the theme's --accent. Purely decorative, pointer-events none.
 */
export default function Aurora() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = window.innerWidth < 768 ? 40 : 80;
    const dots = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.4,
      v: 0.006 + Math.random() * 0.018,
      a: 0.12 + Math.random() * 0.4,
      p: Math.random() * 6.28,
    }));

    const readAccent = () => {
      const root = document.documentElement;
      const rgb = getComputedStyle(root).getPropertyValue('--accent').trim().split(/\s+/).join(',') || '255,107,0';
      const dark = root.dataset.theme === 'dark';
      return { rgb: dark ? rgb : '17,20,19', dim: dark ? 1 : 0.45 };
    };
    let accent = readAccent();
    const obs = new MutationObserver(() => { accent = readAccent(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        if (!reduce) {
          d.y -= d.v * dt * 6;
          d.p += dt;
          if (d.y < -0.02) {
            d.y = 1.02;
            d.x = Math.random();
          }
        }
        const tw = 0.6 + 0.4 * Math.sin(d.p * 1.4);
        ctx.fillStyle = `rgba(${accent.rgb}, ${d.a * tw * accent.dim})`;
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r, 0, 6.283);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 46% at 50% -10%, rgb(var(--accent) / 0.14), transparent 70%), radial-gradient(60% 40% at 50% 112%, rgb(var(--accent) / 0.10), transparent 70%)',
        }}
      />
      <div className="beam beam-top" />
      <div className="beam beam-bottom" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
