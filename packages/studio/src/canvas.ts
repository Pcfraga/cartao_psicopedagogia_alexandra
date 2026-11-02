import type { ProjectValues } from "./model";

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
