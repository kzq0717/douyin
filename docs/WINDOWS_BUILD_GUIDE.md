# Windows Qt6 桌面端编译与打包指南

## 1. 环境准备

| 组件 | 推荐版本 | 说明 |
|---|---|---|
| **IDE / 编译器** | Visual Studio 2022（MSVC v143）或 VS 2019 | Qt6 与现代 ONNX Runtime 均不再支持 VS2013 |
| **Qt 框架** | Qt 6.5.3 LTS (`msvc2019_64`) | 需勾选 `Core`、`Gui`、`Widgets`、`Network`、`Sql` |
| **CMake** | 3.21+ | 随 VS2022 或单独安装 |
| **ONNX Runtime（可选）** | `onnxruntime-win-x64-1.19.2` | 不启用时可先用 `-DENABLE_ONNXRUNTIME=OFF` 编译 UI 骨架与内置空间特征检索 |
| **Python（导出模型用）** | Python 3.10+ | 仅开发机导出/量化 CLIP ONNX 时使用 |
| **打包工具** | `windeployqt` + Inno Setup 6 | 生成免安装绿色包与 Windows 安装包 |

---

## 2. 导出 CLIP ViT-B/32 INT8 模型（可选，启用真实语义向量）

```bash
pip install torch transformers onnx onnxruntime
python scripts/export_clip_onnx.py --output-dir desktop/HongguoTool/resources/models
```

将下载好的 `onnxruntime-win-x64-1.19.2` 解压至 `desktop/HongguoTool/third_party/onnxruntime`。

---

## 3. CMake 编译与运行单元测试

### 3.1 仅编译纯 C++17 核心单测（快速验证逻辑）

```powershell
cmake -S desktop/HongguoTool -B build_core -DBUILD_DESKTOP_APP=OFF
cmake --build build_core --config Release
ctest --test-dir build_core -C Release --output-on-failure
```

### 3.2 编译完整 Qt6 桌面端

```powershell
cmake -S desktop/HongguoTool -B build_win `
  -G "Visual Studio 17 2022" -A x64 `
  -DCMAKE_PREFIX_PATH="C:\Qt\6.5.3\msvc2019_64" `
  -DENABLE_ONNXRUNTIME=ON `
  -DONNXRUNTIME_ROOT="desktop/HongguoTool/third_party/onnxruntime"

cmake --build build_win --config Release
ctest --test-dir build_win -C Release --output-on-failure
```

---

## 4. 一键打包与代码签名

使用 PowerShell 执行：

```powershell
.\packaging\build_win.ps1 `
  -QtRoot "C:\Qt\6.5.3\msvc2019_64" `
  -EnableOnnxRuntime:$true `
  -OnnxRoot "desktop\HongguoTool\third_party\onnxruntime"
```

打包完成后在 `dist_win/HongguoTool/` 下生成绿色运行目录及 `dist_win/HongguoTool-v2.0-win64.zip`。
若向外部商家试点交付，**强烈建议**使用 OV/EV 代码签名证书对 `HongguoTool.exe` 与安装包进行 `signtool` 签名，避免被 Windows SmartScreen 或国产安全软件误拦截。
