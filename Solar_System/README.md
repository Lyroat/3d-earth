# 太阳系

集中存放太阳系相关的交互展示。`sem/` 保留现有日-地-月教学场景，`system/` 用于后续整个太阳系的比例展示，`textures/` 统一存放太阳系贴图。

## 当前结构

```text
Solar_System/
├── README.md
├── sem/                     # Sun–Earth–Moon：日-地-月专题
│   └── sem.js               # 场景、动画、观察模式、交互控制
├── system/                  # 预留：太阳系比例展示的程序、页面
│   └── README.md
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

- `app.js` 从 `./Solar_System/sem/sem.js` 导入 `init`，继续使用原有 `semGroup`、`toggleSEM`、`updateSEM` 等接口。
- 日-地-月模块从 `Solar_System/textures/sun.jpg` 和 `Solar_System/textures/moon.jpg` 加载太阳、月球贴图；地球贴图继续复用 `earth/main/earth.jpg`，不重复拷贝。
- HTML 面板、公共样式、知识卡片管理和中英文文案仍由根目录的 `index.html`、`style.css`、`app.js`、`i18n/lang.js` 管理；现有 `sem-*` 元素标识不变。
- 模块中的贴图路径相对于应用页面；`vite.config.js` 将当前使用的太阳、月球贴图同步复制到 `dist/Solar_System/textures/`，保证开发和构建后的路径一致。
- 其他行星贴图保留在 `textures/`，目前尚未接入场景或加入打包清单；后续开发 `system/` 时再按需接入，避免将未使用的大图打入当前页面。

## 后续扩展

- 新的太阳系全景展示在 `system/` 中开发，复用 `textures/` 的贴图，不覆盖现有 `sem/` 日-地-月教学场景。
- 当前日-地-月场景的尺寸和距离为便于观察而调整，**不是统一真实比例**；本次迁移不改变这些参数。
- 开发比例展示时，应单独定义天体实际尺寸、轨道距离和时间数据，并明确显示比例，区分“真实比例”与“教学放大”。
