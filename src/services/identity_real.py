import cv2
import numpy as np
import threading
from pathlib import Path
from uuid import uuid4
import torch

try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False

from src.utils.hash import sha256_file


class RealIdentityBuilder:
    """
    Identity Builder for face detection and reference extraction.
    Thread-safe in-process execution using a threading.Lock() mutex.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return

        with self._lock:
            if getattr(self, "_initialized", False):
                return

            self.face_app = None
            insight_dir = Path.home() / ".insightface" / "models" / "buffalo_l"
            if INSIGHTFACE_AVAILABLE and insight_dir.exists():
                try:
                    providers = (
                        ['CUDAExecutionProvider', 'CPUExecutionProvider']
                        if torch.cuda.is_available()
                        else ['CPUExecutionProvider']
                    )
                    self.face_app = FaceAnalysis(name='buffalo_l', root=str(Path.home() / ".insightface"), providers=providers)
                    self.face_app.prepare(ctx_id=-1, det_size=(640, 640))
                except Exception as exc:
                    print(f"InsightFace init warning ({exc}). Using local OpenCV face detector.")
                    self.face_app = None

            # Check if local OpenCV cascade xml file exists
            cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
            if cascade_path.exists():
                self.cascade_path = str(cascade_path)
            else:
                self.cascade_path = None

            self._initialized = True

    def build_identity_pack(self, photo_path: Path, job_path: Path) -> dict:
        img = cv2.imread(str(photo_path))
        if img is None:
            raise ValueError(f"Could not read image at {photo_path}")

        h_img, w_img = img.shape[:2]
        faces = []

        with self._lock:
            if self.face_app is not None:
                try:
                    faces = self.face_app.get(img)
                except Exception as exc:
                    print(f"FaceAnalysis error during detection: {exc}")
                    faces = []

        if len(faces) > 0:
            face = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
            embedding = face.embedding.tolist() if hasattr(face, "embedding") and face.embedding is not None else []
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
        elif self.cascade_path is not None:
            face_cascade = cv2.CascadeClassifier(self.cascade_path)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            detected_faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))

            if len(detected_faces) > 0:
                fx, fy, fw, fh = max(detected_faces, key=lambda f: f[2] * f[3])
                x1, y1, x2, y2 = fx, fy, fx + fw, fy + fh
            else:
                margin_w = int(w_img * 0.1)
                margin_h = int(h_img * 0.1)
                x1, y1, x2, y2 = margin_w, margin_h, w_img - margin_w, h_img - margin_h
            embedding = []
        else:
            margin_w = int(w_img * 0.1)
            margin_h = int(h_img * 0.1)
            x1, y1, x2, y2 = margin_w, margin_h, w_img - margin_w, h_img - margin_h
            embedding = []

        w = x2 - x1
        h = y2 - y1
        cx, cy = x1 + w // 2, y1 + h // 2

        margin_x = int(w * 0.15)
        margin_y = int(h * 0.15)

        x1_c = max(0, cx - w // 2 - margin_x)
        y1_c = max(0, cy - h // 2 - margin_y)
        x2_c = min(w_img, cx + w // 2 + margin_x)
        y2_c = min(h_img, cy + h // 2 + margin_y)

        face_crop = img[y1_c:y2_c, x1_c:x2_c]
        crop_path = job_path / "face_reference.jpg"
        cv2.imwrite(str(crop_path), face_crop)

        pack = {
            "identity_pack_id": f"idpack_{uuid4().hex[:12]}",
            "source_photo_path": str(photo_path),
            "source_photo_sha256": sha256_file(photo_path),
            "embedding": embedding,
            "bbox": [x1_c, y1_c, x2_c, y2_c],
            "canonical_reference_image": str(crop_path),
            "seed": int(np.random.randint(0, 1000000)),
            "notes": "Identity extracted with face alignment.",
        }

        return pack