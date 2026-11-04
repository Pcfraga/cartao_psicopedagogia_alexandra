import type { ProjectValues } from "./model";
import { element, type Design, type DesignElement } from "./design.ts";

export function createTemplate(values: ProjectValues, style: "editorial" | "bold" | "minimal" = "editorial"): Design {
  const h = values.format === "story" ? 1920 : 1080;
  const minimal = style === "minimal";
  const base = h - 610;
  return { version: 1, height: h, background: minimal ? "#fffaf3" : values.primary, elements: [
    element("image", { name: "Foto de capa", x: minimal ? 70 : 0, y: minimal ? 70 : 0, width: minimal ? 940 : 1080,
      height: minimal ? base - 70 : h, radius: minimal ? 40 : 0, fit: "cover" }),
    ...(!minimal ? [element("shape", { name: "Fundo do texto", x: 0, y: base - 100, width: 1080, height: 710,
      background: values.primary, radius: 0, opacity: .94 })] : []),
    element("text", { name: "Título", text: values.title, x: 70, y: base - 40, width: 940, height: 200,
      fontFamily: style === "editorial" ? "Georgia" : "Arial", fontSize: style === "bold" ? 76 : 64,
      color: minimal ? values.primary : "#ffffff" }),
    element("text", { name: "Descrição", text: values.subtitle, x: 70, y: base + 165, width: 940, height: 115,
      fontSize: 32, bold: false, color: minimal ? values.primary : "#ffffff" }),
    element("text", { name: "Assinatura", text: `${values.name}\n${values.role}`, x: 70, y: h - 295, width: 940, height: 95,
      fontSize: 30, bold: false, color: minimal ? values.primary : "#ffffff" }),
    element("shape", { name: "Destaque do contato", x: 70, y: h - 190, width: 940, height: 105,
      background: values.accent, radius: 52 }),
    element("text", { name: "Contato", text: `${values.cta} · ${values.phone}`, x: 90, y: h - 170,
      width: 900, height: 65, fontSize: 36, color: "#ffffff", align: "center" })
  ] };
}

