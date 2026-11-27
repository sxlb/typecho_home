/**
 * 本地草稿与版本历史
 *
 * 草稿键：sxlb.local.<cid | draft-xxxx>，一篇草稿一个槽位；
 * 历史键：sxlb.history.<同上>，按时间倒序保留最近 20 个快照。
 */

const DRAFT_PREFIX = 'sxlb.local.';
const HISTORY_PREFIX = 'sxlb.history.';
const MAX_HISTORY = 20;

export function newDraftId() {
  return `draft-${Date.now().toString(36)}`;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

/**
 * 写入 localStorage，配额溢出时返回 false 而不是抛出
 */
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[sxlb] 本地存储写入失败', error);
    return false;
  }
}

export function readDraft(key) {
  return readJson(DRAFT_PREFIX + key);
}

/**
 * 比较草稿内容是否一致（忽略 updatedAt）
 *
 * 字段必须覆盖 persistLocal 写入的全部键：漏掉任何一项，
 * 只改这项时 updatedAt 不会刷新，本地改动会被判成「旧草稿」而丢弃。
 */
function sameContent(a, b) {
  const fields = [
    'cid',
    'kind',
    'title',
    'text',
    'tags',
    'summary',
    'album',
    'imagePost',
    'thumb',
    'reprint',
    'pinned',
    'slug',
    'created',
    // 独立页面的设置项
    'template',
    'status',
    'order',
    'allowComment',
    'originalSlug',
  ];

  if (fields.some((field) => String(a[field] ?? '') !== String(b[field] ?? ''))) {
    return false;
  }

  const aMid = Array.isArray(a.mid) ? [...a.mid].map(Number).sort() : [];
  const bMid = Array.isArray(b.mid) ? [...b.mid].map(Number).sort() : [];

  return JSON.stringify(aMid) === JSON.stringify(bMid);
}

/**
 * 写入草稿；正文与标题都为空时不落盘，避免产生空草稿
 *
 * @param {string} key cid 或本地草稿 id
 * @param {object} data
 * @returns {boolean} 是否写入成功
 */
export function writeDraft(key, data) {
  if (!key) {
    return false;
  }

  if (!String(data.text || '').trim() && !String(data.title || '').trim()) {
    localStorage.removeItem(DRAFT_PREFIX + key);
    return true;
  }

  const prev = readDraft(key);
  const next = { ...data, updatedAt: Date.now() };

  // 内容没变就不刷新时间戳：只是打开再返回，不应让本地草稿「变新」，
  // 否则下次加载会用陈旧内容覆盖网页端的修改
  if (prev && sameContent(prev, next)) {
    next.updatedAt = prev.updatedAt || next.updatedAt;
  }

  return safeSet(DRAFT_PREFIX + key, JSON.stringify(next));
}

export function removeDraft(key) {
  if (key) {
    localStorage.removeItem(DRAFT_PREFIX + key);
  }
}

export function listDrafts() {
  const drafts = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);

    if (!key || !key.startsWith(DRAFT_PREFIX)) {
      continue;
    }

    const data = readJson(key);

    if (!data) {
      continue;
    }

    drafts.push({ id: key.slice(DRAFT_PREFIX.length), ...data });
  }

  return drafts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function pushHistory(key, { title, text }) {
  if (!key || !String(text || '').trim()) {
    return;
  }

  const list = readHistory(key);
  const latest = list[0];

  // 内容没变化就不重复记录
  if (latest && latest.text === text && latest.title === title) {
    return;
  }

  list.unshift({ at: Date.now(), title: title || '', text });
  safeSet(HISTORY_PREFIX + key, JSON.stringify(list.slice(0, MAX_HISTORY)));
}

export function readHistory(key) {
  if (!key) {
    return [];
  }

  const list = readJson(HISTORY_PREFIX + key);

  return Array.isArray(list) ? list : [];
}

export function clearHistory(key) {
  if (key) {
    localStorage.removeItem(HISTORY_PREFIX + key);
  }
}

/**
 * 旧版本只有 sxlb.local.new 一个槽位，升级后迁移成独立草稿
 */
export function migrateLegacyDraft() {
  const legacy = readJson(`${DRAFT_PREFIX}new`);

  if (legacy && (String(legacy.text || '').trim() || String(legacy.title || '').trim())) {
    const id = `draft-${(legacy.updatedAt || Date.now()).toString(36)}`;
    const saved = safeSet(DRAFT_PREFIX + id, JSON.stringify(legacy));

    // 配额满等写入失败时保留旧键，下次启动再试，避免唯一一份老草稿被删掉
    if (!saved) {
      return;
    }
  }

  localStorage.removeItem(`${DRAFT_PREFIX}new`);
}

