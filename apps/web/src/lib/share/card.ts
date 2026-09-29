/** Draws a 1080×1080 share image (WhatsApp/Facebook friendly) on a canvas. */
export async function makeShareCard(opts: {
  title: string;
  line: string;
  footer: string;
  icon: string;
}): Promise<Blob> {
  const size = 1080;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  try {
    await Promise.all([
      document.fonts.load('700 72px "Noto Sans Bengali"'),
      document.fonts.load('400 44px "Noto Sans Bengali"'),
    ]);
  } catch {
    /* fall back to system font */
  }
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#047857");
  g.addColorStop(1, "#064e3b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(size * 0.85, size * 0.15, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = '160px "Noto Color Emoji", "Apple Color Emoji", sans-serif';
  ctx.fillText(opts.icon, size / 2, 330);

  ctx.font = '700 72px "Noto Sans Bengali", sans-serif';
  wrap(ctx, opts.title, size / 2, 480, size - 160, 92);
  ctx.font = '400 44px "Noto Sans Bengali", sans-serif';
  ctx.fillStyle = "#d1fae5";
  wrap(ctx, opts.line, size / 2, 700, size - 180, 62);

  ctx.fillStyle = "#fff";
  ctx.font = '700 40px "Noto Sans Bengali", sans-serif';
  ctx.fillText(opts.footer, size / 2, size - 80);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lh: number) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
