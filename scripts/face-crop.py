#!/usr/bin/env python3
# Square crop centred on a person's face (Brandon, 2026-11-20: Naomi Klein's tall photo showed hair and a bookshelf in
# the round avatar, which crops every photo at a fixed "center 20%"). Prints "x y size" for the largest frontal face
# found by OpenCV's Haar cascade and confirmed by its alt2 cascade (one cascade alone took Michael D. Higgins's tie for
# a face), the square placed so the face centre sits at FACE_AT of its height (head and some
# shoulders) and clamped inside the image; prints nothing for a square image or when no face is confirmed, so the caller
# keeps the image as it is.
# Needs OpenCV with its face cascades (apt install python3-opencv: /usr/share/opencv4/haarcascades).
#   python3 -I scripts/face-crop.py <image>   ("-" reads the image from stdin; images.js passes each new thumbnail)
import os
import sys
import cv2
import numpy as np

CASCADES = [getattr(getattr(cv2, "data", None), "haarcascades", ""), "/usr/share/opencv4/haarcascades/"]
CASCADE_DIR = next(d for d in CASCADES if d and os.path.exists(os.path.join(d, "haarcascade_frontalface_default.xml")))

FACE_AT = 0.45  # face centre, as a fraction of the square's height from its top


def main(path):
    img = cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(), np.uint8), cv2.IMREAD_COLOR) if path == "-" else cv2.imread(path)
    if img is None:
        return
    h, w = img.shape[:2]
    side = min(w, h)
    if abs(w - h) < 4:
        return
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    m = max(24, int(side * 0.12))
    cascade = lambda name: cv2.CascadeClassifier(os.path.join(CASCADE_DIR, name))
    faces = cascade("haarcascade_frontalface_default.xml").detectMultiScale(gray, 1.1, 6, minSize=(m, m))
    if not len(faces):
        return
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    cx, cy = fx + fw / 2, fy + fh / 2
    others = cascade("haarcascade_frontalface_alt2.xml").detectMultiScale(gray, 1.1, 3, minSize=(m, m))
    if not any(abs(cx - (x + w2 / 2)) < fw / 2 and abs(cy - (y + h2 / 2)) < fh / 2 for x, y, w2, h2 in others):
        return
    x = min(max(0, round(cx - side / 2)), w - side)
    y = min(max(0, round(cy - side * FACE_AT)), h - side)
    print(x, y, side)


if __name__ == "__main__":
    main(sys.argv[1])
