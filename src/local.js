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

export function readDraft(key) {
  return readJson(DRAFT_PREFIX + key);
}

/**
 * 写入草稿；正文与标题都为空时不落盘，避免产生空草稿
 *
 * @param {string} key cid 或本地草稿 id
 * @param {object} data
 */
export function writeDraft(key, data) {
  if (!key) {
    return;
  }

  if (!String(data.text || '').trim() && !String(data.title || '').trim()) {
    localStorage.removeItem(DRAFT_PREFIX + key);
    return;
  }

  localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify({ ...data, updatedAt: Date.now() }));
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
  localStorage.setItem(HISTORY_PREFIX + key, JSON.stringify(list.slice(0, MAX_HISTORY)));
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
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(legacy));
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

  localStorage.setItem(SNIPPET_KEY, JSON.stringify([snippet, ...listSnippets()].slice(0, MAX_SNIPPETS)));

  return snippet;
}

export function removeSnippet(id) {
  const next = listSnippets().filter((item) => item.id !== id);
  localStorage.setItem(SNIPPET_KEY, JSON.stringify(next));

  return next;
}
