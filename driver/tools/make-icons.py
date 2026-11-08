#!/usr/bin/env python3
"""
Builds every Sokoni Driver launcher icon from the single supplied 512x512 brand
artwork in assets/brand/sokoni-driver-icon-512.jpg.

    python3 tools/make-icons.py

What it writes
--------------
assets/icon.png                      1024x1024 app icon (legacy Android, iOS, in-app logo)
assets/adaptive-icon.png             1024x1024 transparent Android adaptive foreground
assets/favicon.png                   web favicon
store/play-icon-512.png              512x512 PNG for Play Console > Main store listing > App icon
android/app/src/main/res/mipmap-*/   legacy, round and adaptive-foreground PNGs

Why the native mipmaps matter
-----------------------------
This project commits a prebuilt `android/` folder, so the launcher reads
android/app/src/main/res/mipmap-* directly. Changing app.json alone only affects a
fresh `expo prebuild`, which is why an icon change can appear to "not take" in a
production build.

Adaptive icon design
--------------------
Android masks the outer ring of an adaptive icon, so the full badge (with its
"Sokoni Hub / Driver" lettering) would be cropped on round and squircle launchers.
The adaptive foreground is therefore the scooter + pin mark cut out of the white
top half of the artwork, on the same white background. Legacy and Play Store icons
keep the complete badge exactly as supplied.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets/brand/sokoni-driver-icon-512.jpg'

WHITE = (255, 255, 255, 255)
# Width of the mark as a fraction of the 108dp adaptive canvas. The visible window is
# 72/108, so 0.54 leaves a comfortable margin inside circle and squircle masks.
ADAPTIVE_MARK_WIDTH = 0.54
# Width of the mark as a fraction of the diameter of the round legacy icon.
ROUND_MARK_WIDTH = 0.66


def load_badge() -> Image.Image:
    img = Image.open(SRC).convert('RGB')
    if img.size != (512, 512):
        img = img.resize((512, 512), Image.LANCZOS)
    return img


def extract_mark(badge: Image.Image) -> Image.Image:
    """
    Returns the scooter + location pin as RGBA with a transparent background.

    The artwork is cropped along the curved white/green boundary that separates the
    picture from the lettering band, the decorative swirl under the pin is removed,
    and every detached speck is dropped so no fragments of the badge border or the
    green band survive.
    """
    arr = np.asarray(badge).astype(np.int16)
    height, width, _ = arr.shape
    mn = arr.min(axis=2)
    mx = arr.max(axis=2)

    # Soft alpha from the distance to white: keeps anti-aliased edges and the drop
    # shadow smooth instead of leaving a hard grey halo.
    alpha = np.clip((255 - mn - 6) / 40.0, 0.0, 1.0)
    alpha[mn >= 244] = 0.0          # white paper
    alpha[mx <= 40] = 0.0           # black outside the rounded badge corners

    # 1. Curved boundary between the picture and the green lettering band.
    xs = np.arange(width)
    boundary = np.interp(xs, [0, 310, width - 1], [253, 313, 238])
    alpha[np.where(np.arange(height)[:, None] >= boundary[None, :] - 8)] = 0.0

    # 2. Decorative orange swirl under the pin, and the thin badge frame.
    alpha[138:, 420:] = 0.0
    alpha[:, :23] = 0.0
    alpha[:, 490:] = 0.0

    # 3. Keep only substantial parts of the mark.
    labels, count = ndimage.label(alpha > 0.25)
    sizes = ndimage.sum(alpha > 0.25, labels, range(1, count + 1))
    keep = [i + 1 for i in range(count) if sizes[i] >= 150]
    alpha *= np.isin(labels, keep)

    rgba = np.dstack([arr.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    mark = Image.fromarray(rgba, 'RGBA')
    return mark.crop(mark.getbbox())


def square_badge(badge: Image.Image) -> Image.Image:
    """
    The artwork sits on a rounded badge with opaque black outside the corners. Play
    Console and iOS apply their own mask, so the file must be a full square with no
    black. Those corner pixels are inpainted from the surrounding artwork, which keeps
    the white/green gradient continuous. Falls back to a slight crop-zoom if OpenCV is
    not installed.
    """
    arr = np.asarray(badge).astype(np.uint8)
    dark = (arr.max(axis=2) <= 45).astype(np.uint8)
    if not dark.any():
        return badge
    try:
        import cv2
        holes = cv2.dilate(dark, np.ones((5, 5), np.uint8), iterations=1)
        return Image.fromarray(cv2.inpaint(arr, holes, 14, cv2.INPAINT_TELEA), 'RGB')
    except ImportError:
        size = round(badge.width * 1.10)
        big = badge.resize((size, size), Image.LANCZOS)
        offset = (size - badge.width) // 2
        return big.crop((offset, offset, offset + badge.width, offset + badge.width))


def fit(img: Image.Image, canvas: int, width_fraction: float) -> Image.Image:
    """Scales img to the requested width and centres it on a transparent square."""
    target_w = max(1, round(canvas * width_fraction))
    target_h = max(1, round(img.height * target_w / img.width))
    scaled = img.convert('RGBA').resize((target_w, target_h), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(scaled, ((canvas - target_w) // 2, (canvas - target_h) // 2))
    return out


def mask(img: Image.Image, out_size: int, shape: str, radius: float = 0.22) -> Image.Image:
    """Applies a rounded-rectangle or circle alpha mask, then scales to `out_size` px."""
    size = img.width
    big = Image.new('L', (size * 4, size * 4), 0)
    draw = ImageDraw.Draw(big)
    if shape == 'circle':
        draw.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        draw.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius), fill=255)
    big = big.resize((size, size), Image.LANCZOS)
    out = img.convert('RGBA').copy()
    out.putalpha(big)
    return out if out_size == size else out.resize((out_size, out_size), Image.LANCZOS)


def upscale(img: Image.Image, size: int) -> Image.Image:
    out = img.resize((size, size), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))


def main() -> None:
    badge = load_badge()
    mark = extract_mark(badge)

    # App-level assets ------------------------------------------------
    square = square_badge(badge)
    upscale(square, 1024).save(ROOT / 'assets/icon.png', optimize=True)
    adaptive = fit(mark, 1024, ADAPTIVE_MARK_WIDTH)
    adaptive.save(ROOT / 'assets/adaptive-icon.png', optimize=True)

    # Android 13+ themed icons: a single-colour silhouette of the mark.
    monochrome = Image.new('RGBA', adaptive.size, (0, 0, 0, 0))
    monochrome.putalpha(adaptive.getchannel('A'))
    monochrome.save(ROOT / 'assets/android-icon-monochrome.png', optimize=True)
    upscale(square, 196).save(ROOT / 'assets/favicon.png', optimize=True)

    # In-app brand mark (Welcome / sign-in headers). The full badge is illegible at
    # 28-58 px, so those screens use the mark with the "Sokoni Driver" wordmark beside it.
    brand = Image.new('RGBA', (512, 512), WHITE)
    brand.alpha_composite(fit(mark, 512, 0.86))
    brand.save(ROOT / 'assets/brand-mark.png', optimize=True)

    # Play Console listing icon: 512x512, 32-bit PNG, no alpha, full bleed.
    square.save(ROOT / 'store/play-icon-512.png', optimize=True)

    # Android launcher mipmaps ---------------------------------------
    res = ROOT / 'android/app/src/main/res'
    for name, scale in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        folder = res / f'mipmap-{name}'
        folder.mkdir(parents=True, exist_ok=True)

        dp48 = round(48 * scale)
        mask(upscale(badge, dp48 * 4), dp48, 'square').save(folder / 'ic_launcher.png', optimize=True)

        white_disc = Image.new('RGBA', (dp48 * 4, dp48 * 4), WHITE)
        white_disc.alpha_composite(fit(mark, dp48 * 4, ROUND_MARK_WIDTH))
        mask(white_disc, dp48, 'circle').save(folder / 'ic_launcher_round.png', optimize=True)

        dp108 = round(108 * scale)
        fit(mark, dp108, ADAPTIVE_MARK_WIDTH).save(folder / 'ic_launcher_foreground.png', optimize=True)

        # Android 13+ themed icon silhouette.
        mono = Image.new('RGBA', (dp108, dp108), (0, 0, 0, 0))
        mono.putalpha(fit(mark, dp108, ADAPTIVE_MARK_WIDTH).getchannel('A'))
        mono.save(folder / 'ic_launcher_monochrome.png', optimize=True)

    print(f'Mark extracted: {mark.width}x{mark.height} (aspect {mark.width / mark.height:.2f})')
    for path in sorted((ROOT / 'assets').glob('*.png')) + [ROOT / 'store/play-icon-512.png']:
        with Image.open(path) as im:
            print(f'  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]} {im.mode}')


if __name__ == '__main__':
    main()
