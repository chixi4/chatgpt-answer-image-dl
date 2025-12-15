// ==UserScript==
// @name         ChatGPT 回答图片分享
// @namespace    https://github.com/chixi4/chatgpt-answer-image-dl
// @version      2.0.0
// @description  在 ChatGPT "共享"里,点击"下载图片"。优化跨平台兼容性，支持chorme、edge、Firefox、手机端via
// @author       Chixi
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/chixi4/chatgpt-answer-image-dl/main/ChatGPT%20%E5%9B%9E%E7%AD%94%E5%9B%BE%E7%89%87%E5%88%86%E4%BA%AB.user.js
// @updateURL    https://raw.githubusercontent.com/chixi4/chatgpt-answer-image-dl/main/ChatGPT%20%E5%9B%9E%E7%AD%94%E5%9B%BE%E7%89%87%E5%88%86%E4%BA%AB.user.js
// ==/UserScript==

(function () {
  'use strict';


  var DEBUG = true;
  var LOG_PREFIX = '[chatgpt-answer-image]';

  var REVERT_MS = 2000;
  var ORIGINAL_LABEL = '下载图片';

  var CARD_SELECTOR = '[data-testid="sharing-post-unfurl-view"]';
  var SHARE_URL_RE = /https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/share\/[^\s"'<>]+/i;

  // 透明 1×1 PNG 占位
  var TRANSPARENT_PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

  // 下载图标
  var DOWNLOAD_ICON_PATH_D =
    'M8.759 3h6.482c.805 0 1.47 0 2.01.044.563.046 1.08.145 1.565.392a4 4 0 0 1 1.748 1.748c.247.485.346 1.002.392 1.564C21 7.29 21 7.954 21 8.758v6.483c0 .805 0 1.47-.044 2.01-.046.563-.145 1.08-.392 1.565a4 4 0 0 1-1.748 1.748c-.485.247-1.002.346-1.564.392-.541.044-1.206.044-2.01.044H8.758c-.805 0-1.47 0-2.01-.044-.563-.046-1.08-.145-1.565-.392a4 4 0 0 1-1.748-1.748c-.247-.485-.346-1.002-.392-1.564C3 16.71 3 16.046 3 15.242V8.758c0-.805 0-1.47.044-2.01.046-.563.145-1.08.392-1.565a4 4 0 0 1 1.748-1.748c.485-.247 1.002-.346 1.564-.392C7.29 3 7.954 3 8.758 3M6.91 5.038c-.438.035-.663.1-.819.18a2 2 0 0 0-.874.874c-.08.156-.145.38-.18.819C5 7.361 5 7.943 5 8.8v4.786l.879-.879a3 3 0 0 1 4.242 0l6.286 6.286c.261-.005.484-.014.682-.03.438-.036.663-.101.819-.181a2 2 0 0 0 .874-.874c.08-.156.145-.38.18-.819.037-.45.038-1.032.038-1.889V8.8c0-.857 0-1.439-.038-1.889-.035-.438-.1-.663-.18-.819a2 2 0 0 0-.874-.874c-.156-.08-.38-.145-.819-.18C16.639 5 16.057 5 15.2 5H8.8c-.857 0-1.439 0-1.889.038M13.586 19l-4.879-4.879a1 1 0 0 0-1.414 0l-2.286 2.286c.005.261.014.484.03.682.036.438.101.663.181.819a2 2 0 0 0 .874.874c.156.08.38.145.819.18C7.361 19 7.943 19 8.8 19zM14.5 8.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0 3 3 0 0 1-6 0';

  // 动画 class 关键词
  var ANIM_CLASS_RE = /(animate|spin|rotate|pulse|bounce)/i;

  function log() {
    if (!DEBUG) return;
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    } catch (_) {}
  }

  function warn() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.warn.apply(console, args);
    } catch (_) {}
  }

  function err() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.error.apply(console, args);
    } catch (_) {}
  }

  function isMobileDevice() {
    try {
      var ua = (navigator.userAgent || '').toLowerCase();
      if (/android|iphone|ipad|ipod|mobile/.test(ua)) return true;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (_) {}
    return false;
  }

  function isFirefox() {
    try {
      return /firefox/i.test(navigator.userAgent || '');
    } catch (_) {
      return false;
    }
  }

  function computeSafePixelRatioForCapture(w, h) {
    var dpr = 1;
    try { dpr = window.devicePixelRatio || 1; } catch (_) { dpr = 1; }

    // Firefox 更容易在大画布/高像素比下失败（常见 NS_ERROR_FAILURE / 内存限制）
    var base = isFirefox() ? Math.max(1, dpr) : Math.max(2, dpr);
    var maxDim = isFirefox() ? 8192 : 16384;

    var limitByW = w ? (maxDim / w) : base;
    var limitByH = h ? (maxDim / h) : base;
    var pr = Math.min(base, limitByW, limitByH);
    if (!isFinite(pr) || pr <= 0) pr = 1;

    return pr;
  }

  // 过滤动画相关的 class
  function filterAnimationClasses(element) {
    if (!element || !element.classList) return;
    var toRemove = [];
    for (var i = 0; i < element.classList.length; i++) {
      var cls = element.classList[i];
      if (ANIM_CLASS_RE.test(cls)) {
        toRemove.push(cls);
      }
    }
    for (var j = 0; j < toRemove.length; j++) {
      element.classList.remove(toRemove[j]);
    }
  }

  // 递归过滤所有子元素的动画类
  function filterAnimationClassesRecursive(element) {
    filterAnimationClasses(element);
    var children = element.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      filterAnimationClasses(children[i]);
    }
  }

  // ============================================================
  // 样式注入
  // ============================================================
  GM_addStyle(`
    .unlock-for-capture .aspect-\\[1200\\/630\\] { aspect-ratio: auto !important; height: auto !important; }
    .unlock-for-capture ${CARD_SELECTOR} { height: auto !important; }
    .unlock-for-capture .rounded-b-3xl.overflow-hidden { overflow: visible !important; }
    .unlock-for-capture .absolute.bg-gradient-to-t { display: none !important; }
    .__offscreen_capture_root__ { position: fixed !important; top: -100000px !important; left: -100000px !important; z-index: -1 !important; }

    .__dl_toast_host { position:fixed; top:12px; left:0; right:0; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; z-index:2147483647; }
    .__dl_toast_core {
      display:inline-flex; align-items:center; gap:8px;
      padding:8px 12px; border-radius:10px; border:1px solid #008635; background:#008635; color:#fff;
      box-shadow:0 8px 24px rgba(0,0,0,.25); pointer-events:auto;
      transform:translateY(-20px); opacity:0; transition:transform .2s ease, opacity .2s ease;
    }
    .__dl_toast_core.show { transform:translateY(0); opacity:1; }

    .__dl_final_btn__[disabled] { opacity:.5; pointer-events:none; }

    /* 强制禁用下载按钮所有动画 */
    .__dl_final_btn__,
    .__dl_final_btn__ * {
      animation: none !important;
      transition: none !important;
    }
    .__dl_final_btn__ {
      transform: none !important;
    }
    .__dl_final_btn__ svg,
    .__dl_final_btn__ svg * {
      animation: none !important;
      transition: none !important;
      transform: none !important;
    }
  `);

  // ============================================================
  // Toast
  // ============================================================
  function showToast(message) {
    var host = document.querySelector('.__dl_toast_host');
    if (!host) {
      host = document.createElement('div');
      host.className = '__dl_toast_host';
      document.body.appendChild(host);
    }
    var toast = document.createElement('div');
    toast.className = '__dl_toast_core';
    toast.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.498 6.90887C12.7094 6.60867 13.1245 6.53642 13.4248 6.74774C13.7249 6.95913 13.7971 7.37424 13.5859 7.6745L9.62695 13.2995C9.51084 13.4644 9.32628 13.5681 9.125 13.5807C8.94863 13.5918 8.77583 13.5319 8.64453 13.4167L8.59082 13.364L6.50781 11.072L6.42773 10.9645C6.26956 10.6986 6.31486 10.3488 6.55273 10.1325C6.79045 9.91663 7.14198 9.9053 7.3916 10.0876L7.49219 10.1774L9.0166 11.8542L12.498 6.90887Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M10.3333 2.08496C14.7046 2.08496 18.2483 5.62867 18.2483 10C18.2483 14.3713 14.7046 17.915 10.3333 17.915C5.96192 17.915 2.41821 14.3713 2.41821 10C2.41821 5.62867 5.96192 2.08496 10.3333 2.08496ZM10.3333 3.41504C6.69646 3.41504 3.74829 6.3632 3.74829 10C3.74829 13.6368 6.69646 16.585 10.3333 16.585C13.97 16.585 16.9182 13.6368 16.9182 10C16.9182 6.3632 13.97 3.41504 10.3333 3.41504Z"></path></svg><span>' +
      message +
      '</span>';
    host.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('show');
    }, 10);
    setTimeout(function () {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', function () {
        toast.remove();
      });
    }, 2000);
  }

  // ============================================================
  // 文件名
  // ============================================================
  function makeFilename(dlg) {
    var ts = new Date();
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    var titleElement = dlg.querySelector('h2[id^="radix-"]');
    var title = titleElement ? titleElement.textContent.trim().replace(/[\/\\?%*:|"<>]/g, '-') : 'chatgpt_share';
    return (
      title +
      '_' +
      ts.getFullYear() +
      pad(ts.getMonth() + 1) +
      pad(ts.getDate()) +
      '.png'
    );
  }

  // ============================================================
  // 离屏克隆
  // ============================================================
  function createOffscreenClone(sourceDialog) {
    var offscreenRoot = document.createElement('div');
    offscreenRoot.className = '__offscreen_capture_root__';
    var clonedDialog = sourceDialog.cloneNode(true);
    clonedDialog.classList.add('unlock-for-capture');
    offscreenRoot.appendChild(clonedDialog);
    document.documentElement.appendChild(offscreenRoot);
    return { offscreenRoot: offscreenRoot, clonedDialog: clonedDialog };
  }

  // ============================================================
  // 按钮文案设置
  // ============================================================
  function setButtonLabel(btn, text) {
    var label =
      btn.querySelector('.w-full.text-center.text-xs') ||
      btn.querySelector('.text-xs') ||
      Array.prototype.slice
        .call(btn.querySelectorAll('div, span'))
        .reverse()
        .find(function (el) {
          return (el.textContent || '').trim().length > 0;
        });

    if (!label) label = btn;
    label.textContent = text;
  }

  // ============================================================
  // 替换图标为下载图标
  // ============================================================
  function setDownloadIcon(btn) {
    var svg = btn.querySelector('svg');
    if (!svg) return;
    var keepW = svg.getAttribute('width');
    var keepH = svg.getAttribute('height');
    var keepClass = svg.getAttribute('class') || '';
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (keepW) svg.setAttribute('width', keepW);
    if (keepH) svg.setAttribute('height', keepH);
    if (keepClass) svg.setAttribute('class', keepClass);
    svg.innerHTML = '<path fill="currentColor" d="' + DOWNLOAD_ICON_PATH_D + '"></path>';
  }

  // ============================================================
  // 弹窗识别（增强版）
  // ============================================================
  function findShareUrlInScope(scope) {
    var inputs = scope.querySelectorAll('input[type="text"],input[readonly],input,textarea');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var val = (input.value || '').trim();
      if (SHARE_URL_RE.test(val)) {
        var m1 = val.match(SHARE_URL_RE);
        return (m1 && m1[0]) || val;
      }
    }

    var links = scope.querySelectorAll('a[href]');
    for (var j = 0; j < links.length; j++) {
      var a = links[j];
      var href = (a.getAttribute('href') || '').trim();
      if (SHARE_URL_RE.test(href)) {
        var m2 = href.match(SHARE_URL_RE);
        return (m2 && m2[0]) || href;
      }
    }

    var txt = scope.textContent || '';
    var m3 = txt.match(SHARE_URL_RE);
    return m3 ? m3[0] : '';
  }

  function dialogTitleText(d) {
    var h2 = d.querySelector('h2,[role="heading"]');
    return (h2 && h2.textContent ? h2.textContent : '').trim();
  }

  function findShareDialog() {
    var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"],[aria-modal="true"]'));
    var best = null;
    var bestScore = 0;

    for (var i = 0; i < dialogs.length; i++) {
      var d = dialogs[i];
      var score = 0;

      if (d.querySelector(CARD_SELECTOR)) score += 5;

      var shareUrl = findShareUrlInScope(d);
      if (shareUrl) score += 4;

      var testids = d.querySelectorAll('[data-testid]');
      var hasShareTestId = false;
      for (var t = 0; t < testids.length; t++) {
        var v = testids[t].getAttribute('data-testid') || '';
        if (/share|sharing/i.test(v)) {
          hasShareTestId = true;
          break;
        }
      }
      if (hasShareTestId) score += 2;

      var hasCopySignal =
        !!d.querySelector('[data-testid*="copy" i],[data-testid*="share-copy" i]') ||
        Array.prototype.slice.call(d.querySelectorAll('[aria-label]')).some(function (el) {
          return /copy|复制/i.test(el.getAttribute('aria-label') || '');
        });
      if (hasCopySignal) score += 1;

      var title = dialogTitleText(d);
      if (title && /共享|分享|Share|Sharing|share/i.test(title)) score += 1;

      var ariaDesc = (d.getAttribute('aria-description') || '').trim();
      if (ariaDesc && /共享|分享|share/i.test(ariaDesc)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }

    if (!best) return null;

    var mustHave = best.querySelector(CARD_SELECTOR) || findShareUrlInScope(best);
    if (!mustHave) return null;

    return best;
  }

  // ============================================================
  // 查找"复制链接"按钮
  // ============================================================
  function findCopyButton(root) {
    var byTestId = root.querySelector('[data-testid*="copy" i],[data-testid*="share-copy" i]');
    if (byTestId) return byTestId.closest('button,[role="button"]') || byTestId;

    var ariaList = root.querySelectorAll('[aria-label]');
    for (var i = 0; i < ariaList.length; i++) {
      var el = ariaList[i];
      if (/copy/i.test(el.getAttribute('aria-label') || '')) {
        return el.closest('button,[role="button"]') || el;
      }
    }

    var patterns = ['复制链接', 'Copy link', 'リンクをコピー', '링크 복사', 'Copiar enlace', 'Copiar link', 'Copiar vínculo', 'Copier le lien', 'Kopieren']
      .map(function (s) { return new RegExp(s, 'i'); });

    var candidates = root.querySelectorAll('button,[role="button"]');
    for (var j = 0; j < candidates.length; j++) {
      var b = candidates[j];
      var txt = (b.textContent || '').trim();
      for (var k = 0; k < patterns.length; k++) {
        if (patterns[k].test(txt)) return b;
      }
    }

    return root.querySelector('button,[role="button"]');
  }

  // ============================================================
  // 工具：HTML转义
  // ============================================================
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (ch) {
      if (ch === '&') return '&amp;';
      if (ch === '<') return '&lt;';
      if (ch === '>') return '&gt;';
      if (ch === '"') return '&quot;';
      return '&#39;';
    });
  }

  // ============================================================
  // 工具：把 Blob 转为 data:URL
  // ============================================================
  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error || new Error('FileReader failed')); };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ============================================================
  // 移动端预览HTML页面生成
  // ============================================================
  function buildMobilePreviewHtml(dataUrl, filename) {
    var safeTitle = escapeHtml(filename || 'image');
    var src = String(dataUrl || '').replace(/"/g, '%22');
    return [
      '<!doctype html>',
      '<html><head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
      '<title>' + safeTitle + '</title>',
      '<style>',
      'html,body{height:100%;margin:0;background:#111;color:#eee;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}',
      '.bar{padding:12px 14px;font-size:14px;line-height:1.4;color:#ddd;}',
      '.img{min-height:calc(100% - 48px);display:flex;align-items:center;justify-content:center;padding:10px;}',
      'img{max-width:100%;height:auto;background:#222;}',
      '</style>',
      '</head><body>',
      '<div class="bar">图片预览（若浏览器限制保存，可用系统分享/截图保存）。</div>',
      '<div class="img"><img src="' + src + '" alt="' + safeTitle + '" /></div>',
      '</body></html>'
    ].join('');
  }

  function writePreviewWindow(win, dataUrl, filename) {
    if (!win) return false;
    try {
      win.document.open();
      win.document.write(buildMobilePreviewHtml(dataUrl, filename));
      win.document.close();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  // 工具：按域名选择合适的 Referer 以减少防盗链
  // ============================================================
  function pickReferer(u) {
    try {
      var h = new URL(u).hostname;
      if (h.endsWith('bing.net') || h.endsWith('microsoft.com')) return 'https://www.bing.com/';
      if (h.endsWith('baidu.com')) return 'https://baike.baidu.com/';
    } catch (_) {}
    return '';
  }

  // ============================================================
  // 工具：扩展层抓取并直接返回 data:URL
  // ============================================================
  function fetchAsDataURL(url) {
    var referer = pickReferer(url);
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'blob',
        timeout: 20000,
        headers: referer ? { Referer: referer } : {},
        onload: function (res) {
          if (res.status >= 200 && res.status < 300 && res.response) {
            blobToDataURL(res.response)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error('HTTP ' + res.status));
          }
        },
        onerror: reject,
        ontimeout: function () { reject(new Error('timeout')); }
      });
    });
  }

  // ============================================================
  // 把克隆节点里的 <img> 统一转为 data:URL，避免二次抓取
  // ============================================================
  function dataURLToBlob(dataUrl) {
    var s = String(dataUrl || '');
    var m = s.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) throw new Error('invalid data url');
    var mime = m[1] || 'application/octet-stream';
    var isB64 = !!m[2];
    var data = m[3] || '';
    if (!isB64) {
      return new Blob([decodeURIComponent(data)], { type: mime });
    }
    var bin = atob(data);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function renderNodeToBlobBestEffort(h2i, node, options) {
    var lastErr = null;

    // 1) 优先尝试 toBlob
    try {
      var b1 = await h2i.toBlob(node, options);
      if (b1) return b1;
    } catch (e1) {
      lastErr = e1;
      warn('renderNodeToBlobBestEffort: toBlob failed, trying toPng', e1);
    }

    // 2) Firefox降级：尝试 toPng (返回data URL)
    try {
      if (typeof h2i.toPng === 'function') {
        var pngUrl = await h2i.toPng(node, options);
        if (pngUrl) return dataURLToBlob(pngUrl);
      }
    } catch (e2) {
      lastErr = e2;
      warn('renderNodeToBlobBestEffort: toPng failed, trying toCanvas', e2);
    }

    // 3) 最后尝试 toCanvas
    try {
      if (typeof h2i.toCanvas === 'function') {
        var canvas = await h2i.toCanvas(node, options);
        if (canvas && typeof canvas.toBlob === 'function') {
          var b3 = await new Promise(function (resolve) {
            try { canvas.toBlob(resolve); } catch (_) { resolve(null); }
          });
          if (b3) return b3;
        }
      }
    } catch (e3) {
      lastErr = e3;
      warn('renderNodeToBlobBestEffort: toCanvas failed', e3);
    }

    if (lastErr) throw lastErr;
    throw new Error('生成图片失败：无法导出 Blob');
  }

  async function deCrossOriginAllImages(scopeEl, transparentPx) {
    var imgs = Array.prototype.slice.call(scopeEl.querySelectorAll('img'));
    if (!imgs.length) return;

    await Promise.all(
      imgs.map(async function (img) {
        try {
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.setAttribute('crossorigin', 'anonymous');

          var altUrl = (img.getAttribute('alt') || '').trim();
          var srcUrl = (img.getAttribute('src') || '').trim();
          var url = /^https?:\/\//i.test(altUrl) ? altUrl : srcUrl;

          if (!url || url.indexOf('data:') === 0) return;

          var dataUrl = await fetchAsDataURL(url);
          await new Promise(function (resolve, reject) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', reject, { once: true });
            img.src = dataUrl;
          });
          if (img.decode) {
            try { await img.decode(); } catch (_) {}
          }
        } catch (_) {
          img.src = transparentPx;
        }
      })
    );
  }

  // ============================================================
  // 把 background-image 的 url(...) 转为 data:URL 并回写到内联样式
  // ============================================================
  async function inlineBackgroundImages(scopeEl) {
    var nodes = Array.prototype.slice.call(scopeEl.querySelectorAll('*'));
    var urlRe = /url\(["']?([^"')]+)["']?\)/gi;

    await Promise.all(
      nodes.map(async function (el) {
        var cs = getComputedStyle(el);
        var bg = cs.backgroundImage;
        if (!bg || bg === 'none') return;

        var tasks = [];
        bg.replace(urlRe, function (_m, u) {
          var url = String(u || '').trim();
          if (!/^https?:\/\//i.test(url)) return _m;
          tasks.push(
            (async function () {
              try {
                var dataUrl = await fetchAsDataURL(url);
                return 'url("' + dataUrl + '")';
              } catch (_) {
                return 'none';
              }
            })()
          );
          return _m;
        });

        if (!tasks.length) return;
        var parts = await Promise.all(tasks);
        var i = 0;
        var newBg = bg.replace(urlRe, function () {
          var v = parts[i++];
          return v || 'none';
        });
        el.style.backgroundImage = newBg;
      })
    );
  }

  // ============================================================
  // 下载/分享/降级
  // ============================================================
  function ensurePngFilename(name) {
    var s = String(name || 'image.png');
    if (!/\.png$/i.test(s)) s += '.png';
    return s;
  }

  function canUseFileSystemAccessApi() {
    try {
      return !!(window && window.isSecureContext && typeof window.showSaveFilePicker === 'function');
    } catch (_) {
      return false;
    }
  }

  async function saveBlobWithFileSystemAccessApi(blob, filename, btn) {
    if (!canUseFileSystemAccessApi()) return { ok: false };

    var suggestedName = ensurePngFilename(filename);
    var handle = null;
    try { handle = btn && btn.__dl_fs_handle__; } catch (_) { handle = null; }

    var writable = null;
    try {
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] }
            }
          ]
        });
      }

      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true };
    } catch (e) {
      try { if (writable) await writable.close(); } catch (_) {}
      if (e && e.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: e };
    } finally {
      try { if (btn) btn.__dl_fs_handle__ = null; } catch (_) {}
    }
  }

  async function saveBlobWithBestEffort(blob, filename, btn) {
    var mobile = isMobileDevice();
    var hasGmDownload = typeof GM_download === 'function';

    log('saveBlobWithBestEffort', { mobile: mobile, hasGmDownload: hasGmDownload, canShare: !!navigator.share });

    // 移动端优先 Web Share
    if (mobile) {
      try {
        if (navigator.share) {
          var type = blob.type || 'image/png';
          var file = null;
          try {
            file = new File([blob], filename, { type: type });
          } catch (e) {
            file = null;
          }

          var canShareFiles = true;
          if (file && navigator.canShare) {
            try { canShareFiles = navigator.canShare({ files: [file] }); } catch (_) { canShareFiles = true; }
          }

          if (file && canShareFiles) {
            log('mobile: using navigator.share(files)');
            await navigator.share({ files: [file], title: filename });
            btn.removeAttribute('disabled');
            setButtonLabel(btn, '已打开分享');
            showToast('已打开系统分享/保存面板');
            setTimeout(function () { setButtonLabel(btn, ORIGINAL_LABEL); }, REVERT_MS);
            return;
          }
        }
      } catch (e) {
        warn('mobile: navigator.share failed, fallback to open tab', e);
      }

      // 移动端降级：
      // Via/部分 WebView 在"新标签页直接打开 blob:URL"时可能白屏（blob: 顶层导航/跨进程上下文限制），
      // 改为：先同步打开 about:blank（保留用户手势），再把图片转成 data:URL 写入完整 HTML 页面展示。
      var previewWin = null;
      try {
        previewWin = window.open('about:blank', '_blank');
      } catch (_) {
        previewWin = null;
      }

      if (previewWin) {
        try {
          previewWin.document.open();
          previewWin.document.write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loading...</title><body style="margin:0;background:#111;color:#eee;font-family:system-ui;padding:12px;">正在生成图片…</body>');
          previewWin.document.close();
        } catch (_) {}
      }

      try {
        log('mobile: generating data url for preview');
        var dataUrl = await blobToDataURL(blob);

        var ok = writePreviewWindow(previewWin, dataUrl, filename);
        if (!ok) {
          // 如果无法写入新窗口（被拦截/无句柄），尝试直接打开 data:URL（可能会被部分浏览器限制）。
          try {
            var a = document.createElement('a');
            a.href = dataUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (_) {}
        }

        btn.removeAttribute('disabled');
        setButtonLabel(btn, '已打开预览');
        showToast('已打开图片预览页，长按保存');
        setTimeout(function () { setButtonLabel(btn, ORIGINAL_LABEL); }, REVERT_MS);
        return;
      } catch (e2) {
        warn('mobile: data-url preview failed, fallback to blob url open-tab', e2);

        // 最后兜底：仍尝试 blob:URL（部分浏览器可用）
        var mobileUrl = URL.createObjectURL(blob);
        try {
          var a2 = document.createElement('a');
          a2.href = mobileUrl;
          a2.target = '_blank';
          a2.rel = 'noopener noreferrer';
          document.body.appendChild(a2);
          a2.click();
          a2.remove();
          setTimeout(function () {
            try { URL.revokeObjectURL(mobileUrl); } catch (_) {}
          }, 60000);
        } catch (_) {}

        btn.removeAttribute('disabled');
        setButtonLabel(btn, ORIGINAL_LABEL);
        showToast('无法自动打开图片，请查看控制台');
        return;
      }
    }

    // 桌面端：File System Access API → <a download> → GM_download
    var desiredFilename = ensurePngFilename(filename);

    // 1) File System Access API（优先）
    try {
      var fsRes = await saveBlobWithFileSystemAccessApi(blob, desiredFilename, btn);
      if (fsRes && fsRes.ok) {
        btn.removeAttribute('disabled');
        setButtonLabel(btn, '图片已保存！');
        showToast('图片已保存！');
        setTimeout(function () { setButtonLabel(btn, ORIGINAL_LABEL); }, REVERT_MS);
        return;
      }
      if (fsRes && fsRes.canceled) {
        btn.removeAttribute('disabled');
        setButtonLabel(btn, ORIGINAL_LABEL);
        showToast('已取消保存');
        return;
      }
      if (fsRes && fsRes.error) {
        warn('desktop: File System Access API failed, fallback', fsRes.error);
      }
    } catch (eFs) {
      warn('desktop: File System Access API failed, fallback', eFs);
    }

    // 2) <a download> 降级
    log('desktop: using <a download> fallback');
    var url = null;
    try {
      url = URL.createObjectURL(blob);
      var a2 = document.createElement('a');
      a2.href = url;
      a2.download = desiredFilename;
      document.body.appendChild(a2);
      a2.click();
      a2.remove();

      // 延迟释放，避免部分浏览器过早回收导致下载失败
      setTimeout(function () {
        try { if (url) URL.revokeObjectURL(url); } catch (_) {}
      }, 60000);

      btn.removeAttribute('disabled');
      setButtonLabel(btn, '图片已下载！');
      showToast('图片已下载！');
      setTimeout(function () { setButtonLabel(btn, ORIGINAL_LABEL); }, REVERT_MS);
      return;
    } catch (e3) {
      err('desktop: <a download> failed:', e3);
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
    }

    // 3) GM_download 最后兜底
    if (hasGmDownload) {
      var url2 = null;
      try {
        url2 = URL.createObjectURL(blob);
        log('desktop: using GM_download (last resort)');
        GM_download({
          url: url2,
          name: desiredFilename,
          saveAs: true,
          onload: function () {
            try { if (url2) URL.revokeObjectURL(url2); } catch (_) {}
            btn.removeAttribute('disabled');
            setButtonLabel(btn, '图片已下载！');
            showToast('图片已下载！');
            setTimeout(function () { setButtonLabel(btn, ORIGINAL_LABEL); }, REVERT_MS);
          },
          onerror: function (e4) {
            err('GM_download error:', e4);
            try { if (url2) URL.revokeObjectURL(url2); } catch (_) {}
            btn.removeAttribute('disabled');
            setButtonLabel(btn, ORIGINAL_LABEL);
            showToast('下载失败，查看控制台了解详情');
          }
        });
        return;
      } catch (e5) {
        err('desktop: GM_download failed:', e5);
        try { if (url2) URL.revokeObjectURL(url2); } catch (_) {}
      }
    }

    btn.removeAttribute('disabled');
    setButtonLabel(btn, ORIGINAL_LABEL);
    showToast('下载失败，查看控制台了解详情');
  }

  // ============================================================
  // 截图与下载
  // ============================================================
  async function captureAndDownload(btn, dlg) {
    btn.setAttribute('disabled', 'true');
    setButtonLabel(btn, ORIGINAL_LABEL);
    var offscreenRoot = null;

    try {
      log('capture: start');

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });

      var cloned = createOffscreenClone(dlg);
      offscreenRoot = cloned.offscreenRoot;

      var clonedCard = offscreenRoot.querySelector(CARD_SELECTOR);
      if (!clonedCard) throw new Error('未找到共享链接预览卡片');

      var inner = offscreenRoot.querySelector('.rounded-b-3xl.p-5');
      if (inner) inner.style.padding = '20px 20px 40px 20px';

      log('capture: inline images');
      await deCrossOriginAllImages(clonedCard, TRANSPARENT_PX);
      await inlineBackgroundImages(clonedCard);

      var rect = clonedCard.getBoundingClientRect();
      var w = Math.ceil(clonedCard.scrollWidth || rect.width || 1200);
      var h = Math.ceil(clonedCard.scrollHeight || rect.height || 630);

      var h2i = typeof htmlToImage !== 'undefined' ? htmlToImage : (window.htmlToImage || null);
      if (!h2i) throw new Error('html-to-image 未加载');

      var pixelRatio = computeSafePixelRatioForCapture(w, h);
      log('capture: render', {
        w: w,
        h: h,
        pixelRatio: pixelRatio,
        firefox: isFirefox()
      });

      var renderOpts = {
        pixelRatio: pixelRatio,
        cacheBust: true,
        backgroundColor: null,
        width: w,
        height: h,
        imagePlaceholder: TRANSPARENT_PX,
        filter: function (node) {
          var el = node;
          if (el && el.classList && el.classList.contains('bg-gradient-to-t')) return false;
          var tag = el && el.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return false;
          return true;
        }
      };

      // Firefox: html-to-image 1.11.13 在扫描/内联跨域样式表时更容易崩溃
      // 规避：禁用字体内联（不触碰跨域 cssRules）
      if (isFirefox()) {
        log('capture: applying Firefox workarounds (skipFonts)');
        renderOpts.skipFonts = true;
        renderOpts.fontEmbedCSS = '';
      }

      var blob = await renderNodeToBlobBestEffort(h2i, clonedCard, renderOpts);

      if (!blob) throw new Error('生成图片失败：返回空 Blob');

      var filename = makeFilename(dlg);
      log('capture: blob ok', { size: blob.size, type: blob.type, filename: filename });

      await saveBlobWithBestEffort(blob, filename, btn);
    } catch (e) {
      err('capture failed:', e);
      btn.removeAttribute('disabled');
      setButtonLabel(btn, ORIGINAL_LABEL);
      showToast('截图失败，查看控制台了解详情');
    } finally {
      try { if (offscreenRoot) offscreenRoot.remove(); } catch (_) {}
      try {
        var extra = document.querySelectorAll('.__offscreen_capture_root__');
        for (var i = 0; i < extra.length; i++) {
          var n = extra[i];
          if (n !== offscreenRoot) n.remove();
        }
      } catch (_) {}
      try { if (btn) btn.__dl_fs_handle__ = null; } catch (_) {}
    }
  }

  // ============================================================
  // 插入逻辑（简化：直接 cloneNode + 过滤动画类）
  // ============================================================
  function tryInsertButton() {
    var dlg = findShareDialog();
    if (!dlg) return;

    if (dlg.querySelector('.__dl_final_btn__')) return;

    var copyBtn = findCopyButton(dlg);
    if (!copyBtn) {
      log('insert: dialog found but copy button not found');
      return;
    }

    log('insert: found dialog & copy button', {
      mobile: isMobileDevice(),
      title: dialogTitleText(dlg),
      hasCard: !!dlg.querySelector(CARD_SELECTOR)
    });

    // 简单克隆
    var btn = copyBtn.cloneNode(true);
    btn.classList.add('__dl_final_btn__');
    btn.setAttribute('type', 'button');

    // 确保新按钮永远可点击：不要继承"复制链接"按钮的 disabled 状态
    try {
      if ('disabled' in btn) btn.disabled = false;
    } catch (_) {}
    try { btn.removeAttribute('disabled'); } catch (_) {}
    try { btn.removeAttribute('aria-disabled'); } catch (_) {}

    // 过滤动画类
    filterAnimationClassesRecursive(btn);

    // 替换图标
    setDownloadIcon(btn);
    setButtonLabel(btn, ORIGINAL_LABEL);
    btn.style.marginBottom = '8px';

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      log('click: download button');

      // 桌面端：尽量在用户手势内先弹出保存对话框（避免后续 await 导致 showSaveFilePicker 丢失激活态）
      if (!isMobileDevice() && canUseFileSystemAccessApi()) {
        try {
          var suggestedName = ensurePngFilename(makeFilename(dlg));
          btn.__dl_fs_handle__ = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [
              {
                description: 'PNG Image',
                accept: { 'image/png': ['.png'] }
              }
            ]
          });
        } catch (ePick) {
          try { btn.__dl_fs_handle__ = null; } catch (_) {}
          if (ePick && ePick.name === 'AbortError') {
            showToast('已取消保存');
            return;
          }
          warn('desktop: showSaveFilePicker failed, fallback to normal download flow', ePick);
        }
      }

      captureAndDownload(btn, dlg);
    });

    var parent = copyBtn.parentElement || dlg;
    parent.insertBefore(btn, copyBtn);
    log('insert: download button inserted');
  }

  // ============================================================
  // 启动
  // ============================================================
  log('boot', {
    href: location.href,
    ua: navigator.userAgent,
    mobile: isMobileDevice(),
    hasGM_download: typeof GM_download === 'function',
    hasGM_xmlhttpRequest: typeof GM_xmlhttpRequest === 'function',
    hasShare: !!navigator.share
  });

  var observer = new MutationObserver(function () {
    tryInsertButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInsertButton();
})();
