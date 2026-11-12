"use client";

import { toPng } from "html-to-image";

export function fileSlug(...parts: string[]) {
  return (
    parts
      .filter(Boolean)
      .join("-")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "karta"
  );
}

/** Downloads the given (unscaled) card face as a PNG in template resolution. */
export async function downloadFace(node: HTMLElement, filename: string, pixelRatio = 1) {
  const dataUrl = await toPng(node, {
    pixelRatio,
    cacheBust: true,
    width: node.offsetWidth,
    height: node.offsetHeight,
    style: { transform: "none", margin: "0" },
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}.png`;
  a.click();
}