function wrappedText(context: CanvasRenderingContext2D, item: DesignElement) {
  const padding = Math.min(item.padding ?? 0, (item.width - 1) / 2, (item.height - 1) / 2);
  const width = item.width - padding * 2;
  context.font = `${item.italic ? "italic " : ""}${item.bold ? "700" : "400"} ${item.fontSize}px "${item.fontFamily}"`;
  context.fillStyle = item.color;
  context.textBaseline = "top";
  context.textAlign = item.align;
  const x = item.align === "center" ? item.width / 2 : item.align === "right" ? item.width - padding : padding;
  const lines: string[] = [];
  for (const paragraph of item.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && context.measureText(`${line} ${word}`).width > width) {
        lines.push(line); line = "";
      }
      if (context.measureText(word).width > width) {
        for (const character of Array.from(word)) {
          if (line && context.measureText(line + character).width > width) {
            lines.push(line); line = "";
          }
          line += character;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  const textHeight = (lines.length - 1) * item.fontSize * 1.22 + item.fontSize;
  const bodyHeight = item.type === "shape" && item.shape === "speech" ? item.height * .8 : item.height;
  const y = item.type === "shape" ? Math.max(padding, (bodyHeight - textHeight) / 2) : padding;
  lines.forEach((line, i) => context.fillText(line, x, y + i * item.fontSize * 1.22));
}
function elementPath(ctx: CanvasRenderingContext2D, item: DesignElement) {
  const w = item.width, h = item.height;
  ctx.beginPath();
  if (item.type !== "shape" || item.shape === "rectangle") {
    ctx.roundRect(0, 0, w, h, Math.min(item.radius, w / 2, h / 2)); return;
  }
  if (item.shape === "ellipse") { ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  let points: number[][];
  switch (item.shape) {
    case "triangle": points = [[.5, 0], [1, 1], [0, 1]]; break;
    case "diamond": points = [[.5, 0], [1, .5], [.5, 1], [0, .5]]; break;
    case "hexagon": points = [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]; break;
    case "arrow": points = [[0, .25], [.6, .25], [.6, 0], [1, .5], [.6, 1], [.6, .75], [0, .75]]; break;
    case "speech":
      ctx.roundRect(0, 0, w, h * .8, Math.min(item.radius, w / 2, h * .4));
      ctx.moveTo(w * .2, h * .8); ctx.lineTo(w * .2, h); ctx.lineTo(w * .4, h * .8); ctx.closePath(); return;
    case "star":
      points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .22 : .5;
        return [.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius];
      }); break;
  }
  points.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x * w, y * h); else ctx.lineTo(x * w, y * h); });
  ctx.closePath();
}
const imageCache = new Map<string, HTMLImageElement>();
async function cachedPhoto(source: string) {
  const existing = imageCache.get(source);
  if (existing) return existing;
  const image = await loadPhoto(source);
  if (imageCache.size >= 45) imageCache.delete(imageCache.keys().next().value!);
  imageCache.set(source, image);
  return image;
}
export async function renderDesign(canvas: HTMLCanvasElement, design: Design, source: string, story: boolean): Promise<void> {
  const images = await Promise.all(design.elements.map(e => e.type === "image" ? cachedPhoto(e.src === "photo" ? source : e.src) : null));
  canvas.width = 1080; canvas.height = story ? 1920 : 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta a criação de imagens.");
  ctx.fillStyle = design.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  design.elements.forEach((e, index) => {
    ctx.save();
    ctx.globalAlpha = e.opacity;
    ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
    ctx.rotate(e.rotation * Math.PI / 180);
    ctx.translate(-e.width / 2, -e.height / 2);
    elementPath(ctx, e);
    ctx.shadowColor = e.shadowColor ?? "#000000";
    ctx.shadowBlur = e.shadowBlur ?? 0;
    const filled = e.type === "shape" || (e.type === "text" && e.textBackground);
    if (filled) { ctx.fillStyle = e.background; ctx.fill(); ctx.shadowBlur = 0; }
    ctx.save();
    ctx.clip();
    if (e.type === "text" || (e.type === "shape" && e.showText)) wrappedText(ctx, e);
    else if (e.type === "image") {
      const image = images[index]!;
      const scale = (e.fit === "contain" ? Math.min(e.width / image.naturalWidth, e.height / image.naturalHeight) :
        Math.max(e.width / image.naturalWidth, e.height / image.naturalHeight)) * e.zoom;
      const w = e.fit === "stretch" ? e.width : image.naturalWidth * scale;
      const h = e.fit === "stretch" ? e.height : image.naturalHeight * scale;
      ctx.filter = `brightness(${e.brightness}%) contrast(${e.contrast}%) saturate(${e.saturation}%)`;
      ctx.drawImage(image, (e.width - w) * e.panX / 100, (e.height - h) * e.panY / 100, w, h);
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    if (e.borderWidth) {
      ctx.save(); ctx.clip(); ctx.lineWidth = e.borderWidth * 2;
      ctx.strokeStyle = e.borderColor ?? "#123d75"; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  });
}

export async function loadPhoto(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("A foto demorou demais para carregar. Tente novamente.")), 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Não foi possível carregar a foto. Escolha um PNG ou JPG válido."));
    };
    image.src = source;
  });
}
export async function pngPhoto(source: string): Promise<string> {
  const image = await loadPhoto(source);
  const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não suporta a criação de imagens.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const photo = canvas.toDataURL("image/png");
  if (photo.length > 6_990_530) throw new Error("A foto ultrapassa 5 MB. Escolha uma imagem menor.");
  return photo;
}
export async function jpegPhoto(source: string): Promise<string> {
  const image = await loadPhoto(source);
  const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não suporta a criação de imagens.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
export function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error("Não foi possível gerar a imagem JPG."));
  }, "image/jpeg", 0.84));
}
function lines(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const result: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && context.measureText(`${line} ${word}`).width > width) {
      result.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) result.push(line);
  return result;
}
function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, height: number, max: number): number {
  const all = lines(context, value, width);
  const visible = all.slice(0, max);
  if (all.length > max) {
    let last = visible[max - 1] || "";
    while (last && context.measureText(last + "…").width > width) last = last.slice(0, -1);
    visible[max - 1] = last + "…";
  }
  visible.forEach((line, index) => context.fillText(line, x, y + index * height, width));
  return visible.length * height;
}
export async function renderPost(canvas: HTMLCanvasElement, values: ProjectValues, source: string): Promise<void> {
  if (values.design) return renderDesign(canvas, values.design, source, values.format === "story");
  const image = await loadPhoto(source);
  const story = values.format === "story";
  canvas.width = 1080;
  canvas.height = story ? 1920 : 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não suporta a criação de imagens.");
  const { width, height } = canvas;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale, sh = height / scale;
  context.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height);
  const gradient = context.createLinearGradient(0, height * .38, 0, height);
  gradient.addColorStop(0, `${values.primary}00`);
  gradient.addColorStop(.4, `${values.primary}dd`);
  gradient.addColorStop(1, values.primary);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  const pad = 80, available = width - 2 * pad;
  let y = height * (story ? .54 : .43);
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#ffe083";
  context.font = "800 25px Arial";
  context.fillText("APRENDER · EVOLUIR · CONQUISTAR", pad, y, available);
  y += 50;
  context.fillStyle = "#fff";
  context.font = `800 ${story ? 72 : 60}px Arial`;
  y += text(context, values.title, pad, y, available, story ? 80 : 68, 3) + 22;
  context.font = "32px Arial";
  y += text(context, values.subtitle, pad, y, available, 41, story ? 4 : 3) + 30;
  const footer = height - (story ? 230 : 140);
  context.fillStyle = "#fff";
  context.font = "800 30px Arial";
  context.fillText(values.name, pad, footer, available * .57);
  context.font = "25px Arial";
  context.fillText(values.role, pad, footer + 42, available * .57);
  context.font = "800 26px Arial";
  const bw = Math.min(360, context.measureText(values.cta).width + 48);
  context.fillStyle = values.accent;
  context.beginPath();
  context.roundRect(width - pad - bw, footer + 12, bw, 66, 33);
  context.fill();
  context.fillStyle = "#fff";
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(values.cta, width - pad - bw / 2, footer + 45, bw - 32);
  if (story) {
    context.font = "27px Arial";
    context.fillText(`WhatsApp ${values.phone}`, width / 2, height - 90, available);
  }
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
