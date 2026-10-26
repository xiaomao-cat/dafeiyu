/* ============================================================
   大肥鱼合集 · 交互
   ============================================================ */
(function () {
  "use strict";

  // 标记 JS 可用：滚动进场动画的初始隐藏态只在这个类存在时生效
  document.documentElement.classList.add("js");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DFY = (window.DFY = window.DFY || {});

  /* ---------- 滚动进场 ---------- */
  var revealIO = null;

  function initReveal() {
    var targets = document.querySelectorAll("[data-reveal]");
    if (!targets.length) return;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.setAttribute("data-on", "true"); });
      return;
    }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
        setTimeout(function () { el.setAttribute("data-on", "true"); }, delay);
        revealIO.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    targets.forEach(function (el) { revealIO.observe(el); });
  }

  // 供动态渲染出来的卡片调用
  DFY.observeReveal = function (el) {
    if (reduced || !revealIO) { el.setAttribute("data-on", "true"); return; }
    revealIO.observe(el);
  };

  /* ---------- 复制按钮 ---------- */
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // 供屏幕阅读器播报的共享区域
  function liveRegion() {
    var el = document.getElementById("dfy-live");
    if (!el) {
      el = document.createElement("div");
      el.id = "dfy-live";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.className = "visually-hidden";
      document.body.appendChild(el);
    }
    return el;
  }

  DFY.bindCopy = function (btn) {
    if (btn.getAttribute("data-copy-bound") === "1") return;
    // data-copy-text 直接给原文，data-copy 则去读目标元素
    var literal = btn.getAttribute("data-copy-text");
    var src = literal == null ? document.getElementById(btn.getAttribute("data-copy")) : null;
    if (literal == null && !src) return;
    btn.setAttribute("data-copy-bound", "1");
    var label = btn.querySelector("[data-copy-label]");
    var original = label ? label.textContent : "";
    var timer = null;

    function setState(state) {
      btn.setAttribute("data-state", state);
      if (!label) return;
      if (state === "success") label.textContent = "已复制";
      else if (state === "error") label.textContent = "复制失败";
      else label.textContent = original;
    }

    btn.addEventListener("click", function () {
      var text = literal != null ? literal : src.innerText;
      var done = function (ok) {
        setState(ok ? "success" : "error");
        if (ok) btn.setAttribute("data-copied", "1");
        liveRegion().textContent = ok ? "已复制到剪贴板" : "复制失败，请手动选中命令复制";
        clearTimeout(timer);
        timer = setTimeout(function () { setState(""); }, 3000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else {
        done(fallbackCopy(text));
      }
    });
  };

  /* ---------- 锚点跳转：只在点击时平滑，滚轮与键盘保持原生 ---------- */
  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute("href").slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  });

  /* ---------- 导航：移动端开关 ---------- */
  var toggle = document.querySelector(".nav__toggle");
  var panel = document.getElementById("nav-panel");
  if (toggle && panel) {
    var ICON_OPEN = '<i class="ph ph-list"></i>';
    var ICON_CLOSE = '<i class="ph ph-x"></i>';

    function openMenu() {
      panel.setAttribute("data-open", "true");
      toggle.innerHTML = ICON_CLOSE;
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      panel.querySelectorAll(".nav-panel__link").forEach(function (link, i) {
        link.style.animationDelay = Math.min(i * 60, 400) + "ms";
      });
    }
    function closeMenu() {
      panel.setAttribute("data-open", "false");
      toggle.innerHTML = ICON_OPEN;
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
    toggle.addEventListener("click", function () {
      if (panel.getAttribute("data-open") === "true") closeMenu();
      else openMenu();
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.getAttribute("data-open") === "true") {
        closeMenu();
        toggle.focus();
      }
    });
  }

  /* ---------- 标语逐词点亮（B11） ---------- */
  var tagline = document.querySelector("[data-tagline]");
  if (tagline) {
    var CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;
    var tokens = [];
    var buf = "";
    var text = tagline.textContent.trim();
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (CJK.test(ch)) {
        if (buf) { tokens.push(buf); buf = ""; }
        tokens.push(ch);
      } else if (ch === " " || ch === "\n") {
        if (buf) { tokens.push(buf); buf = ""; }
        tokens.push(" ");
      } else {
        buf += ch;
      }
    }
    if (buf) tokens.push(buf);

    tagline.innerHTML = tokens.map(function (t) {
      if (t === " ") return " ";
      return '<span class="w">' + t.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>";
    }).join("");

    var words = tagline.querySelectorAll(".w");
    if (reduced || !("IntersectionObserver" in window)) {
      words.forEach(function (w) { w.setAttribute("data-on", "true"); });
    } else {
      var wordIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var idx = Array.prototype.indexOf.call(words, el);
          setTimeout(function () { el.setAttribute("data-on", "true"); }, idx * 70);
          wordIO.unobserve(el);
        });
      }, { rootMargin: "0px 0px -20% 0px", threshold: 0.4 });
      words.forEach(function (w) { wordIO.observe(w); });
    }
  }

  /* ---------- FAQ 折叠 ---------- */
  document.querySelectorAll(".faq__q").forEach(function (btn) {
    var body = document.getElementById(btn.getAttribute("aria-controls"));
    if (!body) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      if (open) {
        body.style.height = body.scrollHeight + "px";
        requestAnimationFrame(function () {
          body.style.height = "0px";
          body.setAttribute("data-open", "false");
        });
      } else {
        body.setAttribute("data-open", "true");
        body.style.height = body.scrollHeight + "px";
        setTimeout(function () {
          if (btn.getAttribute("aria-expanded") === "true") body.style.height = "auto";
        }, 520);
      }
    });
  });

  /* ---------- Cookie 说明条 ---------- */
  var cookie = document.querySelector(".cookie");
  if (cookie) {
    var KEY = "dafeiyu-cookie-note";
    try {
      if (localStorage.getItem(KEY) === "1") cookie.hidden = true;
    } catch (e) { /* 隐私模式下忽略 */ }
    var close = cookie.querySelector("button");
    if (close) {
      close.addEventListener("click", function () {
        cookie.hidden = true;
        try { localStorage.setItem(KEY, "1"); } catch (e) { /* 忽略 */ }
      });
    }
  }

  /* ---------- 导航高亮当前区块 ---------- */
  var navLinks = document.querySelectorAll(".nav__link[href^='#']");
  var sections = [];
  navLinks.forEach(function (link) {
    var sec = document.getElementById(link.getAttribute("href").slice(1));
    if (sec) sections.push({ link: link, sec: sec });
  });
  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        sections.forEach(function (s) {
          s.link.setAttribute("aria-current", String(s.sec === entry.target));
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s.sec); });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    initReveal();
    document.querySelectorAll("[data-copy],[data-copy-text]").forEach(DFY.bindCopy);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
