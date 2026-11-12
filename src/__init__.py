"""
Core application package initialization.
"""

# Python 3.14 array_api / scipy compatibility guard for incomplete torch namespace
try:
    import torch
    if not hasattr(torch, "Tensor"):
        class _TorchTensorPlaceholder:
            pass
        torch.Tensor = _TorchTensorPlaceholder
except Exception:
    pass
