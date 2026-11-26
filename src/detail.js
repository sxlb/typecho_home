/**
 * 预览 / 评论详情
 *
 * 先看成品再决定是否编辑：已发布文章默认进这里，正文用 Vditor 只读渲染，
 * 下方直接列出评论，站长可以当场通过 / 标垃圾 / 回复 / 删除，不用再绕到管理页。
 *
 * 时光机复用同一个视图：正文换成说说内容，评论换成这条说说下的回复（parent = coid）。
 */

import Vditor from 'vditor';
import { call, callAdmin, getSettings } from './api.js';

const $ = (selector) => document.querySelector(selector);

const PAGE_SIZE = 50;

const STATUS_LABELS = {
  waiting: '待审核',
  spam: '垃圾',
};

const STATUS_ACTIONS = {
  approve: { action: 'commentApprove', message: '评论已通过' },
  spam: { action: 'commentSpam', message: '已标记为垃圾' },
};

const el = {
  body: $('#detail-body'),
  loading: $('#detail-loading'),
  error: $('#detail-error'),
  errorText: $('#detail-error-text'),
  retry: $('#btn-detail-retry'),
  content: $('#detail-content'),
  title: $('#detail-title'),
  meta: $('#detail-meta'),
  markdown: $('#detail-markdown'),
  status: $('#detail-status'),
  edit: $('#btn-detail-edit'),
  comments: $('#detail-comments'),
  commentsLabel: $('#detail-comments-label'),
  commentCount: $('#detail-comment-count'),
  commentList: $('#detail-comment-list'),
  commentEmpty: $('#detail-comment-empty'),
  more: $('#detail-more'),
};

const state = {
  kind: 'post',
  cid: 0,
  coid: 0,
  seq: 0,
  items: [],
  total: 0,
  page: 1,
  busy: false,
  retry: null,
};

let toast = () => {};
let onBack = () => {};
let onEdit = () => {};
let canModerate = () => false;

/**
 * @param {{onToast?: Function, onBack?: Function, onEdit?: Function, canModerate?: Function}} options
 */
export function initDetail(options = {}) {
  toast = typeof options.onToast === 'function' ? options.onToast : toast;
  onBack = typeof options.onBack === 'function' ? options.onBack : onBack;
  onEdit = typeof options.onEdit === 'function' ? options.onEdit : onEdit;
  canModerate = typeof options.canModerate === 'function' ? options.canModerate : canModerate;

  $('#btn-detail-back').addEventListener('click', () => onBack());
  el.edit.addEventListener('click', () => {
    if (state.cid > 0) {
      onEdit(state.cid);
    }
  });
  $('#btn-detail-refresh').addEventListener('click', () => {
    loadComments({ reset: true });
  });
  el.more.addEventListener('click', () => {
    state.page += 1;
    loadComments({ reset: false });
  });
  el.retry.addEventListener('click', () => {
    state.retry?.();
  });

  // 评论操作统一走事件委托：列表会整体重绘，逐个绑定容易漏
  el.commentList.addEventListener('click', handleCommentClick);
}

/**
 * 离开详情时丢弃进行中的请求结果
 */
export function resetDetail() {
  state.seq += 1;
  state.items = [];
  state.total = 0;
  state.page = 1;
  state.busy = false;
  state.retry = null;
}

/**
 * 打开文章预览
 *
 * @param {number} cid
 */
export async function openPostDetail(cid) {
  const seq = (state.seq += 1);
  state.kind = 'post';
  state.cid = cid;
  state.coid = 0;
  state.items = [];
  state.total = 0;
  state.page = 1;

  el.status.textContent = '预览';
  el.edit.hidden = false;
  el.title.hidden = false;
  el.title.textContent = '';
  el.meta.textContent = '';
  el.markdown.innerHTML = '';
  el.commentList.innerHTML = '';
  el.commentCount.textContent = '';
  el.commentEmpty.hidden = true;
  el.more.hidden = true;
  el.comments.hidden = true;
  el.content.hidden = true;
  el.error.hidden = true;
  el.loading.hidden = false;
  el.loading.textContent = '加载中…';
  el.body.scrollTop = 0;

  try {
    const post = await call('post', { query: { cid } });

    if (seq !== state.seq) {
      return;
    }

    el.title.textContent = post.title || '未命名';
    el.meta.textContent = [formatTime(post.created), post.status === 'draft' ? '草稿' : '已发布']
      .filter(Boolean)
      .join(' · ');

    await renderMarkdown(post.text || '');

    if (seq !== state.seq) {
      return;
    }

    el.loading.hidden = true;
    el.content.hidden = false;
    state.retry = () => openPostDetail(cid);
    prepareComments('评论');

    if (!el.comments.hidden) {
      await loadComments({ reset: true });
    }
  } catch (error) {
    if (seq !== state.seq) {
      return;
    }

    showError(error.message);
    state.retry = () => openPostDetail(cid);
  }
}

