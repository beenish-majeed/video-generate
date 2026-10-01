import numpy as np
import torch
import pytest

def test_wav2lip_tensor_shapes():
    # Simulate face crop 96x96
    face_rgb = np.ones((96, 96, 3), dtype=np.uint8) * 128
    face_masked = face_rgb.copy()
    face_masked[48:, :] = 0

    # 6-channel concatenation
    input_6ch = np.concatenate((face_masked, face_rgb), axis=2).astype(np.float32) / 255.0
    assert input_6ch.shape == (96, 96, 6)

    # Batch of 4 frames -> transpose to (B, 6, 96, 96)
    b_imgs = np.stack([input_6ch] * 4, axis=0)
    b_imgs_tensor = torch.FloatTensor(b_imgs.transpose(0, 3, 1, 2))
    assert b_imgs_tensor.shape == (4, 6, 96, 96)

    # 4D mel window tensor shape (B, 1, 80, 16)
    mel_chunk = np.ones((80, 16), dtype=np.float32)
    b_mels = np.stack([mel_chunk] * 4, axis=0).reshape(4, 1, 80, 16)
    b_mels_tensor = torch.FloatTensor(b_mels)
    assert b_mels_tensor.shape == (4, 1, 80, 16)
