export const fonts = ["Arial", "Georgia", "Trebuchet MS", "Verdana", "Courier New"] as const;
export const shapes = { rectangle: "Retângulo / caixa", ellipse: "Círculo / elipse", triangle: "Triângulo",
  diamond: "Losango", star: "Estrela", hexagon: "Hexágono", arrow: "Seta", speech: "Balão de fala" } as const;
export interface DesignElement {
  id: string;
  type: "text" | "image" | "shape";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  text: string;
  fontSize: number;
  fontFamily: typeof fonts[number];
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  color: string;
  background: string;
  radius: number;
  shape: keyof typeof shapes;
  showText?: boolean;
  textBackground?: boolean;
  padding?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowBlur?: number;
  shadowColor?: string;
  src: string;
  fit?: "contain" | "cover" | "stretch";
  zoom: number;
  panX: number;
  panY: number;
  brightness: number;
  contrast: number;
  saturation: number;
}
export interface Design {
  version: 1;
  height: 1080 | 1920;
  background: string;
  elements: DesignElement[];
}
export interface LandingBlock {
  id: string;
  type: "hero" | "text" | "services" | "gallery" | "contact";
  title: string;
  body: string;
  items: string[];
  image: string;
  background: string;
  align: "left" | "center";
}
export interface LandingDesign {
  version: 1;
  blocks: LandingBlock[];
}
export const designLimits = { elements: 40, blocks: 16, photoBytes: 5 * 1024 * 1024, fileBytes: 7_500_000 };
export type ResizeHandle = "right" | "left" | "top" | "bottom" | "corner";
export function resizeElement(item: DesignElement, handle: ResizeHandle, dx: number, dy: number) {
  const angle = item.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  const horizontal = handle === "left" || handle === "right" || handle === "corner";
  const vertical = handle === "top" || handle === "bottom" || handle === "corner";
  const width = horizontal ? Math.max(20, Math.min(2160, Math.round(item.width + localX * (handle === "left" ? -1 : 1)))) : item.width;
  const height = vertical ? Math.max(20, Math.min(3840, Math.round(item.height + localY * (handle === "top" ? -1 : 1)))) : item.height;
  const shiftX = (width - item.width) / 2 * (handle === "left" ? -1 : 1);
  const shiftY = (height - item.height) / 2 * (handle === "top" ? -1 : 1);
  return { width, height,
    x: Math.max(-2160, Math.min(2160, item.x + (item.width - width) / 2 + shiftX * cos - shiftY * sin)),
    y: Math.max(-3840, Math.min(3840, item.y + (item.height - height) / 2 + shiftX * sin + shiftY * cos))
  };
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const color = (v: unknown): v is string => typeof v === "string" && /^#[a-f0-9]{6}$/i.test(v);
const string = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !v.includes("\0");
const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validImage(v: unknown): v is string {
  return v === "photo" || (typeof v === "string" && v.length <= 6_990_530 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(v));
}
export function parseDesign(raw: unknown): Design {
  if (!record(raw) || raw.version !== 1 || (raw.height !== 1080 && raw.height !== 1920) || !color(raw.background) || !Array.isArray(raw.elements) || raw.elements.length > designLimits.elements) {
    throw new Error("Composição inválida: use até 40 camadas.");
  }
  const ids = new Set<string>();
  const elements = raw.elements.map((e: unknown) => {
    if (!record(e) || !string(e.id, 80) || !e.id || ids.has(e.id) ||
      !["text", "image", "shape"].includes(String(e.type)) || !string(e.name, 80) ||
      !number(e.x, -2160, 2160) || !number(e.y, -3840, 3840) ||
      !number(e.width, 20, 2160) || !number(e.height, 20, 3840) ||
      !number(e.rotation, -360, 360) || !number(e.opacity, 0, 1) ||
      typeof e.locked !== "boolean" || !string(e.text, 2000) || !number(e.fontSize, 10, 240) ||
      !fonts.includes(e.fontFamily as typeof fonts[number]) || typeof e.bold !== "boolean" || typeof e.italic !== "boolean" ||
      !["left", "center", "right"].includes(String(e.align)) || !color(e.color) || !color(e.background) ||
      !number(e.radius, 0, 1080) || !Object.hasOwn(shapes, String(e.shape)) ||
      (e.showText !== undefined && typeof e.showText !== "boolean") ||
      (e.textBackground !== undefined && typeof e.textBackground !== "boolean") ||
      (e.padding !== undefined && !number(e.padding, 0, 100)) ||
      (e.borderWidth !== undefined && !number(e.borderWidth, 0, 40)) ||
      (e.borderColor !== undefined && !color(e.borderColor)) ||
      (e.shadowBlur !== undefined && !number(e.shadowBlur, 0, 80)) ||
      (e.shadowColor !== undefined && !color(e.shadowColor)) ||
      !validImage(e.src) || !number(e.zoom, 1, 4) || !number(e.panX, 0, 100) || !number(e.panY, 0, 100) ||
      (e.fit !== undefined && e.fit !== "contain" && e.fit !== "cover" && e.fit !== "stretch") ||
      !number(e.brightness, 0, 200) || !number(e.contrast, 0, 200) || !number(e.saturation, 0, 200)) {
      throw new Error("Camada inválida. Confira texto, foto e dimensões.");
    }
    ids.add(e.id);
    return {
      id: e.id, type: e.type as DesignElement["type"], name: e.name, x: e.x, y: e.y, width: e.width, height: e.height,
      rotation: e.rotation, opacity: e.opacity, locked: e.locked, text: e.text, fontSize: e.fontSize,
      fontFamily: e.fontFamily as DesignElement["fontFamily"], bold: e.bold, italic: e.italic,
      align: e.align as DesignElement["align"], color: e.color, background: e.background, radius: e.radius,
      shape: e.shape as DesignElement["shape"], src: e.src, zoom: e.zoom, panX: e.panX, panY: e.panY,
      ...(e.fit === undefined ? {} : { fit: e.fit as DesignElement["fit"] }),
      ...(e.showText === undefined ? {} : { showText: e.showText }),
      ...(e.textBackground === undefined ? {} : { textBackground: e.textBackground }),
      ...(e.padding === undefined ? {} : { padding: e.padding }),
      ...(e.borderWidth === undefined ? {} : { borderWidth: e.borderWidth }),
      ...(e.borderColor === undefined ? {} : { borderColor: e.borderColor }),
      ...(e.shadowBlur === undefined ? {} : { shadowBlur: e.shadowBlur }),
      ...(e.shadowColor === undefined ? {} : { shadowColor: e.shadowColor }),
      brightness: e.brightness, contrast: e.contrast, saturation: e.saturation
    };
  });
  return { version: 1, height: raw.height, background: raw.background, elements };
}
export function parseLanding(raw: unknown): LandingDesign {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.blocks) || raw.blocks.length < 1 || raw.blocks.length > designLimits.blocks) {
    throw new Error("A página deve ter entre 1 e 16 blocos.");
  }
  const ids = new Set<string>();
  const blocks = raw.blocks.map((b: unknown) => {
    if (!record(b) || !string(b.id, 80) || !b.id || ids.has(b.id) ||
      !["hero", "text", "services", "gallery", "contact"].includes(String(b.type)) ||
      !string(b.title, 160) || !string(b.body, 3000) || !Array.isArray(b.items) || b.items.length > 12 ||
      !b.items.every(item => string(item, 240)) || !validImage(b.image) || !color(b.background) ||
      !["left", "center"].includes(String(b.align))) throw new Error("Bloco da página inválido.");
    ids.add(b.id);
    return { id: b.id, type: b.type as LandingBlock["type"], title: b.title, body: b.body,
      items: b.items, image: b.image, background: b.background, align: b.align as LandingBlock["align"] };
  });
  return { version: 1, blocks };
}
export function element(type: DesignElement["type"], overrides: Partial<DesignElement> = {}): DesignElement {
  return {
    id: crypto.randomUUID(), type, name: type === "text" ? "Texto" : type === "image" ? "Foto" : "Forma",
    x: 100, y: 120, width: 600, height: type === "text" ? 160 : 400, rotation: 0, opacity: 1, locked: false,
    text: "Seu texto aqui", fontSize: 64, fontFamily: "Arial", bold: true, italic: false, align: "left",
    color: "#123d75", background: "#e83d83", radius: 24, shape: "rectangle", src: "photo",
    ...(type === "image" ? { fit: "stretch" as const } : {}),
    zoom: 1, panX: 50, panY: 50, brightness: 100, contrast: 100, saturation: 100, ...overrides
  };
}
export function landingBlock(type: LandingBlock["type"]): LandingBlock {
  const titles = { hero: "Sua próxima conquista começa aqui", text: "Sobre o meu trabalho", services: "Como posso ajudar", gallery: "Conheça nosso espaço", contact: "Vamos conversar?" };
  return { id: crypto.randomUUID(), type, title: titles[type], body: "Um cuidado personalizado, com acolhimento e atenção a cada detalhe.",
    items: ["Atendimento personalizado", "Acolhimento e confiança", "Desenvolvimento e autonomia"],
    image: "photo", background: type === "hero" ? "#f0f4fa" : "#ffffff", align: type === "hero" ? "left" : "center" };
}
