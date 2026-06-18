"""Generate extension icons: rounded-square gradient with a magnifier glyph.

Pure stdlib (zlib/struct) so no imaging libraries are needed.
"""
import math
import os
import struct
import zlib


def png_bytes(width, height, rgba_rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(row) for row in rgba_rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def render(size, ss=4):
    """Render at size*ss then box-downsample for anti-aliasing."""
    big = size * ss
    px = [[0.0] * (big * 4) for _ in range(big)]

    corner = big * 0.22
    # Magnifier geometry (in big-pixel units)
    cx, cy = big * 0.44, big * 0.44
    r_outer, r_inner = big * 0.22, big * 0.14
    hx0, hy0 = cx + r_outer * 0.72, cy + r_outer * 0.72
    hx1, hy1 = big * 0.78, big * 0.78
    h_w = big * 0.055

    c1 = (99, 102, 241)   # indigo
    c2 = (34, 211, 238)   # cyan

    for y in range(big):
        for x in range(big):
            # Rounded-rect coverage
            dx = max(corner - x, x - (big - 1 - corner), 0)
            dy = max(corner - y, y - (big - 1 - corner), 0)
            d = math.hypot(dx, dy)
            alpha = 1.0 - smoothstep(corner - 1.5, corner + 0.5, d)
            if alpha <= 0:
                continue

            t = (x + y) / (2 * big)  # diagonal gradient
            r, g, b = (lerp(c1[i], c2[i], t) for i in range(3))

            # Lens ring
            dist_c = math.hypot(x - cx, y - cy)
            ring = smoothstep(r_inner - 1.5, r_inner + 1.5, dist_c) * (
                1.0 - smoothstep(r_outer - 1.5, r_outer + 1.5, dist_c)
            )
            # Handle: distance to segment
            vx, vy = hx1 - hx0, hy1 - hy0
            seg_t = max(0.0, min(1.0, ((x - hx0) * vx + (y - hy0) * vy) / (vx * vx + vy * vy)))
            dist_h = math.hypot(x - (hx0 + seg_t * vx), y - (hy0 + seg_t * vy))
            handle = 1.0 - smoothstep(h_w - 1.5, h_w + 1.5, dist_h)

            glyph = min(1.0, ring + handle)
            r, g, b = (lerp(v, 255, glyph * 0.96) for v in (r, g, b))

            i = x * 4
            px[y][i:i + 4] = [r, g, b, alpha * 255]

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    src = px[y * ss + sy]
                    i = (x * ss + sx) * 4
                    a = src[i + 3] / 255.0
                    acc[0] += src[i] * a
                    acc[1] += src[i + 1] * a
                    acc[2] += src[i + 2] * a
                    acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if a > 0:
                row += [int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(a * 255)]
            else:
                row += [0, 0, 0, 0]
        rows.append(row)
    return rows


out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)
for size in (16, 32, 48, 128):
    path = os.path.join(out_dir, f"icon{size}.png")
    with open(path, "wb") as f:
        f.write(png_bytes(size, size, render(size)))
    print(f"wrote {path}")
