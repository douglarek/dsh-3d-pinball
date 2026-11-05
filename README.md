# dsh-3d-pinball

一个 Full Tilt! Pinball 风格的 3D 弹球台，作为 DeepSeek Harness 侧边栏面板插件运行。

侧边栏新增一个球台图标入口，点开后中间栏变成完整可玩的弹球台：发射道、顶部轨道、保险杠、弹射器、掉落靶、双挡板，以及记分、倍数和音效。所有画面由 Canvas 2D 现场绘制，没有外部美术资源，也没有构建步骤。

> 这是一个原创实现，玩法与视觉致敬经典桌面弹球；不包含、也不分发任何原版游戏素材，与 Microsoft / Cinematronics / Maxis 无关联。

## 功能

- 侧边栏入口 + 中间栏全局面板（`main` 面板键 `pinball`），与 Plugins、Tasks、Statistics 同级。
- 物理球台：重力、线段与圆形碰撞、移动挡板的角速度传递、单向闸门、防卡球保护。
- 玩法：3 个弹射器、2 个保险杠、3 个掉落靶（打满一组倍数 +1，最高 ×5）、蓄力发射、掉球判定、3 球一局、最高分。
- 键盘与指针双操作：左右方向键控制挡板，空格蓄力发射；也可点按画布左右半边。
- 合成音效（WebAudio），可静音；面板切换后对局保留。
- 中英双语，跟随 Harness 语言设置；容器与控件只使用宿主的 `--dsw-alias-*` 主题变量。

## 安装

在 Harness 的 **Plugins** 页面选择从 GitHub 安装，填入：

```
github:douglarek/dsh-3d-pinball
```

或使用随 Harness 分发的 CLI：

```sh
dsh plugin --profile <profile> install github:douglarek/dsh-3d-pinball
```

安装后侧边栏出现球台图标，点击即可开局。卸载：在 Plugins 页面移除该 bundle。

## 操作

| 操作 | 按键 |
| --- | --- |
| 左挡板 | `←` / `Z` |
| 右挡板 | `→` / `/` |
| 蓄力发射 | 按住 `Space`，松开发射 |
| 暂停 / 继续 | `P` |
| 静音 | `M` |
| 结束后重开 | `Enter` |

点按球台左半边或右半边同样可以控制对应挡板；准备状态点按画布可蓄力并发射。

## 窗口按钮避让（macOS）

面板标题与工具栏（记分卡、按钮）在同一个 header 中，按 Harness 的窗口 chrome 契约留白，仅在 `html[data-platform='darwin']` 下生效：

- `padding-top` 叠加 `--dsh-frame-top-clearance`（48px，窗口顶部条带）；
- `padding-left` 叠加 `--dsh-frame-leading-clearance`（侧栏收起时 160px，原生全屏 84px），使标题和工具栏整体位于红绿灯与顶部控制带右侧；
- header 标记 `data-window-drag`，空白区域可拖动窗口，按钮按宿主 base.css 规则自动保持可点击。

浏览器中打开（非桌面端）时这两个变量不存在，留白为 0，布局不受影响。

## 实现

- `index.js` — Host 半侧，无服务注册（纯 UI 插件）。
- `client.js` — 浏览器半侧：物理引擎、Canvas 渲染、React 面板、Slot 注册（`main#pinball` 与 `sidebar.panellist#pinball`）。
- `locale/{en,zh}.json` — 插件显示元数据；面板文案在 `client.js` 内通过 `ctx.locale.register` 注册。
- `icon.svg` — 插件列表图标。

面板与侧边栏图标通过 `ctx.slots.inject` + `ctx.slots.register` 注册，样式随组件卸载移除，键盘监听在 `useEffect` 清理时移除。

## 兼容性

依赖 Harness 的槽位契约 `main` 与 `sidebar.panellist`，以及 `layout` 发布的窗口 chrome 变量。在较早版本上这两个槽位不存在时插件不会渲染，也不会报错影响其他面板。

## License

MIT
