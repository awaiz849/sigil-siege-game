// Local pixel fonts (no Google Fonts link: works offline).
//   Silkscreen   = titles, numbers, big words
//   DotGothic16  = small text and labels
export const FONT_TITLE = "'Silkscreen', monospace";
export const FONT_TEXT = "'DotGothic16', monospace";

/** Start loading both fonts. Canvas text falls back to monospace until they are ready. */
export function loadFonts(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}fonts/`;
  const faces = [
    new FontFace('Silkscreen', `url(${base}Silkscreen-Regular.ttf)`),
    new FontFace('Silkscreen', `url(${base}Silkscreen-Bold.ttf)`, { weight: '700' }),
    new FontFace('DotGothic16', `url(${base}DotGothic16-Regular.ttf)`),
  ];
  return Promise.all(
    faces.map((f) =>
      f.load().then((loaded) => {
        document.fonts.add(loaded);
      }),
    ),
  ).then(() => undefined);
}
