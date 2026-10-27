/* ============================================================
   大肥鱼合集 · 推导规则
   ------------------------------------------------------------
   页面和命令行工具（tools/fetch-stats.mjs）共用这一份，
   保证「同一个链接在两边算出同一个 id / 包名 / 宿主」。
   一般不用改，除非要加新的链接来源。
   ============================================================ */

(function (root) {
  "use strict";

  var GITHUB_NOISE = ["tree", "blob", "main", "master", "releases", "latest"];

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }
  function rawParts(url) {
    var m = String(url || "").match(/^https?:\/\/[^/]+\/(.*)$/);
    return (m ? m[1] : "").split("/").filter(Boolean).map(decode);
  }

  function hostOf(url) {
    var h = String(url || "").toLowerCase();
    if (h.indexOf("npmjs.com") > -1) return "npm";
    if (h.indexOf("skillhub.cn") > -1) return "skillhub";
    if (h.indexOf("skills.sh") > -1) return "skills-sh";
    return "skill-repo";
  }

  // 按来源拆出有意义的路径段
  function segments(url, host) {
    var p = rawParts(url);
    if (host === "npm") {
      for (var i = 0; i < p.length; i++) {
        if (p[i].toLowerCase() === "package") return p.slice(i + 1);
      }
      return p;
    }
    if (host === "skillhub") {
      for (var j = 0; j < p.length; j++) {
        if (p[j].toLowerCase() === "skills") return p.slice(j + 1);
      }
      return p;
    }
    if (host === "skills-sh") {
      // skills.sh 是 /owner/repo/skill（仓库级是 /owner/repo），整段都要留
      return p;
    }
    // GitHub：owner/repo 一定要留下，后面的段再滤掉 tree/blob/main 这类
    var head = p.slice(0, 2);
    var tail = p.slice(2).filter(function (s) {
      return GITHUB_NOISE.indexOf(s.toLowerCase()) === -1;
    });
    return head.concat(tail);
  }

  function slugOf(url) {
    var segs = segments(url, hostOf(url));
    var s = segs.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "plugin";
  }

  function pkgOf(url, host) {
    var segs = segments(url, host || hostOf(url));
    if (host === "npm") return segs[0] || "";
    if (host === "skillhub") return segs.slice(0, 2).join("/");
    return segs.join("/");
  }

  function authorOf(url, host) {
    var segs = segments(url, host || hostOf(url));
    return segs[0] || "";
  }

  function hostLabel(h) {
    if (h === "codex") return "Codex 桌面端";
    if (h === "dsh") return "DeepSeek Harness";
    if (h === "skillhub") return "技能市场";
    if (h === "skills-sh") return "skills.sh 目录";
    if (h === "npm") return "npm 包";
    if (h === "standalone") return "独立工具";
    if (h === "skill-repo") return "技能仓库（GitHub）";
    return h || "";
  }

  function primaryLinkLabel(host) {
    if (host === "skillhub") return "技能市场页";
    if (host === "skills-sh") return "skills.sh 页面";
    if (host === "npm") return "npm 包";
    return "源码仓库";
  }

  // 分类 → 图标。新增分类在这里加一行，然后跑 tools/sync-icons.mjs
  var CATEGORY_ICON = {
    "桌宠": "ph-fish",
    "挂件": "ph-wallet",
    "摘要": "ph-sparkle",
    "架构图": "ph-puzzle-piece",
    "图表": "ph-chart-pie",
    "论文": "ph-paint-brush",
    "搜索": "ph-magnifying-glass",
    "科研": "ph-moon-stars",
    "安全": "ph-shield-check",
    "工作流": "ph-list-checks",
    "效率": "ph-lightning",
    "笔记": "ph-pencil-simple",
    "设计": "ph-brackets-curly",
    "日报": "ph-bell-ringing",
    "语音": "ph-microphone-stage",
    "绘图": "ph-palette",
    "协议": "ph-stack",
    "聊天": "ph-chat-circle-dots",
    "学习": "ph-student",
    "蒸馏": "ph-drop",
    "教学": "ph-chalkboard-teacher",
    "拷问": "ph-fire",
    "发现": "ph-binoculars",
    "上下文": "ph-gauge"
  };
  function iconFor(cat) {
    return CATEGORY_ICON[cat] || "ph-terminal-window";
  }

  // 链接类型 → 图标。写全类名，图标子集脚本才扫得到
  function iconForLink(label) {
    if (label.indexOf("npm") > -1) return "ph-package";
    if (label.indexOf("下载") > -1) return "ph-download-simple";
    if (label.indexOf("技能市场") > -1) return "ph-package";
    if (label.indexOf("skills.sh") > -1) return "ph-compass";
    return "ph-github-logo";
  }

  root.DFY_DERIVE = {
    hostOf: hostOf,
    segments: segments,
    slugOf: slugOf,
    pkgOf: pkgOf,
    authorOf: authorOf,
    hostLabel: hostLabel,
    primaryLinkLabel: primaryLinkLabel,
    CATEGORY_ICON: CATEGORY_ICON,
    iconFor: iconFor,
    iconForLink: iconForLink
  };
})(typeof window !== "undefined" ? window : globalThis);