/* ─── 待发布队列（断网时暂存，联网后自动重试） ─────────────── */

const QUEUE_KEY = 'sxlb.queue';
const MAX_QUEUE = 20;

/**
 * 读取待发布队列，按入队时间升序（先入队先重试）
 *
 * @returns {Array<{id:string,draftKey:string,body:object,isDraft:boolean,title:string,createdAt:number,attempts:number,error:string}>}
 */
export function listQueue() {
  const list = readJson(QUEUE_KEY);

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .filter((item) => item && item.body && typeof item.body === 'object')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function writeQueue(list) {
  return safeSet(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
}

/**
 * 入队 / 更新
 *
 * 同一篇（draftKey 相同）只保留一条并覆盖为最新内容，
 * 否则断网期间反复点发布会在队列里堆出多条重复文章。
 *
 * @param {{draftKey?:string,body:object,isDraft:boolean,title:string}} data
 * @returns {Array} 最新队列
 */
export function upsertQueue(data) {
  const list = listQueue();
  const draftKey = String(data.draftKey || '');
  const index = draftKey ? list.findIndex((item) => item.draftKey === draftKey) : -1;
  const next = {
    id: index >= 0 ? list[index].id : `q${Date.now().toString(36)}`,
    draftKey,
    body: data.body,
    isDraft: Boolean(data.isDraft),
    title: String(data.title || ''),
    createdAt: index >= 0 ? list[index].createdAt : Date.now(),
    attempts: 0,
    error: '',
  };

  if (index >= 0) {
    list[index] = next;
  } else {
    list.push(next);
  }

  writeQueue(list);

  return listQueue();
}

/**
 * 记录一次重试失败，保留队列项等下次联网
 *
 * @param {string} id
 * @param {string} message
 */
export function failQueue(id, message) {
  const list = listQueue();
  const item = list.find((row) => row.id === id);

  if (item) {
    item.attempts = (item.attempts || 0) + 1;
    item.error = String(message || '');
    writeQueue(list);
  }

  return listQueue();
}

export function removeQueue(id) {
  const list = listQueue().filter((item) => item.id !== id);
  writeQueue(list);

  return list;
}

/**
 * 按草稿键移除：手动发布成功后，清掉同一篇的旧队列项，避免重复发送
 *
 * @param {string} draftKey
 */
export function removeQueueByDraftKey(draftKey) {
  const key = String(draftKey || '');

  if (!key) {
    return listQueue();
  }

  return removeQueue(listQueue().find((item) => item.draftKey === key)?.id || '');
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

/* ─── 片段库（本机常用模板：开头、声明、SEO 描述等） ─────────── */

const SNIPPET_KEY = 'sxlb.snippets';
const MAX_SNIPPETS = 50;

export function listSnippets() {
  const list = readJson(SNIPPET_KEY);

  return Array.isArray(list) ? list : [];
}

/**
 * 新增片段，最新的排在最前
 *
 * @param {{name?: string, text: string}} data
 * @returns {object | null} 内容为空时不保存
 */
export function addSnippet({ name, text }) {
  if (!String(text || '').trim()) {
    return null;
  }

  const snippet = {
    id: `s${Date.now().toString(36)}`,
    name: String(name || '').trim() || '未命名片段',
    text,
    at: Date.now(),
  };

  if (!safeSet(SNIPPET_KEY, JSON.stringify([snippet, ...listSnippets()].slice(0, MAX_SNIPPETS)))) {
    return null;
  }

  return snippet;
}

export function removeSnippet(id) {
  const next = listSnippets().filter((item) => item.id !== id);
  safeSet(SNIPPET_KEY, JSON.stringify(next));

  return next;
}

/* ─── 常用回复短语（评论回复用） ─────────────────────────────── */

const REPLY_KEY = 'sxlb.replies';
const MAX_REPLIES = 30;

export function listReplies() {
  const list = readJson(REPLY_KEY);

  return Array.isArray(list) ? list : [];
}

/**
 * 新增一条回复短语；内容为空或已存在时不保存
 *
 * @param {string} text
 * @returns {object | null}
 */
export function addReply(text) {
  const value = String(text || '').trim();

  if (!value) {
    return null;
  }

  const list = listReplies();

  // 同一句话只保留一条，避免重复堆叠
  if (list.some((item) => item.text === value)) {
    return null;
  }

  const reply = {
    id: `r${Date.now().toString(36)}`,
    text: value,
    at: Date.now(),
  };

  if (!safeSet(REPLY_KEY, JSON.stringify([reply, ...list].slice(0, MAX_REPLIES)))) {
    return null;
  }

  return reply;
}

export function removeReply(id) {
  const next = listReplies().filter((item) => item.id !== id);
  safeSet(REPLY_KEY, JSON.stringify(next));

  return next;
}
