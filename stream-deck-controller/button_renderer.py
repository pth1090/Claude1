from __future__ import annotations
from typing import Optional, Union
from PIL import Image, ImageDraw, ImageFont
import os

BUTTON_SIZE = 72
FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")


def _load_font(size: int) -> ImageFont.ImageFont:
    # Try system fonts, fall back to PIL default
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))  # type: ignore


def _apply_thresholds(value: float, thresholds: list[dict]) -> Optional[str]:
    ops = {
        "gt":  lambda v, t: v > t,
        "gte": lambda v, t: v >= t,
        "lt":  lambda v, t: v < t,
        "lte": lambda v, t: v <= t,
        "eq":  lambda v, t: v == t,
    }
    for rule in thresholds:
        op = ops.get(rule.get("operator", "gt"))
        if op and op(value, rule["value"]):
            return rule["color"]
    return None


def render(config: dict, live_value: Optional[Union[float, bool, str]] = None) -> Image.Image:
    bg_color_hex = config.get("color", "#1a3a5c")

    # Override color from threshold
    display = config.get("display") or {}
    thresholds = display.get("thresholds", [])
    if live_value is not None and isinstance(live_value, (int, float)) and thresholds:
        override = _apply_thresholds(float(live_value), thresholds)
        if override:
            bg_color_hex = override

    bg_rgb = _hex_to_rgb(bg_color_hex)
    img = Image.new("RGB", (BUTTON_SIZE, BUTTON_SIZE), bg_rgb)
    draw = ImageDraw.Draw(img)

    label = config.get("label", "")
    unit = display.get("unit", "")
    decimals = display.get("decimals", 1)
    show_value = display.get("node_id") or display.get("address") is not None

    font_label = _load_font(11)
    font_value = _load_font(20)
    font_unit = _load_font(10)

    WHITE = (255, 255, 255)
    GRAY = (180, 180, 180)
    YELLOW = (255, 220, 60)

    # Label at top
    if label:
        # Truncate if too long
        max_chars = 10
        display_label = label[:max_chars] if len(label) > max_chars else label
        bbox = draw.textbbox((0, 0), display_label, font=font_label)
        w = bbox[2] - bbox[0]
        draw.text(((BUTTON_SIZE - w) / 2, 4), display_label, font=font_label, fill=WHITE)

    # Live value in centre
    if show_value and live_value is not None:
        if isinstance(live_value, bool):
            value_str = "EIN" if live_value else "AUS"
            value_color = (80, 255, 80) if live_value else (255, 80, 80)
        elif isinstance(live_value, float):
            value_str = f"{live_value:.{decimals}f}"
            value_color = YELLOW if thresholds and _apply_thresholds(live_value, thresholds) else WHITE
        else:
            value_str = str(live_value)[:8]
            value_color = WHITE

        bbox = draw.textbbox((0, 0), value_str, font=font_value)
        w = bbox[2] - bbox[0]
        draw.text(((BUTTON_SIZE - w) / 2, 26), value_str, font=font_value, fill=value_color)

        if unit:
            bbox = draw.textbbox((0, 0), unit, font=font_unit)
            w = bbox[2] - bbox[0]
            draw.text(((BUTTON_SIZE - w) / 2, 56), unit, font=font_unit, fill=GRAY)
    elif show_value:
        # No value yet
        bbox = draw.textbbox((0, 0), "--", font=font_value)
        w = bbox[2] - bbox[0]
        draw.text(((BUTTON_SIZE - w) / 2, 26), "--", font=font_value, fill=GRAY)

    if not config.get("enabled", True):
        # Dim disabled buttons
        overlay = Image.new("RGB", (BUTTON_SIZE, BUTTON_SIZE), (0, 0, 0))
        img = Image.blend(img, overlay, alpha=0.5)

    return img
