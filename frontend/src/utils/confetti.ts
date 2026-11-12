// Zero-dependency, lightweight, 60fps canvas confetti explosion utility
export function triggerCelebration(originX = 0.5, originY = 0.6) {
  if (typeof window === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    document.body.removeChild(canvas);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  // Modern celebration palette matching Rose, Mint, Sky and Amber tones
  const colors = [
    '#e11d48', '#f43f5e', '#fb7185', // Rose
    '#059669', '#10b981', '#34d399', // Mint
    '#0284c7', '#38bdf8', '#7dd3fc', // Sky
    '#f59e0b', '#fbbf24', '#fef08a', // Amber/Gold
    '#8b5cf6', '#a78bfa'             // Violet
  ];

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    wobble: number;
    wobbleSpeed: number;
    opacity: number;
  }

  const particleCount = 75;
  const particles: Particle[] = [];
  const startX = width * originX;
  const startY = height * originY;

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.random() * 360 * Math.PI) / 180;
    const speed = Math.random() * 12 + 6;
    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6, // upward burst
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.random() * 0.1 + 0.05,
      opacity: 1
    });
  }

  const startTime = Date.now();
  const duration = 2400; // ms

  function animate() {
    if (!ctx) return;
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      if (document.body.contains(canvas)) {
        document.body.removeChild(canvas);
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.98; // air resistance
      p.rotation += p.rotationSpeed;
      p.wobble += p.wobbleSpeed;
      p.opacity = Math.max(0, 1 - elapsed / duration);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      // Draw slight oval/ribbon confetti
      const w = p.size * Math.cos(p.wobble);
      const h = p.size * 1.4;
      ctx.fillRect(-w / 2, -h / 2, Math.abs(w), h);
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
