#!/usr/bin/env python3
"""Generate the home-screen icons for the atendimento PWA.

Run:  python scripts/generate-pwa-icons.py

Source of truth is the brand file in docs/images/logos/, so the icons can be
regenerated instead of living in the repo as PNGs nobody can trace back.

Two decisions worth knowing before changing anything here:

1. **Only the symbol, never the lockup.** The alternative mark stacks the
   rooster head over "GALLO / BASE DIESEL". At 48 px -- the size Android
   actually draws on the home screen -- that wordmark is an unreadable smudge,
   and the launcher already prints the app name right below the icon. The
   script finds where the symbol ends by looking for the first band of empty
   rows, so a new export of the artwork keeps working without magic numbers.

2. **`any` and `maskable` are different files, not one file wearing both
   hats.** Android crops a maskable icon to a circle of 80% diameter; artwork
   drawn to fill the square loses its edges. The old manifest declared
   "any maskable" on the same image, which means one of the two was always
   wrong. The maskable variant keeps the mark inside the safe circle: a square
   inscribed in it can only span 80%/sqrt(2) ~= 56% of the canvas.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a dev-machine concern, not CI
    sys.exit("Pillow is required:  python -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs/images/logos/MARCA-ALTERNATIVA---BRANCO.png"
OUT_DIR = ROOT / "public"

# Matches background_color / theme_color in public/atendimento.webmanifest.
BACKGROUND = (20, 16, 17, 255)  # #141011

# Fraction of the canvas the mark may span.
COVERAGE_ANY = 0.68
COVERAGE_MASKABLE = 0.54  # inside the 80%-diameter safe circle, with margin
COVERAGE_BADGE = 0.86  # a badge is already drawn tiny and monochrome

#: An empty band taller than this splits the symbol from the wordmark below it.
GAP_ROWS = 20


def symbol_only(image: Image.Image) -> Image.Image:
    """Crop the artwork down to the rooster head, dropping the wordmark."""
    alpha = image.split()[3]
    box = alpha.getbbox()
    if box is None:
        sys.exit(f"{SOURCE} has no visible pixels")
    left, top, right, bottom = box

    pixels = alpha.load()
    width = image.width

    def row_is_empty(y: int) -> bool:
        return all(pixels[x, y] <= 8 for x in range(left, right, 2))

    # Walk down from the top of the content until a tall empty band appears.
    symbol_bottom = bottom
    run_start: int | None = None
    for y in range(top, bottom):
        if row_is_empty(y):
            if run_start is None:
                run_start = y
            elif y - run_start >= GAP_ROWS:
                symbol_bottom = run_start
                break
        else:
            run_start = None

    band = image.crop((0, top, width, symbol_bottom))
    inner = band.split()[3].getbbox()
    if inner is None:
        sys.exit("could not isolate the symbol")
    return band.crop(inner)


def render(mark: Image.Image, size: int, coverage: float, background, out: Path) -> None:
    canvas = Image.new("RGBA", (size, size), background)
    scaled = mark.copy()
    target = max(1, round(size * coverage))
    scaled.thumbnail((target, target), Image.LANCZOS)
    canvas.alpha_composite(
        scaled,
        ((size - scaled.width) // 2, (size - scaled.height) // 2),
    )
    canvas.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT).as_posix():<44} {size}x{size}")


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"missing source artwork: {SOURCE}")

    mark = symbol_only(Image.open(SOURCE).convert("RGBA"))
    print(f"symbol isolated at {mark.width}x{mark.height} from {SOURCE.name}")

    for size in (192, 512):
        render(mark, size, COVERAGE_ANY, BACKGROUND, OUT_DIR / f"atendimento-icon-{size}.png")
    for size in (192, 512):
        render(
            mark,
            size,
            COVERAGE_MASKABLE,
            BACKGROUND,
            OUT_DIR / f"atendimento-icon-maskable-{size}.png",
        )

    # iOS draws its own rounded mask and does NOT honour transparency -- a
    # transparent icon turns into a black square on the home screen, so this
    # one is opaque like the others.
    render(mark, 180, COVERAGE_ANY, BACKGROUND, OUT_DIR / "atendimento-apple-touch-icon.png")

    # The notification badge is drawn as a silhouette from the alpha channel:
    # anything but a transparent background comes out as a solid blob.
    render(mark, 96, COVERAGE_BADGE, (0, 0, 0, 0), OUT_DIR / "atendimento-badge-96.png")


if __name__ == "__main__":
    main()
