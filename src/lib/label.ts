// Draws the 3" × 1.5" name badge on a canvas in the brand typeface, then
// thresholds it to the 1-bit image a direct-thermal printer burns.
//
// Layout follows the printed Backstage Pass badge:
//   ProPresenter lockup top-left, name centred, organization bottom-left,
//   event mark bottom-right.

import type { PrinterSettings } from "./types";
import { labelZpl } from "./zpl";

export const LABEL_WIDTH_IN = 3;
export const LABEL_HEIGHT_IN = 1.5;

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const LOGO_SRC = "/brand/propresenter-black.svg";
const LOGO_ASPECT = 854 / 121;

export type LabelContent = { name: string; company: string };

export type RenderedLabel = {
  /** Thresholded 1-bit preview of exactly what will print. */
  canvas: HTMLCanvasElement;
  pixels: Uint8Array;
  width: number;
  height: number;
};

let logoPromise: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  logoPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logoPromise = null;
      reject(new Error("Couldn't load the ProPresenter logo."));
    };
    img.src = LOGO_SRC;
  });
  return logoPromise;
}

async function loadFonts() {
  await Promise.all([
    document.fonts.load(`600 40px ${FONT}`),
    document.fonts.load(`800 40px ${FONT}`),
  ]);
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function setFont(ctx: Ctx, weight: number, sizePx: number, trackingEm = 0) {
  ctx.font = `${weight} ${sizePx}px ${FONT}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(trackingEm * sizePx).toFixed(2)}px`;
}

/** Largest font size between min and max at which `text` fits `maxWidth`, or null. */
function fitSize(ctx: Ctx, text: string, weight: number, maxWidth: number, max: number, min: number) {
  for (let size = max; size >= min; size -= 1) {
    setFont(ctx, weight, size, -0.02);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return null;
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function drawEventMark(ctx: Ctx, right: number, bottom: number, u: number): number {
  // "BACKSTAGE / PASS", heavy and tight, with BACKSTAGE stretched to PASS's width.
  const passSize = Math.round(0.21 * u);
  setFont(ctx, 800, passSize, -0.03);
  const passWidth = ctx.measureText("PASS").width;

  let topSize = Math.round(0.1 * u);
  setFont(ctx, 800, topSize, -0.03);
  topSize = Math.round((topSize * passWidth) / ctx.measureText("BACKSTAGE").width);

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  setFont(ctx, 800, passSize, -0.03);
  ctx.fillText("PASS", right, bottom);
  setFont(ctx, 800, topSize, -0.03);
  ctx.fillText("BACKSTAGE", right, bottom - passSize * 0.84);
  return passWidth;
}

function drawBadge(ctx: Ctx, W: number, H: number, u: number, content: LabelContent, logo: HTMLImageElement) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const mx = 0.14 * u;
  const top = 0.13 * u;
  const bottom = H - 0.13 * u;

  // Lockup
  const logoH = 0.17 * u;
  ctx.drawImage(logo, mx, top, logoH * LOGO_ASPECT, logoH);

  // Event mark + organization share the footer line
  const markWidth = drawEventMark(ctx, W - mx, bottom, u);
  const companySize = Math.round(0.14 * u);
  setFont(ctx, 600, companySize, -0.01);
  ctx.textAlign = "left";
  ctx.fillText(ellipsize(ctx, content.company, W - 2 * mx - markWidth - 0.15 * u), mx, bottom);

  // Name, centred in the space between lockup and footer
  const nameTop = top + logoH;
  const nameBottom = bottom - companySize;
  const centerY = (nameTop + nameBottom) / 2;
  const maxWidth = W - 2 * mx;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const name = content.name.trim() || " ";
  const oneLine = fitSize(ctx, name, 600, maxWidth, Math.round(0.36 * u), Math.round(0.24 * u));
  if (oneLine) {
    setFont(ctx, 600, oneLine, -0.02);
    ctx.fillText(name, W / 2, centerY);
    return;
  }

  // Long names: split into two balanced lines, then fit both.
  const words = name.split(/\s+/);
  let best = [name, ""];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) [best, bestDiff] = [[a, b], diff];
  }
  const longer = best[0].length >= best[1].length ? best[0] : best[1];
  const size = fitSize(ctx, longer, 600, maxWidth, Math.round(0.28 * u), 8) ?? 8;
  setFont(ctx, 600, size, -0.02);
  const lines = best.filter(Boolean).map((l) => ellipsize(ctx, l, maxWidth));
  const lineH = size * 1.08;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, centerY + (i - (lines.length - 1) / 2) * lineH));
}

export async function renderLabel(content: LabelContent, settings: PrinterSettings): Promise<RenderedLabel> {
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  const u = settings.dpi;
  const W = Math.round(LABEL_WIDTH_IN * u);
  const H = Math.round(LABEL_HEIGHT_IN * u);

  const art = document.createElement("canvas");
  art.width = W;
  art.height = H;
  const ctx = art.getContext("2d")! as Ctx;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(settings.offsetX, settings.offsetY);
  drawBadge(ctx, W, H, u, content, logo);
  ctx.restore();

  // Rotate for rolls that feed the short edge across the printhead.
  const out = document.createElement("canvas");
  out.width = settings.rotate ? H : W;
  out.height = settings.rotate ? W : H;
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  if (settings.rotate) {
    octx.translate(H, 0);
    octx.rotate(Math.PI / 2);
  }
  octx.drawImage(art, 0, 0);

  const img = octx.getImageData(0, 0, out.width, out.height);
  const pixels = new Uint8Array(out.width * out.height);
  for (let i = 0; i < pixels.length; i++) {
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    const black = 0.299 * r + 0.587 * g + 0.114 * b < 150;
    pixels[i] = black ? 1 : 0;
    const v = black ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.putImageData(img, 0, 0);

  return { canvas: out, pixels, width: out.width, height: out.height };
}

export function toZpl(label: RenderedLabel, settings: PrinterSettings): string {
  return labelZpl({
    pixels: label.pixels,
    width: label.width,
    height: label.height,
    darkness: settings.darkness,
  });
}
