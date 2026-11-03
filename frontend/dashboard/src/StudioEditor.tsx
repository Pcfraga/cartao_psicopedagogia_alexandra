import { useEffect, useRef, useState, type PointerEvent } from "react";
import { element, fonts, landingBlock, limits, type DesignElement, type LandingBlock, type ProjectValues } from "@atelie/studio";
import { createTemplate, pngPhoto, renderPost } from "@atelie/studio/canvas";
import { LandingContent } from "@atelie/studio/landing";

type Props = {
  values: ProjectValues; photo: string; busy: boolean;
  onChange: (values: ProjectValues) => void; onPhoto: (photo: string) => void; notify: (message: string) => void;
};
const labels = { title: "Título principal", subtitle: "Texto de apoio", name: "Seu nome", role: "Profissão", cta: "Texto do botão", phone: "WhatsApp com DDD" };
const blockNames = { hero: "Capa", text: "Apresentação", services: "Serviços", gallery: "Foto / galeria", contact: "Contato" };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function NumberControl({ label, value, min, max, step, commit, notify }: {
  label: string; value: number; min: number; max: number; step: number;
  commit: (value: number) => void; notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  function finish() {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      notify(`${label}: informe um número entre ${min} e ${max}.`);
      setDraft(String(Math.round(value * 100) / 100)); return;
    }
    const next = clamp(parsed, min, max);
    setDraft(String(next));
    if (next !== value) commit(next);
  }
  return <label>{label}<input type="number" value={draft} min={min} max={max} step={step} onChange={e => setDraft(e.target.value)}
    onBlur={finish} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}

