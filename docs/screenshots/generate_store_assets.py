"""
PathClash - Google Play Console Store Asset Generator
Creates all required store listing images based on game's visual design.
"""

from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Design tokens ──────────────────────────────────────────────────────────
BG       = "#12181B"
PANEL    = "#1E252B"
TILE     = "#2A3137"
BORDER   = "#3A444D"
RED      = "#EF4444"
BLUE     = "#3B82F6"
GREEN    = "#386641"
WHITE    = "#FFFFFF"
MUTED    = "#8A9BA8"

# PathClash gradient colors  (simulated via two-tone text approach)
GRAD_L   = "#EF4444"   # red-ish left
GRAD_R   = "#3B82F6"   # blue-ish right

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lerp_color(c1, c2, t):
    r1, g1, b1 = hex2rgb(c1)
    r2, g2, b2 = hex2rgb(c2)
    return (int(r1 + (r2 - r1) * t), int(g1 + (g2 - g1) * t), int(b1 + (b2 - b1) * t))

def load_font(size, bold=False):
    """Try to load a decent system font; fall back to default."""
    candidates = [
        "C:/Windows/Fonts/seguiemj.ttf",
        "C:/Windows/Fonts/segoeui.ttf" if not bold else "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arial.ttf" if not bold else "C:/Windows/Fonts/arialbd.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except:
            pass
    return ImageFont.load_default()

def draw_rounded_rect(draw, xy, radius, fill=None, outline=None, width=2):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline, width=width)

def gradient_text(img, draw, text, font, x, y, c1=GRAD_L, c2=GRAD_R):
    """Draw text with a horizontal gradient color."""
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    for i, ch in enumerate(text):
        t = i / max(len(text) - 1, 1)
        color = lerp_color(c1, c2, t)
        ch_bbox = font.getbbox(ch)
        draw.text((x, y), ch, font=font, fill=color)
        x += ch_bbox[2] - ch_bbox[0]

