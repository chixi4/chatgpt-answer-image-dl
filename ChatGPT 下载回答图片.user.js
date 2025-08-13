// ==UserScript==
// @name         ChatGPT 回答图片分享
// @namespace    https://github.com/chixi4/chatgpt-answer-image-dl
// @version      1.0.1
// @description  在 ChatGPT “共享”里，点击“下载图片”
// @author       Chixi
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js
// @grant        GM_addStyle
// @grant        GM_download
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/chixi4/chatgpt-answer-image-dl/main/chatgpt-answer-image.user.js
// @updateURL    https://raw.githubusercontent.com/chixi4/chatgpt-answer-image-dl/main/chatgpt-answer-image.user.js
// ==/UserScript==

(function () {
  'use strict';

  const REVERT_MS = 2000;
  const ORIGINAL_LABEL = '下载图片';
  const CARD_SELECTOR = '[data-testid="sharing-post-unfurl-view"]';

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
  `);

  function showToast(message) {
    let host = document.querySelector('.__dl_toast_host');
    if (!host) {
      host = document.createElement('div');
      host.className = '__dl_toast_host';
      document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.className = '__dl_toast_core';
    toast.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.498 6.90887C12.7094 6.60867 13.1245 6.53642 13.4248 6.74774C13.7249 6.95913 13.7971 7.37424 13.5859 7.6745L9.62695 13.2995C9.51084 13.4644 9.32628 13.5681 9.125 13.5807C8.94863 13.5918 8.77583 13.5319 8.64453 13.4167L8.59082 13.364L6.50781 11.072L6.42773 10.9645C6.26956 10.6986 6.31486 10.3488 6.55273 10.1325C6.79045 9.91663 7.14198 9.9053 7.3916 10.0876L7.49219 10.1774L9.0166 11.8542L12.498 6.90887Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M10.3333 2.08496C14.7046 2.08496 18.2483 5.62867 18.2483 10C18.2483 14.3713 14.7046 17.915 10.3333 17.915C5.96192 17.915 2.41821 14.3713 2.41821 10C2.41821 5.62867 5.96192 2.08496 10.3333 2.08496ZM10.3333 3.41504C6.69646 3.41504 3.74829 6.3632 3.74829 10C3.74829 13.6368 6.69646 16.585 10.3333 16.585C13.97 16.585 16.9182 13.6368 16.9182 10C16.9182 6.3632 13.97 3.41504 10.3333 3.41504Z"></path></svg><span>${message}</span>`;
    host.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove()); }, 2000);
  }

  function makeFilename(dlg) {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const titleElement = dlg.querySelector('h2[id^="radix-"]');
    const title = titleElement ? titleElement.textContent.trim().replace(/[\/\\?%*:|"<>]/g, '-') : 'chatgpt_share';
    return `${title}_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}.png`;
  }

  function createOffscreenClone(sourceDialog) {
    const offscreenRoot = document.createElement('div');
    offscreenRoot.className = '__offscreen_capture_root__';
    const clonedDialog = sourceDialog.cloneNode(true);
    clonedDialog.classList.add('unlock-for-capture');
    offscreenRoot.appendChild(clonedDialog);
    document.documentElement.appendChild(offscreenRoot);
    return { offscreenRoot, clonedDialog };
  }

  function setButtonLabel(btn, text) {
    let label =
      btn.querySelector('.w-full.text-center.text-xs') ||
      btn.querySelector('.text-xs') ||
      Array.from(btn.querySelectorAll('div, span')).reverse().find(el => (el.textContent || '').trim().length > 0);
    if (!label) label = btn;
    label.textContent = text;
  }

  function setDownloadIconLikeCopy(btn) {
    const svg = btn.querySelector('svg');
    if (!svg) return;
    const keepW = svg.getAttribute('width');
    const keepH = svg.getAttribute('height');
    const keepClass = svg.getAttribute('class') || '';
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (keepW) svg.setAttribute('width', keepW);
    if (keepH) svg.setAttribute('height', keepH);
    if (keepClass) svg.setAttribute('class', keepClass);
    svg.innerHTML = `<path fill="currentColor" d="M8.759 3h6.482c.805 0 1.47 0 2.01.044.563.046 1.08.145 1.565.392a4 4 0 0 1 1.748 1.748c.247.485.346 1.002.392 1.564C21 7.29 21 7.954 21 8.758v6.483c0 .805 0 1.47-.044 2.01-.046.563-.145 1.08-.392 1.565a4 4 0 0 1-1.748 1.748c-.485.247-1.002.346-1.564.392-.541.044-1.206.044-2.01.044H8.758c-.805 0-1.47 0-2.01-.044-.563-.046-1.08-.145-1.565-.392a4 4 0 0 1-1.748-1.748c-.247-.485-.346-1.002-.392-1.564C3 16.71 3 16.046 3 15.242V8.758c0-.805 0-1.47.044-2.01.046-.563.145-1.08.392-1.565a4 4 0 0 1 1.748-1.748c.485-.247 1.002-.346 1.564-.392C7.29 3 7.954 3 8.758 3M6.91 5.038c-.438.035-.663.1-.819.18a2 2 0 0 0-.874.874c-.08.156-.145.38-.18.819C5 7.361 5 7.943 5 8.8v4.786l.879-.879a3 3 0 0 1 4.242 0l6.286 6.286c.261-.005.484-.014.682-.03.438-.036.663-.101.819-.181a2 2 0 0 0 .874-.874c.08-.156.145-.38.18-.819.037-.45.038-1.032.038-1.889V8.8c0-.857 0-1.439-.038-1.889-.035-.438-.1-.663-.18-.819a2 2 0 0 0-.874-.874c-.156-.08-.38-.145-.819-.18C16.639 5 16.057 5 15.2 5H8.8c-.857 0-1.439 0-1.889.038M13.586 19l-4.879-4.879a1 1 0 0 0-1.414 0l-2.286 2.286c.005.261.014.484.03.682.036.438.101.663.181.819a2 2 0 0 0 .874.874c.156.08.38.145.819.18C7.361 19 7.943 19 8.8 19zM14.5 8.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0 3 3 0 0 1-6 0"></path>`;
  }

  // —— 新增：跨语言查找共享弹窗 & “复制链接”按钮 ——
  function findShareDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')];
    for (const d of dialogs) {
      if (d.querySelector(CARD_SELECTOR)) return d; // 有共享预览卡片就确定是共享弹窗
      const linkInput = d.querySelector('input[type="text"],input[readonly],input');
      const val = linkInput?.value || '';
      if (/chatgpt\.com\/share\/|chat\.openai\.com\/share\//i.test(val)) return d;
      const hasShareTestId = [...d.querySelectorAll('[data-testid]')].some(n => /share/i.test(n.getAttribute('data-testid') || ''));
      if (hasShareTestId) return d;
    }
    return null;
  }

  function findCopyButton(root) {
    // 1) 优先 data-testid / aria-label
    const byTestId = root.querySelector('[data-testid*="copy" i],[data-testid*="share-copy" i]');
    if (byTestId) return byTestId.closest('button,[role="button"]') || byTestId;
    const byAria = [...root.querySelectorAll('[aria-label]')].find(el => /copy/i.test(el.getAttribute('aria-label') || ''));
    if (byAria) return byAria.closest('button,[role="button"]') || byAria;

    // 2) 兜底多语种文案
    const patterns = [
      '复制链接','Copy link','リンクをコピー','링크 복사',
      'Copiar enlace','Copiar link','Copiar vínculo','Copier le lien','Kopieren'
    ].map(s => new RegExp(s, 'i'));
    const candidates = [...root.querySelectorAll('button,[role="button"]')];
    const btn = candidates.find(b => patterns.some(re => re.test((b.textContent || '').trim())));
    if (btn) return btn;

    // 3) 实在找不到，就用第一个按钮当参照（仍可插入）
    return root.querySelector('button,[role="button"]');
  }

  async function captureAndDownload(btn, dlg) {
    btn.setAttribute('disabled', 'true');
    setButtonLabel(btn, ORIGINAL_LABEL);
    let offscreenRoot = null;

    try {
      if (document.fonts?.ready) { await document.fonts.ready; }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const { offscreenRoot: root } = createOffscreenClone(dlg);
      offscreenRoot = root;

      const clonedCard = offscreenRoot.querySelector(CARD_SELECTOR);
      if (!clonedCard) throw new Error('未找到共享链接预览卡片');

      const inner = offscreenRoot.querySelector('.rounded-b-3xl.p-5');
      if (inner) inner.style.padding = '20px 20px 40px 20px';

      const w = Math.ceil(clonedCard.scrollWidth || clonedCard.getBoundingClientRect().width || 1200);
      const h = Math.ceil(clonedCard.scrollHeight || clonedCard.getBoundingClientRect().height || 630);

      const h2i = (typeof htmlToImage !== 'undefined' ? htmlToImage : (window.htmlToImage || null));
      if (!h2i) throw new Error('html-to-image 未加载');

      const blob = await h2i.toBlob(clonedCard, {
        pixelRatio: Math.max(2, window.devicePixelRatio || 1),
        cacheBust: true,
        backgroundColor: null,
        width: w,
        height: h,
        filter: (node) => {
          const el = node;
          if (el?.classList?.contains('bg-gradient-to-t')) return false;
          const tag = el?.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return false;
          return true;
        }
      });
      if (!blob) throw new Error('生成图片失败：返回空 Blob');

      const url = URL.createObjectURL(blob);
      const filename = makeFilename(dlg);

      if (typeof GM_download === 'function') {
        GM_download({
          url,
          name: filename,
          saveAs: true,
          onload: () => {
            URL.revokeObjectURL(url);
            btn.removeAttribute('disabled');
            setButtonLabel(btn, '图片已下载！');
            showToast('图片已下载！');
            setTimeout(() => setButtonLabel(btn, ORIGINAL_LABEL), REVERT_MS);
          },
          onerror: (err) => {
            console.error('GM_download error:', err);
            btn.removeAttribute('disabled');
            setButtonLabel(btn, ORIGINAL_LABEL);
            showToast('下载失败，查看控制台了解详情');
          }
        });
      } else {
        // 兜底
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        btn.removeAttribute('disabled');
        setButtonLabel(btn, '图片已下载！');
        showToast('图片已下载！');
        setTimeout(() => setButtonLabel(btn, ORIGINAL_LABEL), REVERT_MS);
      }
    } catch (err) {
      console.error('截图失败:', err);
      btn.removeAttribute('disabled');
      setButtonLabel(btn, ORIGINAL_LABEL);
      showToast('截图失败，查看控制台了解详情');
    } finally {
      try { offscreenRoot?.remove(); } catch {}
      document.querySelectorAll('.__offscreen_capture_root__').forEach(n => n !== offscreenRoot && n.remove());
    }
  }

  function tryInsertButton() {
    const dlg = findShareDialog();
    if (!dlg || dlg.querySelector('.__dl_final_btn__')) return;

    const copyBtn = findCopyButton(dlg);
    if (!copyBtn) return;

    const btn = copyBtn.cloneNode(true);
    btn.classList.add('__dl_final_btn__');
    btn.setAttribute('type', 'button');

    setDownloadIconLikeCopy(btn);
    setButtonLabel(btn, ORIGINAL_LABEL);
    btn.style.marginBottom = '8px';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      captureAndDownload(btn, dlg);
    });

    // 插到“复制链接”按钮前；如果没有明确父节点，则插在对话框里第一个按钮前
    const parent = copyBtn.parentElement || dlg;
    parent.insertBefore(btn, copyBtn);
  }

  const observer = new MutationObserver(tryInsertButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInsertButton();
})();
