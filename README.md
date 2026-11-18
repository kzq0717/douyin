# 红果短剧电商商家赋能工具 · v2.0 工程仓库

> 合规的商家侧技术服务工具：**瘦中继后端（Express/TS）+ Web 交互工作台（React/TS）+ Windows 桌面客户端（Qt 6.5 / C++17）**。

---

## 仓库目录结构

```text
.
├── README.md                         # 本说明文档
├── server.ts                         # v2.0 瘦中继后端（托管 app_secret、下发渠道热更新规则、源码归档下载）
├── src/
│   ├── core/                         # Pure TypeScript 核心引擎（6 项单元测试已验证）
│   ├── components/                   # Web 版看板 / 批量台 / 识图实验室 / 评审报告 / 方案导出
│   └── data/                         # 可行性评估与 v2.0 技术方案数据
├── desktop/HongguoTool/              # Qt 6.5 + C++17 Windows 桌面客户端工程
│   ├── CMakeLists.txt                # CMake 构建（支持开关 ONNX Runtime）
│   ├── cmake/FindONNXRuntime.cmake
│   ├── src/core/                     # 纯 C++17 核心算法库（零 Qt 依赖，ExactCosineIndex 替代 FAISS）
│   ├── src/infra/                    # OAuth 回环授权、SQLite WAL 单写队列、QImage+ONNX 嵌入器
│   ├── src/ui/                       # Qt Widgets 主窗口与四象限工作台
│   ├── resources/                    # channel_rules.json、alert_rules.json、合规文案
│   └── tests/core_tests.cpp          # CTest 纯 C++17 单元测试
├── docs/
│   ├── TECH_SPEC_v2.md               # 优化版技术方案（v2.0）
│   ├── WINDOWS_BUILD_GUIDE.md        # Windows + MSVC + Qt6 + ONNX Runtime 编译打包指南
│   └── API_FIELD_MAPPING.md          # 抖店 / 千川官方 API 字段映射与 M0 验证清单
├── scripts/
│   └── export_clip_onnx.py           # CLIP ViT-B/32 视觉编码器 ONNX 导出与 INT8 量化脚本
└── packaging/
    ├── build_win.ps1                 # Windows 一键编译 + windeployqt + 打包脚本
    └── installer.iss                 # Inno Setup 安装包脚本
```

---

## 快速启动（Web 工作台 + 瘦中继后端）

```bash
# 1. 安装依赖
npm install

# 2. 运行 Pure Core 单元测试
npx --yes tsx --test src/core/core.test.ts

# 3. 启动全栈服务（默认监听 3000 端口）
npm run dev
```

---

## 编译桌面端与核心测试（Qt6 / C++17）

### 仅验证 C++17 核心算法与单元测试（跨平台，无需 Qt）

```bash
cmake -S desktop/HongguoTool -B build_core -DBUILD_DESKTOP_APP=OFF
cmake --build build_core --config Release
ctest --test-dir build_core --output-on-failure
```

### 编译完整 Windows Qt6 桌面端

请参见详细指南：[docs/WINDOWS_BUILD_GUIDE.md](docs/WINDOWS_BUILD_GUIDE.md)，或直接运行：

```powershell
.\packaging\build_win.ps1 -QtRoot "C:\Qt\6.5.3\msvc2019_64"
```