def draw_grid_5x5(draw, ox, oy, cell, fill_tile=TILE, border_color=BORDER,
                  red_path=None, blue_path=None):
    """Draw a 5×5 game grid with optional paths."""
    N = 5
    for row in range(N):
        for col in range(N):
            x0 = ox + col * cell
            y0 = oy + row * cell
            pad = 3
            draw.rounded_rectangle([x0+pad, y0+pad, x0+cell-pad, y0+cell-pad],
                                    radius=6, fill=hex2rgb(fill_tile),
                                    outline=hex2rgb(border_color), width=1)

    def draw_path(path, color):
        if not path:
            return
        pts = [(ox + c * cell + cell//2, oy + r * cell + cell//2) for r, c in path]
        rgb = hex2rgb(color)
        for i in range(len(pts) - 1):
            draw.line([pts[i], pts[i+1]], fill=rgb, width=max(cell//6, 4))

    draw_path(blue_path, BLUE)
    draw_path(red_path, RED)

    # Draw player dots
    if blue_path:
        r, c = blue_path[0]
        bx = ox + c * cell + cell//2
        by = oy + r * cell + cell//2
        rad = cell // 4
        draw.ellipse([bx-rad, by-rad, bx+rad, by+rad], fill=hex2rgb(BLUE))

    if red_path:
        r, c = red_path[0]
        bx = ox + c * cell + cell//2
        by = oy + r * cell + cell//2
        rad = cell // 4
        draw.ellipse([bx-rad-2, by-rad-2, bx+rad+2, by+rad+2],
                     fill=(*hex2rgb(RED), 60), outline=hex2rgb(RED), width=2)
        draw.ellipse([bx-rad+2, by-rad+2, bx+rad-2, by+rad-2], fill=hex2rgb(RED))


# ══════════════════════════════════════════════════════════════════════════
# 1. APP ICON  512×512
# ══════════════════════════════════════════════════════════════════════════
def make_app_icon():
    W = H = 512
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded square
    draw.rounded_rectangle([0, 0, W-1, H-1], radius=80,
                            fill=hex2rgb(BG))

    # Inner panel
    PAD = 32
    draw.rounded_rectangle([PAD, PAD, W-PAD, H-PAD], radius=50,
                            fill=hex2rgb(PANEL), outline=hex2rgb(BORDER), width=2)

    # 5×5 mini grid
    cell = 62
    grid_w = cell * 5
    ox = (W - grid_w) // 2
    oy = PAD + 30

    blue_path = [(0,2),(0,3),(1,3),(2,3),(2,4)]
    red_path  = [(4,2),(3,2),(3,1),(2,1),(2,0)]

    draw_grid_5x5(draw, ox, oy, cell,
                  red_path=red_path, blue_path=blue_path)

    # "PathClash" text at bottom
    font_big = load_font(52, bold=True)
    text = "PathClash"
    bbox = font_big.getbbox(text)
    tw = bbox[2] - bbox[0]
    tx = (W - tw) // 2
    ty = oy + cell * 5 + 20
    gradient_text(img, draw, text, font_big, tx, ty)

    # Save
    path = os.path.join(OUT, "app_icon.png")
    img.save(path)
    print(f"  ✓ app_icon.png  ({W}x{H})")


# ══════════════════════════════════════════════════════════════════════════
# 2. FEATURE GRAPHIC  1024×500
# ══════════════════════════════════════════════════════════════════════════
def make_feature_graphic():
    W, H = 1024, 500
    img = Image.new("RGB", (W, H), hex2rgb(BG))
    draw = ImageDraw.Draw(img)

    # Left gradient stripe
    for x in range(W // 2):
        t = x / (W // 2)
        c = lerp_color(GRAD_L, BG, t)
        draw.line([(x, 0), (x, H)], fill=c)

    # Left side – branding
    font_title = load_font(72, bold=True)
    font_sub   = load_font(28)
    font_tag   = load_font(22)

    # Title gradient
    title = "PathClash"
    gradient_text(img, draw, title, font_title, 60, 120)

    # Tagline
    draw.text((62, 210), "1v1 Real-Time Path Strategy", font=font_sub, fill=hex2rgb(WHITE))
    draw.text((62, 250), "Draw your route. Clash paths. Survive.", font=font_tag, fill=hex2rgb(MUTED))

    # Badges row
    badges = [("⚔", "PvP"), ("🤖", "AI Match"), ("🌐", "Online")]
    bx = 62
    by = 320
    for icon, label in badges:
        draw.rounded_rectangle([bx, by, bx+110, by+44], radius=22,
                               fill=hex2rgb(PANEL), outline=hex2rgb(BORDER), width=1)
        draw.text((bx+14, by+10), f"{icon} {label}", font=load_font(18), fill=hex2rgb(WHITE))
        bx += 128

    # Right side – mini game board
    cell = 72
    ox = 580
    oy = (H - cell * 5) // 2

    blue_path = [(0,2),(0,3),(1,3),(2,3),(2,4)]
    red_path  = [(4,2),(3,2),(3,1),(2,1),(2,0)]
    draw_grid_5x5(draw, ox, oy, cell, red_path=red_path, blue_path=blue_path)

    # Subtle glow behind grid
    from PIL import ImageFilter
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([ox-40, oy-40, ox+cell*5+40, oy+cell*5+40],
               fill=(*hex2rgb(BLUE), 0))
    # Re-draw grid on top
    draw_grid_5x5(draw, ox, oy, cell, red_path=red_path, blue_path=blue_path)

    path = os.path.join(OUT, "feature_graphic.png")
    img.save(path)
    print(f"  ✓ feature_graphic.png  ({W}x{H})")


# ══════════════════════════════════════════════════════════════════════════
# Helper: build a "phone screenshot" card  (1080×1920)
# ══════════════════════════════════════════════════════════════════════════
LOBBY_IMG  = os.path.join(OUT, "lobby_live.png")
INGAME_IMG = os.path.join(OUT, "ingame_live.png")

def phone_card(title_text, subtitle, game_img_path, out_name, W=1080, H=1920):
    img = Image.new("RGB", (W, H), hex2rgb(BG))
    draw = ImageDraw.Draw(img)

    # Top bar gradient strip
    for y in range(120):
        t = y / 120
        c = lerp_color(GRAD_L, GRAD_R, t * 0.4)
        alpha = int(60 * (1 - t))
        # Blend manually
        r, g, b = hex2rgb(BG)
        cr, cg, cb = c
        draw.line([(0, y), (W, y)], fill=(
            r + (cr - r) * alpha // 255,
            g + (cg - g) * alpha // 255,
            b + (cb - b) * alpha // 255,
        ))

    # "PathClash" header
    font_logo = load_font(64, bold=True)
    gradient_text(img, draw, "PathClash", font_logo, 60, 60)

    # Subtitle tag
    font_sub = load_font(30)
    draw.text((62, 140), subtitle, font=font_sub, fill=hex2rgb(MUTED))

    # Divider
    draw.line([(60, 190), (W-60, 190)], fill=hex2rgb(BORDER), width=2)

    # Game screenshot (centered, fitted)
    game = Image.open(game_img_path).convert("RGB")
    gw, gh = game.size
    avail_w = W - 80
    avail_h = int(H * 0.65)
    scale = min(avail_w / gw, avail_h / gh)
    nw, nh = int(gw * scale), int(gh * scale)
    game = game.resize((nw, nh), Image.LANCZOS)

    # Panel behind screenshot
    px = (W - nw) // 2
    py = 220
    draw.rounded_rectangle([px-12, py-12, px+nw+12, py+nh+12],
                            radius=20, fill=hex2rgb(PANEL), outline=hex2rgb(BORDER), width=1)
    img.paste(game, (px, py))

    # Bottom feature text
    features = [
        ("⚔", "Draw your path in secret"),
        ("💥", "Paths collide simultaneously"),
        ("🏆", "First to 0 HP loses"),
    ]
    fy = py + nh + 60
    for icon, feat in features:
        draw.rounded_rectangle([60, fy, W-60, fy+60], radius=14,
                               fill=hex2rgb(PANEL), outline=hex2rgb(BORDER), width=1)
        draw.text((90, fy+14), f"{icon}  {feat}", font=load_font(26), fill=hex2rgb(WHITE))
        fy += 76

    path = os.path.join(OUT, out_name)
    img.save(path)
    print(f"  ✓ {out_name}  ({W}x{H})")


# ══════════════════════════════════════════════════════════════════════════
# 3. PHONE SCREENSHOTS  1080×1920
# ══════════════════════════════════════════════════════════════════════════
def make_phone_screenshots():
    phone_card("PathClash", "Choose your battle mode",
               LOBBY_IMG, "phone_screenshot_1.png", 1080, 1920)
    phone_card("PathClash", "Draw paths. Clash. Win.",
               INGAME_IMG, "phone_screenshot_2.png", 1080, 1920)


# ══════════════════════════════════════════════════════════════════════════
# 4. 7-INCH TABLET SCREENSHOTS  1200×1920  (9:16)
# ══════════════════════════════════════════════════════════════════════════
def make_tablet7_screenshots():
    phone_card("PathClash", "Choose your battle mode",
               LOBBY_IMG, "tablet7_screenshot_1.png", 1200, 1920)
    phone_card("PathClash", "Draw paths. Clash. Win.",
               INGAME_IMG, "tablet7_screenshot_2.png", 1200, 1920)


# ══════════════════════════════════════════════════════════════════════════
# 5. 10-INCH TABLET SCREENSHOTS  1920×1200  (16:9)
# ══════════════════════════════════════════════════════════════════════════
def tablet_landscape(title_text, game_img_path, out_name, W=1920, H=1200):
    img = Image.new("RGB", (W, H), hex2rgb(BG))
    draw = ImageDraw.Draw(img)

    # Left panel – branding
    SPLIT = W // 3

    for x in range(SPLIT):
        t = x / SPLIT
        c = lerp_color(GRAD_L, GRAD_R, t * 0.3)
        r0, g0, b0 = hex2rgb(BG)
        cr, cg, cb = c
        draw.line([(x, 0), (x, H)], fill=(r0 + (cr-r0)//4, g0 + (cg-g0)//4, b0 + (cb-b0)//4))

    font_logo = load_font(72, bold=True)
    font_sub  = load_font(30)
    font_tag  = load_font(24)

    ty = H // 2 - 120
    gradient_text(img, draw, "PathClash", font_logo, 60, ty)
    draw.text((62, ty + 90), title_text, font=font_sub, fill=hex2rgb(WHITE))
    draw.text((62, ty + 136), "1v1 Real-Time Strategy", font=font_tag, fill=hex2rgb(MUTED))

    # Mini grid in left panel
    cell = 60
    gox = 80
    goy = H - cell * 5 - 80
    blue_path = [(0,2),(0,3),(1,3),(2,3),(2,4)]
    red_path  = [(4,2),(3,2),(3,1),(2,1),(2,0)]
    draw_grid_5x5(draw, gox, goy, cell, red_path=red_path, blue_path=blue_path)

    # Right panel – game screenshot
    draw.rectangle([SPLIT, 0, W, H], fill=hex2rgb(PANEL))
    draw.line([(SPLIT, 0), (SPLIT, H)], fill=hex2rgb(BORDER), width=2)

    game = Image.open(game_img_path).convert("RGB")
    gw, gh = game.size
    avail_w = W - SPLIT - 60
    avail_h = H - 60
    scale = min(avail_w / gw, avail_h / gh)
    nw, nh = int(gw * scale), int(gh * scale)
    game = game.resize((nw, nh), Image.LANCZOS)

    px = SPLIT + (W - SPLIT - nw) // 2
    py = (H - nh) // 2
    draw.rounded_rectangle([px-8, py-8, px+nw+8, py+nh+8],
                            radius=16, fill=hex2rgb("#16202A"), outline=hex2rgb(BORDER), width=1)
    img.paste(game, (px, py))

    path = os.path.join(OUT, out_name)
    img.save(path)
    print(f"  ✓ {out_name}  ({W}x{H})")

def make_tablet10_screenshots():
    tablet_landscape("Choose your battle mode", LOBBY_IMG,  "tablet10_screenshot_1.png")
    tablet_landscape("Draw paths. Clash. Win.", INGAME_IMG, "tablet10_screenshot_2.png")


# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("\nGenerating PathClash store assets...\n")

    make_app_icon()
    make_feature_graphic()
    make_phone_screenshots()
    make_tablet7_screenshots()
    make_tablet10_screenshots()

    print("\nDone! All assets saved to docs/screenshots/\n")
    print("Asset summary:")
    print("  app_icon.png               512x512    (앱 아이콘)")
    print("  feature_graphic.png        1024x500   (그래픽 이미지)")
    print("  phone_screenshot_1.png     1080x1920  (휴대전화 스크린샷 1)")
    print("  phone_screenshot_2.png     1080x1920  (휴대전화 스크린샷 2)")
    print("  tablet7_screenshot_1.png   1200x1920  (7인치 태블릿 1)")
    print("  tablet7_screenshot_2.png   1200x1920  (7인치 태블릿 2)")
    print("  tablet10_screenshot_1.png  1920x1200  (10인치 태블릿 1)")
    print("  tablet10_screenshot_2.png  1920x1200  (10인치 태블릿 2)")