export function StudioEditor({ values, photo, busy, onChange, onPhoto, notify }: Props) {
  const [tab, setTab] = useState<"templates" | "layers" | "content">("templates");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [mobile, setMobile] = useState(false);
  const [past, setPast] = useState<ProjectValues[]>([]);
  const [future, setFuture] = useState<ProjectValues[]>([]);
  const last = useRef(values);
  const own = useRef(values);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const uploader = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadAction = useRef<"image" | "replace" | "photo" | "block">("image");
  const gesture = useRef<{ id: number; x: number; y: number; scale: number; mode: "move" | "resize"; item: DesignElement; initial: ProjectValues } | null>(null);
  const design = values.design;
  const item = design?.elements.find(e => e.id === selected);
  const block = values.landing?.blocks.find(b => b.id === selected);
  const landing = values.format === "landing";
  const height = values.format === "story" ? 1920 : 1080;
  const disabled = busy || uploading;
  useEffect(() => {
    if (own.current !== values) { setPast([]); setFuture([]); setSelected(null); }
    last.current = values;
  }, [values]);
  function apply(next: ProjectValues, history = true) {
    const previous = last.current;
    if (history) { setPast(p => [...p.slice(-29), previous]); setFuture([]); }
    own.current = next; last.current = next; onChange(next);
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    const current = last.current;
    setFuture(f => [current, ...f]); setPast(p => p.slice(0, -1));
    apply(previous, false);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    const current = last.current;
    setPast(p => [...p, current]); setFuture(f => f.slice(1)); apply(next, false);
  }
  useEffect(() => {
    if (landing) return;
    let active = true;
    const target = document.createElement("canvas");
    renderPost(target, values, photo).then(() => {
      if (active && canvas.current) {
        canvas.current.width = target.width; canvas.current.height = target.height;
        const ctx = canvas.current.getContext("2d");
        if (!ctx) throw new Error("Não foi possível gerar a prévia.");
        ctx.drawImage(target, 0, 0);
      }
    }).catch(error => { if (active) notify(error instanceof Error ? error.message : "Não foi possível gerar a prévia."); });
    return () => { active = false; };
  }, [values, photo, landing, notify]);
  function patch(changes: Partial<DesignElement>) {
    if (!design || !item) return;
    apply({ ...values, design: { ...design, elements: design.elements.map(e => e.id === item.id ? { ...e, ...changes } : e) } });
  }
  function patchBlock(changes: Partial<LandingBlock>) {
    if (!block || !values.landing) return;
    apply({ ...values, landing: { ...values.landing, blocks: values.landing.blocks.map(b => b.id === block.id ? { ...b, ...changes } : b) } });
  }
  function add(type: DesignElement["type"], src?: string) {
    const current = design || createTemplate(values);
    if (current.elements.length >= 40) { notify("Limite de 40 camadas por arte."); return; }
    const next = element(type, { ...(src ? { src } : {}), y: height / 3, color: values.primary, background: values.accent });
    apply({ ...values, design: { ...current, elements: [...current.elements, next] } });
    setSelected(next.id); setTab("layers");
  }
  function remove() {
    if (item && !item.locked && design) {
      apply({ ...values, design: { ...design, elements: design.elements.filter(e => e.id !== item.id) } }); setSelected(null);
    }
    if (block && values.landing) {
      if (values.landing.blocks.length === 1) { notify("Mantenha pelo menos um bloco na página."); return; }
      apply({ ...values, landing: { ...values.landing, blocks: values.landing.blocks.filter(b => b.id !== block.id) } }); setSelected(null);
    }
  }
  function duplicate() {
    if (item && design) {
      if (design.elements.length >= 40) { notify("Limite de 40 camadas por arte."); return; }
      const copy = { ...item, id: crypto.randomUUID(), name: `${item.name.slice(0, 70)} cópia`, x: clamp(item.x + 24, -2160, 2160), y: clamp(item.y + 24, -3840, 3840), locked: false };
      apply({ ...values, design: { ...design, elements: [...design.elements, copy] } }); setSelected(copy.id);
    }
  }
  function reorder(direction: number) {
    if (landing && block && values.landing) {
      const blocks = [...values.landing.blocks], index = blocks.findIndex(b => b.id === block.id), to = index + direction;
      if (to < 0 || to >= blocks.length) return;
      [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
      apply({ ...values, landing: { ...values.landing, blocks } });
    } else if (item && design && !item.locked) {
      const elements = [...design.elements], index = elements.findIndex(e => e.id === item.id), to = index + direction;
      if (to < 0 || to >= elements.length) return;
      [elements[index], elements[to]] = [elements[to], elements[index]];
      apply({ ...values, design: { ...design, elements } });
    }
  }
  function start(event: PointerEvent<HTMLElement>, target: DesignElement, mode: "move" | "resize") {
    event.stopPropagation(); setSelected(target.id); setTab("layers");
    if (target.locked || disabled || !stage.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      scale: stage.current.getBoundingClientRect().width / 1080, mode, item: target, initial: values };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId || !last.current.design) return;
    const dx = (event.clientX - g.x) / g.scale, dy = (event.clientY - g.y) / g.scale;
    const angle = g.item.rotation * Math.PI / 180;
    const w = clamp(Math.round(g.item.width + dx * Math.cos(angle) + dy * Math.sin(angle)), 20, 2160);
    const h = clamp(Math.round(g.item.height - dx * Math.sin(angle) + dy * Math.cos(angle)), 20, 3840);
    const changes = g.mode === "move" ? { x: clamp(Math.round(g.item.x + dx), -2160, 2160), y: clamp(Math.round(g.item.y + dy), -3840, 3840) } :
      { width: w, height: h,
        x: clamp(g.item.x + (g.item.width - w) / 2 + ((w - g.item.width) * Math.cos(angle) - (h - g.item.height) * Math.sin(angle)) / 2, -2160, 2160),
        y: clamp(g.item.y + (g.item.height - h) / 2 + ((w - g.item.width) * Math.sin(angle) + (h - g.item.height) * Math.cos(angle)) / 2, -3840, 3840) };
    apply({ ...last.current, design: { ...last.current.design, elements: last.current.design.elements.map(e => e.id === g.item.id ? { ...e, ...changes } : e) } }, false);
  }
  function end() {
    const g = gesture.current;
    gesture.current = null;
    if (g && g.initial !== last.current) { setPast(p => [...p.slice(-29), g.initial]); setFuture([]); }
  }
  function keyboard(event: React.KeyboardEvent) {
    if (disabled || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    if (mod && event.key.toLowerCase() === "d" && item) { event.preventDefault(); duplicate(); }
    if (event.key === "Delete") { event.preventDefault(); remove(); }
    if (item && !item.locked && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); const step = event.shiftKey ? 10 : 1;
      patch({ x: clamp(item.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), -2160, 2160),
        y: clamp(item.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), -3840, 3840) });
    }
  }
  function choose(action: typeof uploadAction.current) { uploadAction.current = action; uploader.current?.click(); }
  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) { notify("Escolha uma foto de até 20 MB."); return; }
    const action = uploadAction.current;
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const source = await pngPhoto(url);
      if (action === "photo") onPhoto(source);
      else if (action === "replace") patch({ src: source });
      else if (action === "block") patchBlock({ image: source });
      else add("image", source);
      notify("Foto carregada. Salve o projeto para guardar a imagem.");
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível abrir a foto."); }
    finally { URL.revokeObjectURL(url); setUploading(false); }
  }
  function changeFormat(format: ProjectValues["format"]) {
    const next = { ...values, format };
    if (design && format !== "landing") {
      const target = format === "story" ? 1920 : 1080;
      const ratio = target / design.height;
      next.design = { ...design, height: target, elements: design.elements.map(e => ({ ...e, y: clamp(e.y * ratio, -3840, 3840), height: clamp(e.height * ratio, 20, 3840) })) };
    }
    apply(next); setSelected(null);
  }
  function addBlock(type: LandingBlock["type"]) {
    const blocks = values.landing?.blocks || [];
    if (blocks.length >= 16) { notify("Limite de 16 blocos por página."); return; }
    const next = landingBlock(type);
    apply({ ...values, landing: { version: 1, blocks: [...blocks, next] } }); setSelected(next.id); setTab("layers");
  }
  const numberControl = (label: string, value: number, min: number, max: number, change: (n: number) => void, step = 1) =>
    <NumberControl label={label} value={value} min={min} max={max} step={step} commit={change} notify={notify} />;
  const range = (label: string, value: number, min: number, max: number, change: (n: number) => void) =>
    <label>{label} <span className="control-value">{Math.round(value)}</span><input type="range" min={min} max={max} value={value} onChange={e => change(Number(e.target.value))} /></label>;

  return <section className="studio" onKeyDown={keyboard}>
    <div className="studio-heading"><div><span className="eyebrow">ESTÚDIO CRIATIVO</span><h1>Suas ideias, em destaque.</h1><p>Crie com liberdade. Compartilhe com personalidade.</p></div>
      <label className="format-select">Formato<select disabled={disabled} value={values.format} onChange={e => changeFormat(e.target.value as ProjectValues["format"])}>
        <option value="square">Post · 1080 × 1080</option><option value="story">Story · 1080 × 1920</option><option value="landing">Landing page responsiva</option>
      </select></label></div>
    <input ref={uploader} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
    <div className="studio-layout">
      <aside className="studio-sidebar">
        <div className="studio-tabs" role="tablist" aria-label="Ferramentas do editor">
          {([["templates", "Modelos"], ["layers", landing ? "Blocos" : "Camadas"], ["content", "Conteúdo"]] as const).map(([id, name]) =>
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{name}</button>)}
        </div>
        <fieldset disabled={disabled} className="studio-panel">
          {tab === "templates" && <><h2>Um bom começo</h2><p className="muted">Escolha um estilo. A aplicação substitui a composição atual; você pode desfazer.</p>
            {landing ? <><button className="template-card" onClick={() => {
              const hero = { ...landingBlock("hero"), title: values.title, body: values.subtitle };
              apply({ ...values, landing: { version: 1, blocks: [hero, landingBlock("text"), landingBlock("services"), landingBlock("contact")] } }); setSelected(null);
            }}><span className="template-art editorial">Aa <i>▤</i></span><strong>Página profissional</strong><small>Capa, apresentação, serviços e contato</small></button>
              <p>Adicione e reordene blocos na aba Blocos. A página se adapta a cada tela.</p></> :
              (["editorial", "bold", "minimal"] as const).map((style, index) => <button key={style} className="template-card" onClick={() => { apply({ ...values, design: createTemplate(values, style) }); setSelected(null); }}>
                <span className={`template-art ${style}`}>Aa <i>✦</i></span><strong>{["Editorial", "Impacto", "Essencial"][index]}</strong><small>{["Elegância e fotografia", "Mensagem forte, cores vivas", "Leve, claro e acolhedor"][index]}</small>
              </button>)}
            {!landing && <button className="outline full" onClick={() => { apply({ ...values, design: { version: 1, height, background: "#ffffff", elements: [] } }); setSelected(null); setTab("layers"); }}>Começar em branco</button>}
          </>}
          {tab === "content" && <><h2>Identidade e conteúdo</h2><p className="muted">Usados nos modelos e no contato da página. Textos já criados na arte são editados em Camadas.</p>
            {(Object.keys(limits) as Array<keyof typeof limits>).map(key => <label key={key}>{labels[key]}
              <textarea rows={key === "subtitle" ? 3 : 2} maxLength={limits[key]} value={values[key]} onChange={e => apply({ ...values, [key]: e.target.value })} /></label>)}
            <div className="control-grid"><label>Marca<input type="color" value={values.primary} onChange={e => apply({ ...values, primary: e.target.value })} /></label>
              <label>Destaque<input type="color" value={values.accent} onChange={e => apply({ ...values, accent: e.target.value })} /></label></div>
            <button className="outline full" onClick={() => choose("photo")}>Trocar foto principal</button>
          </>}
          {tab === "layers" && (landing ? <><h2>Construa sua página</h2><div className="add-tools">
            {(Object.keys(blockNames) as LandingBlock["type"][]).map(type => <button key={type} onClick={() => addBlock(type)}>+ {blockNames[type]}</button>)}
          </div>{!values.landing && <p className="muted">Sua página usa o modelo original. Escolha um modelo para personalizar todos os blocos.</p>}
            <div className="layer-list">{values.landing?.blocks.map((b, i) => <button key={b.id} className={selected === b.id ? "active" : ""} onClick={() => setSelected(b.id)}>
              <span>{String(i + 1).padStart(2, "0")} · {blockNames[b.type]}</span><small>{b.title}</small></button>)}</div>
          </> : <><h2>Elementos da arte</h2><div className="add-tools"><button onClick={() => add("text")}>+ Texto</button><button onClick={() => choose("image")}>+ Foto</button><button onClick={() => add("shape")}>+ Forma</button></div>
            {!design && <p className="muted">Layout original preservado. Escolha um modelo ou adicione um elemento para ativar a edição livre.</p>}
            {design && <label>Cor do fundo<input type="color" value={design.background} onChange={e => apply({ ...values, design: { ...design, background: e.target.value } })} /></label>}
            <div className="layer-list">{design && [...design.elements].reverse().map(e => <button key={e.id} className={selected === e.id ? "active" : ""} onClick={() => setSelected(e.id)}>
              <span>{e.type === "text" ? "T" : e.type === "image" ? "▧" : "◼"} · {e.name}</span><small>{e.locked ? "Bloqueada" : e.type === "text" ? e.text : "Clique para editar"}</small></button>)}</div>
          </>)}
        </fieldset>
      </aside>
      <div className="studio-center">
        <div className="canvas-toolbar"><div className="buttons compact"><button disabled={disabled || !past.length} onClick={undo} title="Ctrl+Z">↶ Desfazer</button><button disabled={disabled || !future.length} onClick={redo} title="Ctrl+Shift+Z">↷ Refazer</button></div>
          {landing ? <div className="buttons compact"><button aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button aria-pressed={mobile} onClick={() => setMobile(true)}>Celular</button></div> :
            <label className="zoom-control">Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={60}>60%</option><option value={80}>80%</option><option value={100}>Ajustar</option><option value={125}>125%</option><option value={150}>150%</option></select></label>}
        </div>
        <div className="canvas-scroll">
          {landing ? <div className={`landing-frame ${mobile ? "mobile" : ""}`}><LandingContent values={values} photo={photo} /></div> :
            <div className={`canvas-paper ${values.format}`} style={{ width: `${zoom}%`, maxWidth: zoom > 100 ? "none" : undefined }} ref={stage}
              onPointerDown={e => { if (e.target === e.currentTarget || e.target === canvas.current) setSelected(null); }}>
              <canvas ref={canvas} aria-label="Pré-visualização do material" />
              {design?.elements.map(e => <button key={e.id} aria-label={`Selecionar ${e.name}`} aria-pressed={selected === e.id} disabled={disabled}
                className={`canvas-object ${selected === e.id ? "selected" : ""} ${e.locked ? "locked" : ""}`}
                style={{ left: `${e.x / 10.8}%`, top: `${e.y / height * 100}%`, width: `${e.width / 10.8}%`, height: `${e.height / height * 100}%`, transform: `rotate(${e.rotation}deg)` }}
                onPointerDown={event => start(event, e, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
                onClick={() => { setSelected(e.id); setTab("layers"); }}>
                {selected === e.id && !e.locked && <span className="resize-handle" onPointerDown={event => start(event, e, "resize")} />}
              </button>)}
            </div>}
        </div>
        <div className="canvas-status"><span>{landing ? "Página responsiva · HTML independente" : `1080 × ${height} px · PNG em alta resolução`}</span><span>{landing ? `${values.landing?.blocks.length || 3} blocos` : `${design?.elements.length || 0} camadas`}</span></div>
        <p className="studio-tip">{landing ? "Use Blocos para mudar a ordem e editar cada seção." : "Selecione uma camada para editar. Arraste para mover; use o ponto no canto para redimensionar. Setas movem 1 px (Shift: 10 px)."}</p>
      </div>
      <aside className="studio-inspector"><fieldset disabled={disabled}><h2>{item ? "Propriedades" : block ? "Editar bloco" : "Seu toque pessoal"}</h2>
        {!item && !block && <div className="empty-selection"><span>✦</span><p>Selecione {landing ? "um bloco na lista" : "um elemento na arte ou na lista de camadas"} para personalizar.</p><small>Suas alterações só vão para a versão pública quando você publicar.</small></div>}
        {item && <><label>Nome da camada<input maxLength={80} value={item.name} onChange={e => patch({ name: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={item.locked} onChange={e => patch({ locked: e.target.checked })} />Bloquear camada</label>
          <fieldset disabled={item.locked}><div className="control-grid">
            {numberControl("Posição X", item.x, -2160, 2160, x => patch({ x }))}
            {numberControl("Posição Y", item.y, -3840, 3840, y => patch({ y }))}
            {numberControl("Largura", item.width, 20, 2160, width => patch({ width }))}
            {numberControl("Altura", item.height, 20, 3840, height => patch({ height }))}
          </div>
            <div className="buttons compact"><button onClick={() => patch({ x: (1080 - item.width) / 2 })}>Centralizar X</button><button onClick={() => patch({ y: (height - item.height) / 2 })}>Centralizar Y</button></div>
            {range("Rotação (graus)", item.rotation, -180, 180, rotation => patch({ rotation }))}
            {range("Opacidade (%)", item.opacity * 100, 0, 100, opacity => patch({ opacity: opacity / 100 }))}
            {item.type === "text" && <><label>Texto<textarea maxLength={2000} value={item.text} onChange={e => patch({ text: e.target.value })} /></label>
              <label>Fonte<select value={item.fontFamily} onChange={e => patch({ fontFamily: e.target.value as DesignElement["fontFamily"] })}>{fonts.map(f => <option key={f}>{f}</option>)}</select></label>
              <div className="control-grid">{numberControl("Tamanho (px)", item.fontSize, 10, 240, fontSize => patch({ fontSize }))}
                <label>Cor<input type="color" value={item.color} onChange={e => patch({ color: e.target.value })} /></label></div>
              <div className="buttons compact"><button aria-pressed={item.bold} onClick={() => patch({ bold: !item.bold })}><b>Negrito</b></button><button aria-pressed={item.italic} onClick={() => patch({ italic: !item.italic })}><i>Itálico</i></button></div>
              <label>Alinhamento<select value={item.align} onChange={e => patch({ align: e.target.value as DesignElement["align"] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
              <p className="muted">O texto é limitado à caixa. Aumente a altura se alguma linha não aparecer.</p></>}
            {item.type === "shape" && <><label>Formato<select value={item.shape} onChange={e => patch({ shape: e.target.value as DesignElement["shape"] })}><option value="rectangle">Retângulo / caixa</option><option value="ellipse">Círculo / elipse</option></select></label>
              <label>Preenchimento<input type="color" value={item.background} onChange={e => patch({ background: e.target.value })} /></label></>}
            {item.type !== "text" && range("Cantos arredondados", item.radius, 0, 540, radius => patch({ radius }))}
            {item.type === "image" && <><button className="outline full" onClick={() => choose("replace")}>Substituir foto</button>
              {range("Recorte / zoom (%)", item.zoom * 100, 100, 400, zoom => patch({ zoom: zoom / 100 }))}
              {range("Enquadramento horizontal", item.panX, 0, 100, panX => patch({ panX }))}
              {range("Enquadramento vertical", item.panY, 0, 100, panY => patch({ panY }))}
              {range("Brilho", item.brightness, 0, 200, brightness => patch({ brightness }))}
              {range("Contraste", item.contrast, 0, 200, contrast => patch({ contrast }))}
              {range("Saturação", item.saturation, 0, 200, saturation => patch({ saturation }))}
              <div className="buttons compact"><button onClick={() => patch({ saturation: 0 })}>Preto e branco</button><button onClick={() => patch({ brightness: 110, contrast: 95, saturation: 80 })}>Suave</button><button onClick={() => patch({ brightness: 100, contrast: 100, saturation: 100, zoom: 1, panX: 50, panY: 50 })}>Original</button></div>
            </>}
            <div className="buttons compact"><button onClick={() => reorder(-1)}>Para trás</button><button onClick={() => reorder(1)}>Para frente</button><button onClick={duplicate}>Duplicar</button><button className="danger" onClick={remove}>Excluir</button></div>
          </fieldset></>}
        {block && <><p className="eyebrow">{blockNames[block.type]}</p><label>Título<input maxLength={160} value={block.title} onChange={e => patchBlock({ title: e.target.value })} /></label>
          <label>Descrição<textarea maxLength={3000} value={block.body} onChange={e => patchBlock({ body: e.target.value })} /></label>
          {block.type === "services" && <label>Serviços (um por linha, até 12)<textarea value={block.items.join("\n")} onChange={e => {
            const items = e.target.value.split("\n");
            if (items.length > 12 || items.some(i => i.length > 240)) { notify("Use até 12 serviços com até 240 caracteres cada."); return; }
            patchBlock({ items });
          }} /></label>}
          {(block.type === "hero" || block.type === "gallery") && <button className="outline full" onClick={() => choose("block")}>Escolher foto do bloco</button>}
          <label>Fundo<input type="color" value={block.background} onChange={e => patchBlock({ background: e.target.value })} /></label>
          <label>Alinhamento<select value={block.align} onChange={e => patchBlock({ align: e.target.value as LandingBlock["align"] })}><option value="left">Esquerda</option><option value="center">Centro</option></select></label>
          <div className="buttons compact"><button onClick={() => reorder(-1)}>Subir bloco</button><button onClick={() => reorder(1)}>Descer bloco</button><button className="danger" onClick={remove}>Excluir bloco</button></div>
        </>}
      </fieldset></aside>
    </div>
  </section>;
}
