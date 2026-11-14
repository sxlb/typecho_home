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
 */
function sameContent(a, b) {
  const fields = ['cid', 'title', 'text', 'tags', 'summary', 'thumb', 'reprint', 'slug', 'created'];

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
    safeSet(DRAFT_PREFIX + id, JSON.stringify(legacy));
  }

  localStorage.removeItem(`${DRAFT_PREFIX}new`);
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
