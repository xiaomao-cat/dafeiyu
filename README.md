# 大肥鱼合集

DeepSeek Harness 桌面插件与 Agent 技能的第三方目录页。纯静态站点，没有后端，没有构建步骤。

页面上每张卡片、搜索筛选、统计数字，**全部由 `assets/plugins.data.js` 里的一个数组生成**。
想加一款插件或技能，只改这一个文件，刷新页面就生效。

---

## 一、加一款插件（最常用）

### 方式 A：一条命令（推荐）

```bash
node tools/add-plugin.mjs <url> <名称> <一句话说明> <分类> [安装命令]
```

例：

```bash
node tools/add-plugin.mjs \
  https://github.com/owner/repo \
  "我的技能" \
  "一句话说清它干什么" \
  "效率" \
  "npx skills add owner/repo"
```

这条命令会：

1. 抓这条链接的活数据（GitHub 星数、许可、npm 近 30 天下载量、技能市场累计下载量、版本号）
2. 写进 `assets/plugins.data.js` 的数组末尾
3. 刷新 `assets/stats.js`（活数据）和 `assets/ph.css`（图标子集）

可选参数：

| 参数 | 作用 |
|---|---|
| `--note "说明文字"` | 卡片下方的备注 |
| `--warning "提示文字"` | 红色的特别提醒 |
| `--features "一,二,三"` | 功能点，逗号分隔 |
| `--extra "标签\|网址,标签\|网址"` | 额外的链接行 |
| `--host dsh\|codex\|skillhub\|skill-repo` | 手动指定宿主（默认按网址推断） |
| `--kind command\|prompt\|link` | 安装方式：终端命令 / 粘给 Agent / 只给链接 |

### 方式 B：手写一条

打开 `assets/plugins.data.js`，照抄下面这份模板：

```js
{
  url: "https://github.com/owner/repo",   // 必填，唯一的链接
  name: "我的插件",                        // 必填，显示名
  tagline: "一句话说清它是干什么的",        // 必填，副标题，也是搜索关键词
  category: "效率",                        // 必填，分类，会自动生成筛选按钮
  install: "npx skills add owner/repo",   // 选填，安装命令
  installKind: "command",                 // 选填 command | prompt | link
  note: "安装注意事项",                    // 选填，卡片下方的备注
  warning: "如果有授权之类的特别限制，写这里", // 选填，红色提示
  features: ["特性一", "特性二"],           // 选填，功能点
  extra: [                                // 选填，额外链接
    { label: "npm 包", url: "https://www.npmjs.com/package/my-plugin" }
  ],
  media: "assets/my-plugin.webp",         // 选填，展示图；没有就用分类图标占位
  host: "skill-repo"                      // 选填，不写按网址推断
}
```

**只有 url / name / tagline / category 是必填的**，其余全部自动推导：

| 自动推导的东西 | 规则 |
|---|---|
| 卡片 id | 从链接路径生成，如 `obra-superpowers` |
| 包名 pkg | GitHub 给 `owner/repo`，技能市场给 `owner/slug`，npm 给包名 |
| 宿主 host | `skillhub.cn` → 技能市场；`npmjs.com` → npm 包；GitHub → 技能仓库 |
| 链接区 | 主链接自动生成，再拼上 `extra` |
| 图标 | 按分类查 `assets/derive.js` 里的 `CATEGORY_ICON` |
| 排序 | 数组里越靠前越靠前；最后一条自动带「最新」角标 |

**星数、下载量、许可、作者不要手填**，跑这个脚本自动抓：

```bash
node tools/sync-stats.mjs
```

它会把结果写进 `assets/stats.js`，页面加载时自动盖在卡片上，同时同步 `index.html` 里的静态数字。

### 新分类要加图标

在 `assets/derive.js` 的 `CATEGORY_ICON` 里加一行，然后：

```bash
node tools/sync-icons.mjs
```

这个脚本扫全站用到的 `ph-*` 类名重新生成 `assets/ph.css`，图标子集漏了会渲染成空白，所以加了新图标一定要跑。

### 手改过之后整理格式

```bash
node tools/format-data.mjs
```

---

## 二、本地预览

```bash
cd dafeiyu-site
python3 -m http.server 8899 --bind 127.0.0.1
# 打开 http://127.0.0.1:8899/index.html
```

直接双击 `index.html` 也能看，但用本地服务器更接近线上效果。

---

## 三、上线部署

线上地址：**https://xiaomao-cat.github.io/dafeiyu/**

站点托管在 GitHub Pages 上，`dafeiyu-site/` 本身就是那个仓库（分支 `main`，根目录直出）。
没有构建步骤，不需要 Node 环境，push 完 GitHub 自动构建，一般十几秒上线。

### 日常更新：一条命令

```bash
node tools/publish.mjs
```

它会依次做四件事：刷新活数据（星数 / 下载量 / 许可）→ 重建图标子集 → 整理数据格式 →
`git commit && push` → 等 GitHub Pages 构建完并打印线上地址。

