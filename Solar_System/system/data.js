// Kilometres, sidereal days, and Julian years. No display-scale values live here.
// Radii/orbits: NASA fact sheets; Sun radius: IAU 2015 B3; spin reference: IAU model.
export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;
export const YEAR_DAYS = 365.256363004;
export const MIN_TIME = Date.UTC(1900, 0, 1);
export const MAX_TIME = Date.UTC(2101, 0, 1) - 1;
export const SIZE_OPTIONS = [1, 10, 25];
export const BODIES = [
  { id: 'Sun', name: '太阳', en: 'SUN', radius: 695700, polar: 695700, period: 0, rotation: 25.38, tilt: 7.25, color: '#e9b76c', type: '恒星', description: '太阳系的中心恒星。与行星一起参与原位观察放大，原尺寸下恢复真实比例；自转采用 IAU 参考经线的角速度，不模拟较差自转。' },
  { id: 'Mercury', name: '水星', en: 'MERCURY', radius: 2439.7, polar: 2439.7, period: 87.9691, rotation: 58.6462, tilt: 0.034, color: '#b3afa5', type: '类地行星', description: '最靠近太阳的行星。每公转两周约自转三圈；轨道明显偏心，运行速度并非恒定。' },
  { id: 'Venus', name: '金星', en: 'VENUS', radius: 6051.8, polar: 6051.8, period: 224.701, rotation: -243.025, tilt: 177.36, color: '#dec497', type: '类地行星', description: '缓慢逆向自转。默认显示浓厚云层；可切换地表贴图。云层随参考自转模型转动，未另行模拟大气超旋转。' },
  { id: 'Earth', name: '地球', en: 'EARTH', radius: 6378.137, polar: 6356.752, period: YEAR_DAYS, rotation: 0.99726968, tilt: 23.4393, color: '#81afcf', type: '类地行星', description: '蓝色的家园。使用原有地球贴图，保留赤道与极半径差异；轴向含岁差、章动，月球位置也由星历计算。' },
  { id: 'Mars', name: '火星', en: 'MARS', radius: 3396.2, polar: 3376.2, period: 686.980, rotation: 1.02595676, tilt: 25.19, color: '#c48c73', type: '类地行星', description: '自转周期略长于地球，轴倾斜也与地球相近。椭圆轨道与轨道倾角均由星历位置体现。' },
  { id: 'Jupiter', name: '木星', en: 'JUPITER', radius: 71492, polar: 66854, period: 4332.589, rotation: 0.41354, tilt: 3.13, color: '#c5af97', type: '气态巨行星', description: '太阳系最大的行星，自转不到十小时。使用参考经度系统显示整体转动，不模拟不同纬度的风带运动。' },
  { id: 'Saturn', name: '土星', en: 'SATURN', radius: 60268, polar: 54364, period: 10759.22, rotation: 0.44401, tilt: 26.73, color: '#d5c39d', type: '气态巨行星', ringInner: 66900, ringOuter: 140180, description: '扁率明显的气态巨行星。主要可见环位于赤道面，按约 66,900—140,180 km 的中心距离绘制；放大时球体与环同步放大。' },
  { id: 'Uranus', name: '天王星', en: 'URANUS', radius: 25559, polar: 24973, period: 30685.4, rotation: -0.71833, tilt: 97.77, color: '#a3cdd0', type: '冰巨行星', description: '几乎“躺着”绕太阳运行。采用 IAU 北极定义及逆向转动；未展示微弱的行星环。' },
  { id: 'Neptune', name: '海王星', en: 'NEPTUNE', radius: 24764, polar: 24341, period: 60189, rotation: 360 / 541.1397757, tilt: 28.32, color: '#779cc9', type: '冰巨行星', description: '八大行星中距离太阳最远，公转一周约 165 年。自转采用 IAU 参考周期约 15.97 小时；蓝色大气纹理是静态素材，不表示当前天气。' },
  { id: 'Moon', name: '月球', en: 'MOON', radius: 1737.4, polar: 1737.4, period: 27.321661, rotation: 27.321661, tilt: 6.68, color: '#bcbdbd', type: '地球卫星', description: '绕地球运行并近似同步自转。轨道位置和转轴含模型中的月球摄动与天平动；全局放大会改变地月间的表观尺寸关系。' },
];
export const BODY_BY_ID = Object.fromEntries(BODIES.map(body => [body.id, body]));
export const radiusAU = (body, scale = 1) => body.radius / AU_KM * scale;
export const polarAU = (body, scale = 1) => body.polar / AU_KM * scale;
