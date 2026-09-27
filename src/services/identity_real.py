import cv2
import numpy as np
from pathlib import Path
from uuid import uuid4
from insightface.app import FaceAnalysis
from src.utils.hash import sha256_file


class RealIdentityBuilder:
    def __init__(self):
        # Initialize face analyzer using CPU provider
        self.face_app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
        self.face_app.prepare(ctx_id=-1, det_size=(640, 640))

    def build_identity_pack(self, photo_path: Path, job_path: Path) -> dict:
        img = cv2.imread(str(photo_path))
        if img is None:
            raise ValueError(f"Could not read image at {photo_path}")

        faces = self.face_app.get(img)
        
        if len(faces) == 0:
            raise ValueError("No face detected in the uploaded photo.")
        
        # Take the largest face
        face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
        
        # Get embedding
        embedding = face.embedding
        
        # Crop face region with some margin for better Wav2Lip input
        x1, y1, x2, y2 = [int(v) for v in face.bbox]
        w = x2 - x1
        h = y2 - y1
        cx, cy = x1 + w//2, y1 + h//2
        
        # Add 20% margin
        margin_x = int(w * 0.2)
        margin_y = int(h * 0.2)
        
        x1_c = max(0, cx - w//2 - margin_x)
        y1_c = max(0, cy - h//2 - margin_y)
        x2_c = min(img.shape[1], cx + w//2 + margin_x)
        y2_c = min(img.shape[0], cy + h//2 + margin_y)
        
        face_crop = img[y1_c:y2_c, x1_c:x2_c]
        
        crop_path = job_path / "face_reference.jpg"
        cv2.imwrite(str(crop_path), face_crop)

        pack = {
            "identity_pack_id": f"idpack_{uuid4().hex[:12]}",
            "source_photo_sha256": sha256_file(photo_path),
            "embedding": embedding.tolist(),
            "bbox": [x1_c, y1_c, x2_c, y2_c], # Store adjusted bbox
            "canonical_reference_image": str(crop_path),
            "seed": int(np.random.randint(0, 1000000)),
            "notes": "Real InsightFace embedding extracted."
        }
        
        return pack