/**
 * 打开说说详情（内容已在列表里，无需再请求）
 *
 * @param {{coid:number,cid:number,created:number,text:string,plain?:string,secret?:boolean}} item
 */
export async function openShuoshuoDetail(item) {
  const seq = (state.seq += 1);
  state.kind = 'shuoshuo';
  state.cid = Number(item.cid || 0);
  state.coid = Number(item.coid || 0);
  state.items = [];
  state.total = 0;
  state.page = 1;

  el.status.textContent = '说说';
  el.edit.hidden = true;
  el.title.hidden = true;
  el.title.textContent = '';
  el.meta.textContent = [formatTime(item.created), item.secret ? '私密' : '']
    .filter(Boolean)
    .join(' · ');
  el.markdown.innerHTML = '';
  el.commentList.innerHTML = '';
  el.commentCount.textContent = '';
  el.commentEmpty.hidden = true;
  el.more.hidden = true;
  el.comments.hidden = true;
  el.error.hidden = true;
  el.loading.hidden = true;
  el.content.hidden = false;
  el.body.scrollTop = 0;

  await renderMarkdown(item.text || item.plain || '');

  if (seq !== state.seq) {
    return;
  }

  prepareComments('回复');

  if (!el.comments.hidden) {
    await loadComments({ reset: true });
  }
}

// ─── 正文 ────────────────────────────────────────────────────────────────

/**
 * 相对路径补成站点绝对地址
 *
 * App 的页面来源是 capacitor://localhost，正文里的 /usr/uploads/... 直接渲染会 404。
 */
