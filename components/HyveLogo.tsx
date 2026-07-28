'use client';

// Traced from the original logo-basic.png/logo-premium.png artwork (honeycomb
// pyramid outline) so the shape stays pixel-faithful. Rendered as SVG instead
// of a flat raster so it can invert with light/dark mode via Tailwind's
// `dark:` variant instead of needing a separate static image export per theme.
const HEX_PATH =
  'M 49.28 0.80 L 34.08 9.92 L 33.28 24.00 L 20.64 32.16 L 19.68 46.24 L 7.68 54.56 L 7.20 68.32 L 8.64 71.36 L 20.16 78.72 L 21.44 90.40 L 34.72 98.40 L 37.92 99.04 L 50.56 92.64 L 63.36 99.04 L 78.24 90.40 L 79.84 78.56 L 92.32 70.24 L 92.80 55.52 L 80.32 46.24 L 79.20 31.68 L 66.72 23.84 L 65.60 9.44 Z ' +
  'M 88.00 57.28 L 87.68 68.00 L 77.44 74.24 L 64.32 67.68 L 49.92 74.72 L 36.16 67.68 L 22.24 74.24 L 13.28 68.96 L 11.84 66.72 L 12.32 56.48 L 21.60 50.72 L 35.52 58.08 L 49.28 50.88 L 64.16 57.76 L 77.60 50.56 Z ' +
  'M 75.04 35.52 L 74.72 46.08 L 64.16 52.48 L 61.76 52.00 L 51.20 45.76 L 49.12 45.60 L 37.92 52.32 L 35.36 52.80 L 25.76 47.04 L 24.80 45.60 L 25.12 34.72 L 35.68 28.48 L 50.08 35.68 L 64.00 28.32 L 73.92 33.76 Z ' +
  'M 74.72 79.36 L 74.24 87.68 L 63.68 93.92 L 61.60 93.76 L 51.20 87.84 L 49.12 87.68 L 38.56 93.76 L 36.32 94.08 L 25.12 86.88 L 25.92 78.56 L 35.52 72.96 L 38.40 73.76 L 48.64 79.84 L 50.08 79.84 L 61.60 73.28 L 64.16 72.80 Z ' +
  'M 50.72 5.92 L 60.96 12.00 L 61.44 22.72 L 60.00 24.80 L 51.84 29.60 L 49.60 30.40 L 48.00 29.92 L 39.04 24.16 L 38.56 22.72 L 38.56 13.12 L 39.84 11.20 L 49.28 5.92 Z';

interface HyveLogoProps {
  className?: string;
}

export default function HyveLogo({ className }: HyveLogoProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d={HEX_PATH} fillRule="evenodd" className="fill-slate-900 dark:fill-slate-50" />
    </svg>
  );
}
