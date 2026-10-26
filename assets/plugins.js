/* ============================================================
   大肥鱼合集 · 渲染逻辑（一般不用动）
   ------------------------------------------------------------
   数据在 assets/plugins.data.js，这里负责把数据变成页面。
   ============================================================ */
/* ============================================================
   以下是推导与渲染逻辑，一般不用动
   ============================================================ */
(function () {
  "use strict";

  var RAW = window.DAFEIYU_PLUGINS || [];
  var STATS = window.DAFEIYU_STATS || {};

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(n) {
    return (n || 0).toLocaleString("en-US");
  }

  /* ---------- 推导（规则在 assets/derive.js，命令行工具共用同一份） ---------- */
  var D = window.DFY_DERIVE || {};
  function hostOf(url) { return D.hostOf ? D.hostOf(url) : "skill-repo"; }
  function slugOf(url) { return D.slugOf ? D.slugOf(url) : "plugin"; }
  function pkgOf(url, host) { return D.pkgOf ? D.pkgOf(url, host) : ""; }
  function authorOf(url, host) { return D.authorOf ? D.authorOf(url, host) : ""; }
  function hostLabel(h) { return D.hostLabel ? D.hostLabel(h) : (h || ""); }
  function primaryLinkLabel(host) { return D.primaryLinkLabel ? D.primaryLinkLabel(host) : "源码仓库"; }
  function iconFor(cat) { return D.iconFor ? D.iconFor(cat) : "ph-terminal-window"; }
  function iconForLink(label) { return D.iconForLink ? D.iconForLink(label) : "ph-github-logo"; }

  // 把简写条目展开成完整对象
  function normalize(p, i) {
    var url = p.url || "";
    var host = p.host || hostOf(url);
    var st = STATS[slugOf(url)] || {};
    var links = [{ label: primaryLinkLabel(host), url: url }].concat(p.extra || []);
    var stLicense = (st.license && st.license !== "NOASSERTION") ? st.license : "";

    return {
      id: p.id || slugOf(url),
      name: p.name || "",
      tagline: p.tagline || "",
      category: p.category || "其它",
      url: url,
      repo: p.repo || url,
      pkg: p.pkg || pkgOf(url, host),
      pkgUrl: p.pkgUrl || url,
      host: host,
      license: p.license || stLicense,
      opensource: p.opensource != null ? p.opensource : !!(p.license || stLicense),
      stars: st.stars != null ? st.stars : (p.stars || 0),
      downloads: st.downloads != null ? st.downloads : (p.downloads || 0),
      marketDownloads: st.marketDownloads != null ? st.marketDownloads : (p.marketDownloads || 0),
      author: p.author || st.author || authorOf(url, host),
      version: st.version || p.version || "",
      media: p.media || "",
      mediaType: p.mediaType || "image",
      icon: p.icon || iconFor(p.category),
      addedAt: p.addedAt || st.verifiedAt || "",
      verifiedAt: st.verifiedAt || p.verifiedAt || "",
      order: p.order != null ? p.order : i,
      install: p.install ? { kind: p.installKind || "command", value: p.install } : null,
      note: p.note || "",
      warning: p.warning || "",
      features: p.features || [],
      links: links
    };
  }

  var ALL = RAW.map(normalize);

  var state = { q: "", cat: "全部", host: "全部", sort: "catalog" };

  /* 「最新」角标只给数组最后一条（也就是最近加进来的那条） */
  function isNew(p, i) { return i === ALL.length - 1; }

  /* ---------- 卡片 ---------- */
  function cardHTML(p, i) {
    var media = p.media
      ? '<img src="' + esc(p.media) + '" alt="' + esc(p.name) + ' 的展示图" loading="lazy" width="320" height="320">'
      : '<span class="product__icon"><i class="ph ' + esc(p.icon) + '" aria-hidden="true"></i></span>';

    var tags = [];
    if (p.license) tags.push('<span class="tag tag--accent">' + esc(p.license) + "</span>");
    if (p.stars) tags.push('<span class="tag">GitHub ' + num(p.stars) + " Star</span>");
    if (p.marketDownloads) tags.push('<span class="tag">技能市场 ' + num(p.marketDownloads) + " 次下载</span>");
    if (p.downloads) tags.push('<span class="tag">npm 近 30 天 ' + num(p.downloads) + " 次</span>");
    if (!p.stars && !p.marketDownloads && !p.downloads) tags.push('<span class="tag">' + esc(hostLabel(p.host)) + "</span>");

    var badges = isNew(p, i) ? '<span class="badge-new">最新</span>' : "";

    // 只有真的能粘着跑的安装方式才进命令块，其余靠链接区和备注说明
    var cmd = (p.install && p.install.kind !== "link" && p.install.value)
      ? '<div class="cmd"><code id="cmd-' + esc(p.id) + '">' + esc(p.install.value) +
        '</code><button class="cmd__copy" type="button" data-copy="cmd-' + esc(p.id) +
        '" aria-label="复制 ' + esc(p.name) + ' 的安装命令"><i class="ph ph-copy" aria-hidden="true"></i></button></div>'
      : "";

    var features = p.features.map(function (f) {
      return '<li><i class="ph ph-check-circle" aria-hidden="true"></i><span>' + esc(f) + "</span></li>";
    }).join("");

    var links = p.links.map(function (l) {
      return '<div class="plink">' +
        '<a class="plink__a" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(l.url) + '">' +
          '<i class="ph ' + iconForLink(l.label) + '" aria-hidden="true"></i>' +
          '<span class="plink__url">' + esc(prettyUrl(l.url)) + "</span>" +
          '<i class="ph ph-arrow-up-right" aria-hidden="true"></i>' +
        "</a>" +
        '<button class="plink__copy" type="button" data-copy-text="' + esc(l.url) + '" aria-label="复制 ' + esc(l.label) + ' 链接">' +
          '<i class="ph ph-copy" aria-hidden="true"></i>' +
        "</button>" +
      "</div>";
    }).join("");

    var note = p.note ? '<div class="product__note">' + esc(p.note) + "</div>" : "";
    var warning = p.warning
      ? '<div class="product__warn"><i class="ph ph-info" aria-hidden="true"></i><span>' + esc(p.warning) + "</span></div>"
      : "";

    var meta = [];
    if (p.pkg) meta.push(esc(p.pkg));
    if (p.version) meta.push(esc(p.version));
    if (p.author) meta.push("作者 " + esc(p.author));
    meta.push(esc(hostLabel(p.host)));

    return (
      '<article class="product" id="plugin-' + esc(p.id) + '" data-plugin-id="' + esc(p.id) + '" data-reveal data-reveal-delay="' + (i % 3) * 80 + '">' +
        '<div class="product__media">' + media + "</div>" +
        '<div class="product__tags">' + tags.join("") + "</div>" +
        '<h3 class="t-2xl product__name">' +
          '<a class="product__link" href="' + esc(p.repo) + '" target="_blank" rel="noopener noreferrer" title="' + esc(p.repo) + '">' +
            esc(p.name) + '<i class="ph ph-arrow-up-right" aria-hidden="true"></i>' +
          "</a>" +
          badges +
        "</h3>" +
        '<p class="product__meta">' + meta.join(" · ") + "</p>" +
        '<p class="product__tagline">' + esc(p.tagline) + "</p>" +
        '<div class="product__links">' + links + "</div>" +
        '<div class="product__cmd">' + cmd + "</div>" +
        note + warning +
        '<ul class="product__list">' + features + "</ul>" +
      "</article>"
    );
  }

  // 链接显示时去掉协议和结尾斜杠，复制时仍给完整地址
  function prettyUrl(u) {
    return String(u || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }


  /* ---------- Hero 速览面板 ---------- */
  function peekHTML() {
    var recent = ALL.slice(0, 4);
    var rows = recent.map(function (p) {
      return (
        '<li>' +
          '<button class="peek__row" type="button" data-plugin-id="' + esc(p.id) + '">' +
            '<span class="peek__head">' +
              '<span class="peek__name">' + esc(p.name) + "</span>" +
              '<span class="peek__pkg">' + esc(p.pkg) + "</span>" +
            "</span>" +
            '<span class="peek__desc">' + esc(p.tagline) + "</span>" +
            '<span class="peek__go"><i class="ph ph-arrow-right" aria-hidden="true"></i>跳到这张卡</span>' +
          "</button>" +
        "</li>"
      );
    }).join("");

    return (
      '<div class="peek__head">' +
        '<div class="peek__avatar"><img src="assets/dafeiyu-idle.webp" alt="大肥鱼桌宠待机形象" width="263" height="296"></div>' +
        '<div><p class="peek__count"><span data-count-plugins>' + ALL.length + '</span> 款已收录</p>' +
        '<p class="peek__sub">点任意一行跳到对应插件</p></div>' +
      "</div>" +
      '<ul class="peek__list">' + rows + "</ul>" +
      '<a class="peek__more" href="#catalog"><i class="ph ph-caret-down" aria-hidden="true"></i>看全部插件目录</a>'
    );
  }

  /* ---------- 统计 ---------- */
  function stats() {
    var stars = ALL.reduce(function (s, p) { return s + (p.stars || 0); }, 0);
    var dl = ALL.reduce(function (s, p) { return s + (p.downloads || 0); }, 0);
    var market = ALL.reduce(function (s, p) { return s + (p.marketDownloads || 0); }, 0);
    return { count: ALL.length, stars: stars, downloads: dl, market: market };
  }

  function applyStats() {
    var s = stats();
    document.querySelectorAll("[data-stat-count]").forEach(function (el) { el.textContent = num(s.count); });
    document.querySelectorAll("[data-stat-stars]").forEach(function (el) { el.textContent = num(s.stars); });
    document.querySelectorAll("[data-stat-downloads]").forEach(function (el) { el.textContent = num(s.downloads); });
    document.querySelectorAll("[data-stat-market]").forEach(function (el) { el.textContent = num(s.market); });
    document.querySelectorAll("[data-count-plugins]").forEach(function (el) { el.textContent = String(s.count); });
    document.querySelectorAll("[data-count-plugins-text]").forEach(function (el) {
      el.textContent = "已收录 " + s.count + " 款";
    });
  }

  /* ---------- 筛选与排序 ---------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = ALL.filter(function (p) {
      if (state.cat !== "全部" && p.category !== state.cat) return false;
      if (state.host !== "全部" && p.host !== state.host) return false;
      if (!q) return true;
      var hay = [p.name, p.pkg, p.tagline, p.author, p.category, (p.features || []).join(" ")];
      return hay.join(" ").toLowerCase().indexOf(q) > -1;
    });
    list.sort(function (a, b) {
      if (state.sort === "stars") return (b.stars || 0) - (a.stars || 0);
      if (state.sort === "downloads") {
        return ((b.downloads || 0) + (b.marketDownloads || 0)) - ((a.downloads || 0) + (a.marketDownloads || 0));
      }
      if (state.sort === "newest") {
        var ta = new Date(a.addedAt || 0).getTime();
        var tb = new Date(b.addedAt || 0).getTime();
        if (tb !== ta) return tb - ta;
        return b.order - a.order;
      }
      // 目录顺序：就是数组里的先后
      return a.order - b.order;
    });
    return list;
  }

  function renderGrid() {
    var grid = document.getElementById("plugin-grid");
    if (!grid) return;
    var list = filtered();

    var counter = document.getElementById("catalog-count");
    if (counter) counter.textContent = "显示 " + list.length + " / " + ALL.length + " 款";

    var empty = document.getElementById("catalog-empty");
    if (!list.length) {
      grid.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        var t = empty.querySelector("[data-empty-text]");
        if (t) t.textContent = "没有匹配「" + state.q + "」的插件。换个词，或者去仓库看看还有哪些没被收录。";
      }
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = list.map(cardHTML).join("");

    if (window.DFY && window.DFY.observeReveal) {
      grid.querySelectorAll("[data-reveal]").forEach(function (el) {
        window.DFY.observeReveal(el);
      });
    }
    if (window.DFY && window.DFY.bindCopy) {
      grid.querySelectorAll("[data-copy],[data-copy-text]").forEach(function (el) {
        window.DFY.bindCopy(el);
      });
    }
  }

  /* ---------- 筛选控件 ---------- */
  function buildFilters() {
    var bar = document.getElementById("catalog-filters");
    if (!bar) return;

    var cats = ["全部"];
    ALL.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
    var hosts = ["全部"];
    ALL.forEach(function (p) { if (hosts.indexOf(p.host) < 0) hosts.push(p.host); });

    var catWrap = bar.querySelector("[data-filter-cats]");
    if (catWrap) {
      catWrap.innerHTML = cats.map(function (c) {
        return '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' +
          (c === state.cat ? "true" : "false") + '">' + esc(c) + "</button>";
      }).join("");
      catWrap.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cat]");
        if (!b) return;
        state.cat = b.getAttribute("data-cat");
        catWrap.querySelectorAll(".chip").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        renderGrid();
      });
    }

    var hostWrap = bar.querySelector("[data-filter-hosts]");
    if (hostWrap) {
      hostWrap.innerHTML = hosts.map(function (h) {
        return '<button class="chip" type="button" data-host="' + esc(h) + '" aria-pressed="' +
          (h === state.host ? "true" : "false") + '">' + esc(h === "全部" ? "全部宿主" : hostLabel(h)) + "</button>";
      }).join("");
      hostWrap.addEventListener("click", function (e) {
        var b = e.target.closest("[data-host]");
        if (!b) return;
        state.host = b.getAttribute("data-host");
        hostWrap.querySelectorAll(".chip").forEach(function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        renderGrid();
      });
    }

    var search = bar.querySelector("[data-search]");
    if (search) {
      var t = null;
      search.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () {
          state.q = search.value || "";
          renderGrid();
        }, 160);
      });
    }

    var sort = bar.querySelector("[data-sort]");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        renderGrid();
      });
    }
  }

  /* ---------- 从速览面板跳到具体插件 ---------- */
  function bindPeek() {
    var panel = document.getElementById("peek");
    if (!panel) return;
    panel.addEventListener("click", function (e) {
      var row = e.target.closest(".peek__row");
      if (!row) return;
      var id = row.getAttribute("data-plugin-id");
      var target = document.getElementById("plugin-" + id);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("is-target");
      setTimeout(function () { target.classList.remove("is-target"); }, 2000);
    });
  }

  /* ---------- 页脚收录列表 ---------- */
  function renderFooter() {
    var ul = document.getElementById("footer-plugins");
    if (!ul) return;
    ul.innerHTML = ALL.map(function (p) {
      return '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(p.name) + " " + esc(p.pkg) + "</a></li>";
    }).join("");
  }

  /* ---------- 启动 ---------- */
  function init() {
    var peek = document.getElementById("peek");
    if (peek) peek.innerHTML = peekHTML();

    applyStats();
    buildFilters();
    renderGrid();
    renderFooter();
    bindPeek();

    var heading = document.querySelector("[data-catalog-heading]");
    if (heading) heading.textContent = "这一页收录的 " + ALL.length + " 款插件与技能";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