只想推当前内容、不想重新抓数（网络不稳时）：

```bash
node tools/publish.mjs --skip-stats
```

推的时候顺便写清楚改了什么：

```bash
node tools/publish.mjs --skip-stats --message="新增：xxx 插件"
```

### 想换个托管也行

整个 `dafeiyu-site` 目录就是成品，扔到 Vercel / Netlify / 对象存储都能跑。
只有一处要记得改：换了域名就把 `index.html` 里的 `canonical`、`og:url`、
`og:image`、`twitter:image` 四个地址一起换掉（社交分享卡片必须用绝对路径）。

---

## 四、目录结构

```
dafeiyu-site/
├── index.html              主页面
├── privacy.html            隐私政策
├── terms.html              服务条款
├── 404.html                404 页
├── assets/
│   ├── plugins.data.js     ★ 插件与技能数据源（加插件只改这里）
│   ├── plugins.js          渲染逻辑（把数据变成卡片）
│   ├── derive.js           推导规则（id / 包名 / 宿主 / 图标，命令行工具共用）
│   ├── stats.js            活数据（星数、下载量，机器生成）
│   ├── site.css            设计系统
│   ├── site.js             交互（滚动进场、FAQ、复制、锚点跳转）
│   ├── ph.css / Phosphor.woff2    Phosphor 图标字体（子集，自动生成）
│   ├── misans-*.woff2      MiSans 字体子集
│   ├── whale-mark.png      鲸鱼 LOGO（导航、favicon 用）
│   ├── whale-watermark.png 鲸鱼水印（大标题区的淡色背景）
│   ├── scene-*.webp        三张场景图（Hero 背景 / 夜桌带 / 尾部场景卡）
│   ├── dafeiyu-*.webp      大肥鱼桌宠动画
│   └── *.webp              产品展示图
└── tools/
    ├── add-plugin.mjs      一条命令加插件
    ├── publish.mjs         一键发布到 GitHub Pages（抓数 + 提交 + 推送 + 等构建）
    ├── sync-stats.mjs      刷新星数、下载量等活数据
    ├── sync-icons.mjs      重新生成图标子集
    ├── format-data.mjs     整理数据文件格式
    ├── fetch-stats.mjs     抓数据（上面几个共用）
    ├── serialize.mjs       数据文件读写（上面几个共用）
    ├── verify.mjs          CDP 全功能验收（70+ 项，真实点击）
    ├── shot.mjs            指定视口截图（窄屏必须用它，无头浏览器有最小窗口宽度）
    ├── build-fonts.py      重新生成字体子集
    └── phosphor-full.css   Phosphor 图标码位对照表
```

### 品牌素材的用法

- `scene-moon.webp` —— Hero 背景（月下夜桌），蒙版 0.80 压暗，角色还在但不抢字
- `scene-night.webp` —— 夜桌品牌带，图片在上、文字条在下，猫和鲸娘都露得出来
- `scene-meal.webp` —— 尾部场景卡右半边（喂饭那一张，对应「吃白饭」那句梗）
- `whale-mark.png` —— 从碗上抠下来的小鲸鱼 LOGO，换图标直接用它

想换图就替换这三个 `scene-*.webp`，尺寸比例保持 16:9 就行，蒙版浓度在 `site.css` 的 `.hero::before` / `.band__photo::after` 里调；尾部场景卡是直接放图，不叠蒙版。

---

## 五、改完文案要重跑字体子集

字体为了加载快做了子集，只保留页面真正用到的字形。**改了文案之后**跑一下：

```bash
python3 tools/build-fonts.py
```

漏掉这一步的话，新加的字会回退到系统字体（PingFang SC / 微软雅黑），不影响阅读，但字重和排版会有细微差别。

---

## 六、验收

改完页面跑一遍，会用无头 Edge 真实点一遍所有交互：

```bash
python3 -m http.server 8899 --bind 127.0.0.1 &
node tools/verify.mjs http://127.0.0.1:8899/index.html
```

覆盖：数据渲染、搜索、分类与宿主筛选、排序、链接区、复制、FAQ、锚点跳转、Hero 速览跳转、复杂度体检、Cookie 条、无障碍、品牌素材、外链可达性、390px 窄屏菜单、图标渲染完整性。

---

## 七、设计系统

| 项 | 值 |
|---|---|
| 背景层级 | `#000000` / `#181818` / `#1F1F1F` / `#272727` / `#313131` |
| 强调色 | 紫 `#A78BFA`，深 `#8B5CF6` |
| 字体 | MiSans（本地子集），全站单一字型，中英文同源 |
| 图标 | Phosphor Regular，本地字体，不依赖 CDN |
| 圆角 | Tailwind 档位：4 / 6 / 8 / 12 / 16 / 24 px |
| 动效曲线 | `cubic-bezier(0.22, 1, 0.36, 1)`，只动 transform 和 opacity |

全站离线可用，不请求任何外部域名。
