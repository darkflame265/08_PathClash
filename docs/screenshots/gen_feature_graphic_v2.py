"""
PathClash Feature Graphic v2 - Korean version
1024 x 500 px  (Google Play feature graphic)
"""

from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1024, 500
OUT = "feature_graphic_v2.png"

# ── colour palette ─────────────────────────────────────────────────────────
BG          = (18, 24, 27)       # #12181B
PANEL       = (30, 37, 43)       # #1E252B
TILE        = (42, 49, 55)       # #2A3137
TILE_BORDER = (58, 68, 77)       # #3A444D
RED         = (239, 68, 68)      # #EF4444
BLUE        = (59, 130, 246)     # #3B82F6
WHITE       = (255, 255, 255)
MUTED       = (148, 163, 184)    # slate-400

FONT_DIR = "C:/Windows/Fonts/"

def load(path, size):
    return ImageFont.truetype(path, size)

# fonts
font_title = load(FONT_DIR + "malgunbd.ttf", 78)
font_sub   = load(FONT_DIR + "NotoSansKR-VF.ttf", 28)
font_tag   = load(FONT_DIR + "NotoSansKR-VF.ttf", 22)
font_badge = load(FONT_DIR + "NotoSansKR-VF.ttf", 20)
font_ver   = load(FONT_DIR + "malgun.ttf", 16)

# ── canvas ─────────────────────────────────────────────────────────────────
img  = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# left gradient  (dark → red glow toward top-left)
for x in range(510):
    t = 1 - (x / 510)
    t = t ** 1.9
    r = int(18 + (175 - 18) * t * 0.52)
    g = int(24 * (1 - t * 0.35))
    b = int(27 * (1 - t * 0.35))
    draw.line([(x, 0), (x, H)], fill=(r, g, b))

# ── right panel — game board ────────────────────────────────────────────────
BOARD_LEFT   = 555
BOARD_TOP    = 50
TILE_SIZE    = 72
GAP          = 8
COLS = ROWS  = 5

def tile_rect(col, row):
    x = BOARD_LEFT + col * (TILE_SIZE + GAP)
    y = BOARD_TOP  + row * (TILE_SIZE + GAP)
    return x, y, x + TILE_SIZE, y + TILE_SIZE

# draw tiles
for row in range(ROWS):
    for col in range(COLS):
        x0, y0, x1, y1 = tile_rect(col, row)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=10,
                                fill=TILE, outline=TILE_BORDER, width=1)

# paths — (col, row)
path_blue = [(3, 0), (3, 1), (3, 2), (4, 2), (4, 3)]
path_red  = [(0, 2), (1, 2), (1, 3), (2, 3), (2, 4)]

LINE_W = 9
BALL_R = 14

def tile_center(col, row):
    x0, y0, x1, y1 = tile_rect(col, row)
    return (x0 + x1) // 2, (y0 + y1) // 2

def draw_path(pts, color):
    for i in range(len(pts) - 1):
        ax, ay = tile_center(*pts[i])
        bx, by = tile_center(*pts[i + 1])
        draw.line([(ax, ay), (bx, by)], fill=color, width=LINE_W)

draw_path(path_blue, BLUE)
draw_path(path_red,  RED)

def draw_ball(col, row, color):
    cx, cy = tile_center(col, row)
    # outer glow ring
    glow = (*color[:3],)
    draw.ellipse([cx - BALL_R - 3, cy - BALL_R - 3,
                  cx + BALL_R + 3, cy + BALL_R + 3],
                 fill=(*[max(0, c - 120) for c in color],))
    draw.ellipse([cx - BALL_R, cy - BALL_R,
                  cx + BALL_R, cy + BALL_R], fill=color)

draw_ball(*path_blue[0], BLUE)
draw_ball(*path_red[0],  RED)

# ── left panel — text ───────────────────────────────────────────────────────
TX = 58

# --- title -------------------------------------------------------------------
title_y = 112
path_txt  = "Path"
clash_txt = "Clash"

pb = draw.textbbox((0, 0), path_txt,  font=font_title)
cb = draw.textbbox((0, 0), clash_txt, font=font_title)
path_w = pb[2] - pb[0]

draw.text((TX,          title_y), path_txt,  font=font_title, fill=WHITE)
draw.text((TX + path_w, title_y), clash_txt, font=font_title, fill=BLUE)

# --- subtitle ----------------------------------------------------------------
sub_y = title_y + 92
draw.text((TX, sub_y), "1v1 실시간 경로 전략 게임", font=font_sub, fill=WHITE)

# --- tagline -----------------------------------------------------------------
tag_y = sub_y + 48
draw.text((TX, tag_y), "경로를 그려라.  충돌하라.  살아남아라.",
          font=font_tag, fill=RED)

# --- feature badges (no emoji — draw dot icon manually) ----------------------
BADGE_Y     = tag_y + 64
BADGE_H     = 40
PAD_LEFT    = 14   # space before dot
DOT_R       = 5    # dot radius
DOT_TEXT_GAP = 10  # gap between dot and text
PAD_RIGHT   = 16
BADGE_GAP   = 12
BADGE_RADIUS = 20

badge_specs = [
    ("PvP",    BLUE),
    ("AI 대전", (140, 100, 220)),   # purple accent
    ("온라인",  (52, 168, 110)),    # green accent
]

bx = TX
for label, dot_color in badge_specs:
    lb = draw.textbbox((0, 0), label, font=font_badge)
    lw = lb[2] - lb[0]
    lh = lb[3] - lb[1]

    # total badge width = PAD_LEFT + dot_diameter + DOT_TEXT_GAP + text_w + PAD_RIGHT
    bw = PAD_LEFT + DOT_R * 2 + DOT_TEXT_GAP + lw + PAD_RIGHT

    # badge background
    draw.rounded_rectangle(
        [bx, BADGE_Y, bx + bw, BADGE_Y + BADGE_H],
        radius=BADGE_RADIUS, fill=PANEL, outline=TILE_BORDER, width=1,
    )

    # small dot icon
    dot_cx = bx + PAD_LEFT + DOT_R
    dot_cy = BADGE_Y + BADGE_H // 2
    draw.ellipse([dot_cx - DOT_R, dot_cy - DOT_R,
                  dot_cx + DOT_R, dot_cy + DOT_R], fill=dot_color)

    # text
    tx = dot_cx + DOT_R + DOT_TEXT_GAP
    ty = BADGE_Y + (BADGE_H - lh) // 2 - lb[1]
    draw.text((tx, ty), label, font=font_badge, fill=WHITE)

    bx += bw + BADGE_GAP

# ── version tag ──────────────────────────────────────────────────────────────
draw.text((W - 62, H - 26), "v2  KR", font=font_ver, fill=(55, 65, 75))

# ── save ─────────────────────────────────────────────────────────────────────
img.save(OUT)
print(f"Saved -> {OUT}  ({W}x{H})")
