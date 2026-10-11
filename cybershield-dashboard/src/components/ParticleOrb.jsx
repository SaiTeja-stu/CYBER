import { useEffect, useRef } from 'react';

/**
 * A slowly rotating cloud of green points shaped like a two-lobed brain. Follows the pointer a little.
 * Canvas 2D, additive blending; point count drops on small screens.
 */
export default function ParticleOrb({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = window.innerWidth < 768 ? 1300 : 3000;

    // Fibonacci sphere with folded "cortex" ridges, split into two hemispheres.
    const pts = [];
    const golden = Math.PI * (1 + Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const k = i + 0.5;
      const phi = Math.acos(1 - (2 * k) / N);
      const theta = golden * k;
      let x = Math.sin(phi) * Math.cos(theta);
      let y = Math.cos(phi);
      let z = Math.sin(phi) * Math.sin(theta);
      const fold = 1 + 0.1 * Math.sin(7 * theta + 3 * phi) * Math.cos(4 * phi) + 0.045 * Math.sin(13 * phi + theta);
      x *= fold * 1.18;
      y *= fold * 0.92;
      z *= fold * 0.98;
      x += (x >= 0 ? 1 : -1) * 0.08; // gap between the hemispheres
      pts.push({ x, y, z, s: 0.8 + Math.random() * 1.4, a: 0.5 + Math.random() * 0.5, tw: Math.random() * 6.28 });
    }

    let w = 0;
    let h = 0;
    let raf = 0;
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;

    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const onMove = (e) => {
      const r = cv.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    // colours follow the theme accent; additive blending only glows on a dark page
    const readTheme = () => {
      const root = document.documentElement;
      const rgb = getComputedStyle(root).getPropertyValue('--accent').trim().split(/\s+/).join(',') || '255,107,0';
      return { rgb, dark: root.dataset.theme === 'dark' };
    };
    let theme = readTheme();
    const themeObs = new MutationObserver(() => { theme = readTheme(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const t0 = performance.now();
    const draw = (now) => {
      const t = reduce ? 0 : (now - t0) / 1000;
      mx += (tx - mx) * 0.04;
      my += (ty - my) * 0.04;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.4;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `rgba(${theme.rgb},${theme.dark ? 0.2 : 0.12})`);
      g.addColorStop(0.5, `rgba(${theme.rgb},${theme.dark ? 0.07 : 0.04})`);
      g.addColorStop(1, `rgba(${theme.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const ry = t * 0.18 + mx * 0.6;
      const rx = -0.22 + my * 0.35 + Math.sin(t * 0.3) * 0.08;
      const cyw = Math.cos(ry);
      const syw = Math.sin(ry);
      const cxw = Math.cos(rx);
      const sxw = Math.sin(rx);
      const breathe = 1 + Math.sin(t * 0.9) * 0.025;

      // near dots take the strong colour, far dots fade into the accent
      const [ar, ag, ab] = theme.rgb.split(',').map(Number);
      const [nr, ng, nb] = theme.dark ? [235, 255, 240] : [17, 20, 19];
      const palette = [0, 1, 2, 3].map((i) => {
        const k = i / 3;
        return `rgb(${Math.round(nr + (ar - nr) * k)},${Math.round(ng + (ag - ng) * k)},${Math.round(nb + (ab - nb) * k)})`;
      });

      ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
      for (const p of pts) {
        const x1 = p.x * cyw + p.z * syw;
        const z1 = -p.x * syw + p.z * cyw;
        const y2 = p.y * cxw - z1 * sxw;
        const z2 = p.y * sxw + z1 * cxw;
        // slow ripple travelling around the surface
        const wave = 1 + 0.05 * Math.sin(p.y * 5 - t * 1.6) * Math.cos(p.x * 3 + t * 0.7);
        const persp = 1 / (1 + z2 * 0.35);
        const near = 1 - (z2 + 1.4) / 2.8;
        const r = R * persp * breathe * wave;
        const size = p.s * (0.5 + near * 1.6) * dpr * 0.9;
        ctx.fillStyle = palette[Math.min(3, Math.max(0, Math.round((1 - near) * 3)))];
        ctx.globalAlpha = Math.min(1, p.a * (0.18 + 0.95 * near) * (0.75 + 0.25 * Math.sin(t * 2 + p.tw)));
        ctx.fillRect(cx + x1 * r, cy + y2 * r, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      themeObs.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className}`} />;
}
