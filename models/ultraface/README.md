# UltraFace RFB-320

Detector de rostos usado pela moderação de fotos de usuário (`src/modules/user-photos/moderation/face-layer.ts`).

- Origem: ONNX Model Zoo, `validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx`
  (https://github.com/onnx/models), baixado em 2026-11-03.
- sha256: `34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017`
- Licença: MIT, Copyright (c) 2019 linzai (https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB).
- Entrada 1×3×240×320 (RGB, (pixel − 127) / 128); saídas `scores` [1, 4420, 2] e `boxes` [1, 4420, 4] normalizados.
