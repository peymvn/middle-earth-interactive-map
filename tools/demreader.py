"""Windowed reader for the Arda 32k DEM quadrant GeoTIFFs (tiled, deflate, predictor 2).

Reads only the 256x256 TIFF tiles that intersect a requested window, so memory stays
small even though the full mosaic is 32257 x 32257 uint16 (2 GB).
"""
import numpy as np
import tifffile

QUAD_SPLIT = 16128
MOSAIC = 32257


class Quad:
    def __init__(self, path):
        self.tif = tifffile.TiffFile(path)
        self.page = self.tif.pages[0]
        self.h, self.w = self.page.shape[:2]
        self.th, self.tw = self.page.tile[:2]
        self.ntx = -(-self.w // self.tw)
        self.cache = {}

    def tile(self, ty, tx):
        key = (ty, tx)
        if key not in self.cache:
            if len(self.cache) > 600:  # ~80 MB of decoded tiles
                self.cache.clear()
            idx = ty * self.ntx + tx
            fh = self.tif.filehandle
            fh.seek(self.page.dataoffsets[idx])
            data = fh.read(self.page.databytecounts[idx])
            arr = self.page.decode(data, idx)[0]
            self.cache[key] = arr.reshape(self.th, self.tw)
        return self.cache[key]

    def read(self, r0, r1, c0, c1):
        out = np.zeros((r1 - r0, c1 - c0), np.uint16)
        for ty in range(r0 // self.th, (r1 - 1) // self.th + 1):
            for tx in range(c0 // self.tw, (c1 - 1) // self.tw + 1):
                t = self.tile(ty, tx)
                ys, xs = ty * self.th, tx * self.tw
                a0, a1 = max(r0, ys), min(r1, ys + self.th)
                b0, b1 = max(c0, xs), min(c1, xs + self.tw)
                out[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = t[a0 - ys:a1 - ys, b0 - xs:b1 - xs]
        return out


class Mosaic:
    def __init__(self, folder):
        self.q = {k: Quad(f'{folder}/dem_{k}.tif') for k in ('nw', 'ne', 'sw', 'se')}

    def read(self, r0, r1, c0, c1):
        """Read mosaic window [r0,r1) x [c0,c1); out-of-range is clamped to the edge."""
        rr = np.clip(np.arange(r0, r1), 0, MOSAIC - 1)
        cc = np.clip(np.arange(c0, c1), 0, MOSAIC - 1)
        R0, R1, C0, C1 = rr.min(), rr.max() + 1, cc.min(), cc.max() + 1
        win = np.zeros((R1 - R0, C1 - C0), np.uint16)
        S = QUAD_SPLIT
        for name, (qr, qc) in {'nw': (0, 0), 'ne': (0, S), 'sw': (S, 0), 'se': (S, S)}.items():
            q = self.q[name]
            a0, a1 = max(R0, qr), min(R1, qr + q.h)
            b0, b1 = max(C0, qc), min(C1, qc + q.w)
            if a0 < a1 and b0 < b1:
                win[a0 - R0:a1 - R0, b0 - C0:b1 - C0] = q.read(a0 - qr, a1 - qr, b0 - qc, b1 - qc)
        return win[np.ix_(rr - R0, cc - C0)]
