"""Assemble the README walkthrough GIF from the captured screens.

Regenerate after re-shooting docs/media/*.png:
    python3 scripts/make-demo-gif.py
"""

from pathlib import Path

from PIL import Image

MEDIA = Path(__file__).resolve().parent.parent / "docs" / "media"

# The order a reviewer should meet the product in: the ranked feed, why a
# filing landed there, the pull side, the command bar, the controls, and the
# same feed in the other theme.
FRAMES = [
    ("brief-dark.png", 2600),
    ("score-breakdown.png", 3000),
    ("sheet-dark.png", 2600),
    ("ask-dark.png", 2200),
    ("tune-dark.png", 2200),
    ("brief-light.png", 2600),
]

WIDTH = 300


def load(name: str) -> Image.Image:
    img = Image.open(MEDIA / name).convert("RGB")
    height = round(img.height * WIDTH / img.width)
    return img.resize((WIDTH, height), Image.LANCZOS)


def main() -> None:
    frames = [load(name) for name, _ in FRAMES]
    durations = [ms for _, ms in FRAMES]

    # A shared adaptive palette keeps the glass gradients from banding
    # differently on each frame, which reads as flicker.
    quantized = [f.quantize(colors=200, method=Image.MEDIANCUT) for f in frames]

    out = MEDIA / "walkthrough.gif"
    quantized[0].save(
        out,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    print(f"{out.relative_to(MEDIA.parent.parent)} · {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
