// Fondo animado del panel de marca del login: red de partículas conectadas
// con líneas, y líneas al cursor. Adaptado del patrón de fondo.html a:
//  · escalarse al tamaño del PANEL (no a la ventana) y a devicePixelRatio;
//  · tintarse con el teal de marca en vez de blanco;
//  · pausarse cuando el login no está visible (ahorra CPU tras iniciar sesión);
//  · respetar prefers-reduced-motion (dibuja un único frame estático).

const DOT = 'rgba(150,235,225,';    // partículas (teal claro)
const LINE = 'rgba(90,220,210,';    // líneas entre partículas
const MOUSE = 'rgba(120,235,225,';  // líneas al cursor (algo más brillantes)
const CFG = { maxDistance: 130, mouseRadius: 160 };

export function initLoginBg() {
  const panel = document.querySelector('.lg-brand');
  const canvas = document.getElementById('loginCanvas');
  if (!panel || !canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let particles = [];
  let w = 0, h = 0;
  let raf = null;
  const mouse = { x: null, y: null };

  function newParticle() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 1.8 + 1.2,
      sx: (Math.random() - 0.5) * 0.5,
      sy: (Math.random() - 0.5) * 0.5,
    };
  }

  function resize() {
    const r = panel.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Densidad proporcional al área del panel, acotada por rendimiento.
    const target = Math.min(90, Math.max(28, Math.round((w * h) / 13000)));
    particles = [];
    for (let i = 0; i < target; i++) particles.push(newParticle());
    return true;
  }

  function step(animate) {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      if (animate) {
        p.x += p.sx; p.y += p.sy;
        if (p.x < 0 || p.x > w) p.sx = -p.sx;
        if (p.y < 0 || p.y > h) p.sy = -p.sy;
      }
      ctx.fillStyle = DOT + '0.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let a = 0; a < particles.length; a++) {
      for (let b = a + 1; b < particles.length; b++) {
        const dx = particles[a].x - particles[b].x;
        const dy = particles[a].y - particles[b].y;
        const dist = Math.hypot(dx, dy);
        if (dist < CFG.maxDistance) {
          const o = (1 - dist / CFG.maxDistance) * 0.18;
          ctx.strokeStyle = LINE + o.toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.stroke();
        }
      }
      if (mouse.x !== null) {
        const dxm = particles[a].x - mouse.x;
        const dym = particles[a].y - mouse.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < CFG.mouseRadius) {
          const o = (1 - dm / CFG.mouseRadius) * 0.28;
          ctx.strokeStyle = MOUSE + o.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
    }
  }

  function loop() { step(true); raf = requestAnimationFrame(loop); }
  function start() {
    if (raf != null) return;
    if (!w || !h) { if (!resize()) return; }
    if (reduce) { step(false); return; } // reduced-motion: un frame estático
    loop();
  }
  function stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } }

  panel.addEventListener('mousemove', (e) => {
    const r = panel.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  panel.addEventListener('mouseleave', () => { mouse.x = null; mouse.y = null; });
  window.addEventListener('resize', () => {
    if (raf == null && !reduce) return; // no visible: no recalcula en balde
    if (resize() && reduce) step(false);
  });

  // Arranca solo cuando el panel está visible (login mostrado); pausa si no.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((en) => en.isIntersecting);
      if (visible) { resize(); start(); } else { stop(); }
    });
    io.observe(panel);
  } else {
    resize(); start();
  }
}
