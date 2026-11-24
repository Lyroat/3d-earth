# 太阳系 · 2.0

本模块随 3D Earth 2.0（`v2.0.0`，2026-11-24）发布。新版统一太阳系与日地月观测入口及界面；详细操作、比例和精度限制见 [`system/README.md`](system/README.md)。

集中存放太阳系相关的交互展示。`system/` 提供同页切换的“太阳系观测 / 日地月系统观测”；`sem/` 是独立于页面的日地月教学模块，`textures/` 统一存放贴图。

## 当前结构

```text
Solar_System/
├── README.md
├── sem/                     # Sun–Earth–Moon：日-地-月专题
│   ├── sem.js               # 纯场景、动画和观察 API，不绑定页面
│   ├── model.js             # 独立教学时钟、状态、分至点
│   └── sem-ui.js            # 教学面板、知识卡片、事件绑定与释放
├── system/                  # 真实比例太阳系观测台
│   ├── index.html           # 独立页面入口
│   ├── system.js            # 场景、贴图、控制与时钟
│   ├── system.css           # 观测台样式
│   ├── data.js              # 物理尺寸与参考常量
│   ├── astronomy.js         # 星历位置、IAU 自转轴及相位
│   ├── appearance.js        # 原位可视化放大、可见尺寸与镜头防穿入
│   ├── mode-controller.js   # 异步双模式切换与状态保留
│   ├── view-state.js        # 镜头、缩放限制、平移目标的保存与还原
│   ├── asteroids.js         # 程序岩石材质与示意主带
│   ├── system.test.js       # 自动测试
│   └── README.md            # 操作与精度说明
└── textures/                # 共用贴图资源
    ├── sun.jpg              # 太阳
    ├── moon.jpg             # 月球
    ├── Mercury.jpg          # 水星
    ├── Venus_Surface.jpg    # 金星表面
    ├── Venus_Atmosphere.jpg # 金星大气
    ├── Mars.jpg             # 火星
    ├── Jupiter.jpg          # 木星
    ├── Saturn.jpg           # 土星
    ├── Saturn_Ring.png      # 土星环
    ├── Uranus.jpg           # 天王星
    └── Neptune.jpg          # 海王星
```

## 与主应用的连接

- 根 `app.js` 只负责地球探索，不再初始化日地月场景、隐藏面板或重复事件。首页只保留“太阳系观测”入口，进入默认全景后，顶部才提供“日地月系统观测”切换。`Solar_System/system/#sem` 深链接仍可使用。
- 观测台使用一个 renderer、camera、OrbitControls 和动画循环，太阳系与日地月分别拥有 Scene，只更新和渲染当前场景。日地月代码按需载入，不使用 iframe 或复制一份场景。
- 切换时分别保存镜头位置、目标、FOV、zoom、near/far 和距离限制；时间、速度、暂停、标注、选中天体等各自保留。隐藏场景暂停进度，不把两套时间或比例混用。
- 两种模式复用左栏星球图标导航、“辅助显示”排版和开关样式。日地月的四个分至点分别有显示开关；分至点导航只跳转位置，不改变其显示设置。
- 日地月复用观测台已加载的太阳、地球、月球 Texture，地球继续使用 `earth/main/earth.jpg`。图片通过 Vite URL 资源机制构建，避免深层页面的相对路径错误及重复 GPU 贴图。
- 根页面与观测台共用 `ui/theme.css`；`ui/earth-ui.css` 将地球专题、卡片、搜索、照片弹窗统一到观测台风格。板块、震级等科学配色和三维效果不变。中英文文案共用 `i18n/lang.js`。

## 后续扩展

- 太阳系全景展示在 `system/` 中开发，教学场景仍在 `sem/`，通过页面控制器连接。默认尺寸与距离同尺，10× / 25× 为原位可视化观察档位（太阳与行星共同放大，球体大小示意，不是真实尺寸倍数），中心位置与轨道不变，无移位副本或引线。
- 当前日-地-月场景的尺寸和距离为便于观察而调整，**不是统一真实比例**；本次迁移不改变这些参数。
- 太阳系位置与自转来自 Astronomy Engine 解析星历 / IAU 模型，真实比例、教学放大、小行星示意与贴图精度详见 `system/README.md`；页面放大操作区保留尺寸示意提醒，不再提供右上角模型说明按钮。