function resolveUrls(text) {
  const server = String(getSettings().server || '').replace(/\/+$/, '');

  if (!server) {
    return text;
  }

  return text
    .replace(
      /(!\[[^\]]*\]\()(\/(?!\/)[^)\s]*)/g,
      (match, prefix, path) => prefix + server + path,
    )
    .replace(
      /(<img[^>]+src=["'])(\/(?!\/)[^"']*)/gi,
      (match, prefix, path) => prefix + server + path,
    );
}

async function renderMarkdown(text) {
  const content = resolveUrls(text);
  const mode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  el.markdown.innerHTML = '';
  el.markdown.classList.remove('vditor-reset');
  el.markdown.style.whiteSpace = '';

  if (!content.trim()) {
    el.markdown.textContent = '（正文为空）';
    return;
  }

  try {
    await Vditor.preview(el.markdown, content, {
      mode,
      // 与编辑器一致：资源走本地副本，离线也能渲染
      cdn: `${import.meta.env.BASE_URL}vditor`,
      lang: 'zh_CN',
      hljs: { style: 'monokai', lineNumber: false },
      math: { engine: 'MathJax' },
      speech: { enable: false },
      anchor: 0,
    });
  } catch {
    // 渲染失败至少保证内容可读，不让整页空白
    el.markdown.textContent = content;
    el.markdown.style.whiteSpace = 'pre-wrap';
  }
}

function showError(message) {
  el.loading.hidden = true;
  el.content.hidden = true;
  el.error.hidden = false;
  el.errorText.textContent = message || '请检查网络后重试';
}

// ─── 评论 ────────────────────────────────────────────────────────────────

function prepareComments(label) {
  const allowed = canModerate();
  el.comments.hidden = !allowed;
  el.commentsLabel.textContent = label;

  if (!allowed) {
    el.commentEmpty.hidden = true;
  }
}

async function loadComments({ reset }) {
  if (el.comments.hidden || state.busy) {
    return;
  }

  if (reset) {
    state.page = 1;
    state.items = [];
    el.commentList.innerHTML = '';
    el.commentEmpty.hidden = true;
  }

  const seq = state.seq;
  const query = { status: 'all', page: state.page, size: PAGE_SIZE };

  if (state.kind === 'shuoshuo') {
    query.parent = state.coid;
  } else {
    query.cid = state.cid;
  }

  state.busy = true;
  el.more.disabled = true;

  try {
    const data = await callAdmin('comments', { query });

    if (seq !== state.seq) {
      return;
    }

    state.total = Number(data.total || 0);
    state.items = reset ? data.items || [] : state.items.concat(data.items || []);
    renderComments();
  } catch (error) {
    if (seq !== state.seq) {
      return;
    }

    el.commentEmpty.hidden = false;
    el.commentEmpty.textContent = `评论加载失败：${error.message}`;
  } finally {
    state.busy = false;
    el.more.disabled = false;
  }
}

function renderComments() {
  el.commentList.innerHTML = '';

  state.items.forEach((item) => {
    el.commentList.appendChild(createComment(item));
  });

  el.commentCount.textContent = state.total ? `(${state.total})` : '';
  el.commentEmpty.hidden = state.items.length > 0;

  if (!state.items.length) {
    el.commentEmpty.textContent = '还没有评论';
  }

  el.more.hidden = state.items.length >= state.total;
}

function createComment(item) {
  const row = document.createElement('div');
  row.className = 'comment-item';
  row.dataset.coid = String(item.coid);

  const head = document.createElement('div');
  head.className = 'comment-head';

  const author = document.createElement('span');
  author.className = 'comment-author';
  author.textContent = item.author || '匿名';
  head.appendChild(author);

  if (item.status !== 'approved') {
    const badge = document.createElement('span');
    badge.className = `comment-status ${item.status}`;
    badge.textContent = STATUS_LABELS[item.status] || item.status;
    head.appendChild(badge);
  }

  if (Number(item.parent) > 0) {
    const reply = document.createElement('span');
    reply.className = 'comment-status reply';
    reply.textContent = '回复';
    head.appendChild(reply);
  }

  const time = document.createElement('span');
  time.className = 'comment-time';
  time.textContent = formatTime(item.created);
  head.appendChild(time);

  const text = document.createElement('p');
  text.className = 'comment-text';
  text.textContent = item.text || '';

  const actions = document.createElement('div');
  actions.className = 'comment-actions';

  if (item.status !== 'approved') {
    actions.appendChild(commentButton('通过', 'approve'));
  }

  if (item.status !== 'spam') {
    actions.appendChild(commentButton('垃圾', 'spam'));
  }

  actions.appendChild(commentButton('回复', 'reply'));
  actions.appendChild(commentButton('删除', 'delete', true));

  const replyBox = document.createElement('div');
  replyBox.className = 'comment-reply';
  replyBox.hidden = true;

  const input = document.createElement('textarea');
  input.rows = 2;
  input.placeholder = '以站长身份回复…';

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'btn primary small';
  send.textContent = '发送回复';
  send.addEventListener('click', () => sendReply(row, input, send));

  replyBox.append(input, send);

  row.append(head, text, actions, replyBox);
  return row;
}

function commentButton(label, act, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `comment-act${danger ? ' danger' : ''}`;
  button.dataset.cact = act;
  button.textContent = label;
  return button;
}

async function handleCommentClick(event) {
  const button = event.target.closest('button[data-cact]');

  if (!button) {
    return;
  }

  const row = button.closest('.comment-item');
  const coid = Number(row?.dataset.coid || 0);

  if (!coid) {
    return;
  }

  const act = button.dataset.cact;

  if (act === 'reply') {
    const box = row.querySelector('.comment-reply');
    box.hidden = !box.hidden;

    if (!box.hidden) {
      box.querySelector('textarea')?.focus();
    }

    return;
  }

  if (act === 'delete') {
    // 两步确认：第一次点击进入确认态，4 秒内再点才真正删除
    if (!button.classList.contains('armed')) {
      button.classList.add('armed');
      button.textContent = '确认删除';
      button.dataset.timer = String(window.setTimeout(() => {
        button.classList.remove('armed');
        button.textContent = '删除';
      }, 4000));
      return;
    }

    window.clearTimeout(Number(button.dataset.timer || 0));
  }

  const config = STATUS_ACTIONS[act];

  button.disabled = true;

  try {
    if (act === 'delete') {
      await callAdmin('commentDelete', { method: 'POST', body: { coid } });
      toast('评论已删除');
    } else {
      await callAdmin(config.action, { method: 'POST', body: { coid } });
      toast(config.message);
    }

    await loadComments({ reset: true });
  } catch (error) {
    toast(error.message);
    button.disabled = false;

    if (act === 'delete') {
      button.classList.remove('armed');
      button.textContent = '删除';
    }
  }
}

async function sendReply(row, input, button) {
  const coid = Number(row.dataset.coid || 0);
  const value = input.value.trim();

  if (!value) {
    toast('回复内容不能为空');
    return;
  }

  button.disabled = true;

  try {
    await callAdmin('commentReply', { method: 'POST', body: { coid, text: value } });
    toast('回复已发送');
    await loadComments({ reset: true });
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

// ─── 工具 ────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const stamp = Number(ts || 0);

  if (!stamp) {
    return '';
  }

  const date = new Date(stamp * 1000);
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
