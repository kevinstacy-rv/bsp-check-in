// Draws the name badge on a canvas in the brand typeface at the Brother
// QL-800's 300 dpi, then thresholds it to pure black and white so the
// driver prints crisp edges instead of dithering grey.
//
// Layout follows the printed Backstage Pass badge:
//   ProPresenter lockup top-left, name centred, organization bottom-left,
//   event mark bottom-right.

import { labelSizeMm, printsRed, type PrinterSettings } from "./types";

export const PRINT_DPI = 300;
const mmToPx = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);

const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const LOGO_SRC = "/brand/propresenter-black.svg";
const LOGO_ASPECT = 854 / 121;
/** The icon's share of the lockup's width (the rest is the wordmark). */
const LOGO_ICON_SHARE = 90 / 854;
/** The only colour a DK-2251 roll prints besides black. */
const RED = "#ff0000";

export type LabelContent = { name: string; company: string };

export type RenderedLabel = {
  /** Black-and-white image of exactly what will print. */
  canvas: HTMLCanvasElement;
  widthMm: number;
  heightMm: number;
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

function drawEventMark(ctx: Ctx, right: number, bottom: number, u: number, color: string): number {
  // "BACKSTAGE / PASS", heavy and tight, with BACKSTAGE stretched to PASS's width.
  const passSize = Math.round(0.21 * u);
  setFont(ctx, 800, passSize, -0.03);
  const passWidth = ctx.measureText("PASS").width;

  let topSize = Math.round(0.1 * u);
  setFont(ctx, 800, topSize, -0.03);
  topSize = Math.round((topSize * passWidth) / ctx.measureText("BACKSTAGE").width);

  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  setFont(ctx, 800, passSize, -0.03);
  ctx.fillText("PASS", right, bottom);
  setFont(ctx, 800, topSize, -0.03);
  ctx.fillText("BACKSTAGE", right, bottom - passSize * 0.84);
  ctx.restore();
  return passWidth;
}

/** The lockup with its icon tinted, drawn off-screen so only the icon's own pixels change colour. */
function tintedLogo(logo: HTMLImageElement, w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const x = c.getContext("2d")!;
  x.drawImage(logo, 0, 0, w, h);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = color;
  x.fillRect(0, 0, w * LOGO_ICON_SHARE, h);
  return c;
}

function drawBadge(
  ctx: Ctx,
  W: number,
  H: number,
  u: number,
  content: LabelContent,
  logo: HTMLImageElement,
  accent: string,
) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const mx = 0.14 * u;
  const top = 0.13 * u;
  const bottom = H - 0.13 * u;

  // Lockup
  const logoH = 0.17 * u;
  if (accent === "#000") ctx.drawImage(logo, mx, top, logoH * LOGO_ASPECT, logoH);
  else ctx.drawImage(tintedLogo(logo, logoH * LOGO_ASPECT, logoH, accent), mx, top);

  // Event mark + organization share the footer line
  const markWidth = drawEventMark(ctx, W - mx, bottom, u, accent);
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

  // Taller labels give the name more room, within reason.
  const room = nameBottom - nameTop;
  const name = content.name.trim() || " ";
  const maxOne = Math.round(Math.min(0.46 * u, room * 0.7));
  const oneLine = fitSize(ctx, name, 600, maxWidth, maxOne, Math.min(maxOne, Math.round(0.24 * u)));
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
  const size = fitSize(ctx, longer, 600, maxWidth, Math.round(Math.min(0.34 * u, room * 0.42)), 8) ?? 8;
  setFont(ctx, 600, size, -0.02);
  const lines = best.filter(Boolean).map((l) => ellipsize(ctx, l, maxWidth));
  const lineH = size * 1.08;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, centerY + (i - (lines.length - 1) / 2) * lineH));
}

export async function renderLabel(content: LabelContent, settings: PrinterSettings): Promise<RenderedLabel> {
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  const { widthMm, heightMm } = labelSizeMm(settings);
  const W = mmToPx(widthMm);
  const H = mmToPx(heightMm);
  // The layout was drawn for a 3" × 1.5" badge; scale it to whichever
  // dimension of this roll is tighter.
  const u = Math.min(W / 3, H / 1.5);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })! as Ctx;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(mmToPx(settings.offsetXMm), mmToPx(settings.offsetYMm));
  const red = printsRed(settings);
  drawBadge(ctx, W, H, u, content, logo, red ? RED : "#000");
  ctx.restore();

  // Snap every pixel to a colour the roll can print: white, black, and on
  // DK-2251 pure red. Anything in between would be dithered by the driver.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (red && r > 120 && r - Math.max(g, b) > 80) {
      d[i] = 255;
      d[i + 1] = d[i + 2] = 0;
    } else {
      const v = 0.299 * r + 0.587 * g + 0.114 * b < 150 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  return { canvas, widthMm, heightMm };
}
