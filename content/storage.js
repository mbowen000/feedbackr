/**
 * Storage manager for AI Feedback Loop.
 * Persists comments per site origin (or file:// path for local HTML decks/prototypes)
 * so pins survive page reloads and multi-screen navigation.
 */
(() => {
  if (window.AIFLStorage) return;

  function getSiteKey() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || window.location.protocol === 'file:') {
      // Group by directory or file path for local HTML files
      return `aifl_site_file_${window.location.pathname}`;
    }
    return `aifl_site_${origin}`;
  }

  function getRouteKey(href = window.location.href) {
    try {
      const u = new URL(href);
      if (u.protocol === 'file:') {
        return `${u.pathname.split('/').pop() || 'index.html'}${u.search}${u.hash}`;
      }
      return `${u.pathname}${u.search}${u.hash}` || '/';
    } catch {
      return window.location.pathname || '/';
    }
  }

  async function loadComments() {
    try {
      const key = getSiteKey();
      const result = await chrome.storage.local.get(key);
      return Array.isArray(result[key]) ? result[key] : [];
    } catch (err) {
      console.warn('AI Feedback Loop: Failed to load comments from storage.', err);
      return [];
    }
  }

  async function saveComments(comments) {
    try {
      const key = getSiteKey();
      await chrome.storage.local.set({ [key]: comments });
      return comments;
    } catch (err) {
      console.warn('AI Feedback Loop: Failed to save comments.', err);
      return comments;
    }
  }

  async function addComment(payload) {
    const comments = await loadComments();
    const maxNum = comments.reduce((max, c) => Math.max(max, Number(c.number) || 0), 0);
    const now = Date.now();

    const newComment = {
      id: `aifl_${now}_${Math.random().toString(36).slice(2, 8)}`,
      number: maxNum + 1,
      text: (payload.text || '').trim(),
      category: payload.category || 'general',
      createdAt: now,
      updatedAt: now,
      screen: payload.screen,
      target: payload.target
    };

    comments.push(newComment);
    await saveComments(comments);
    return { comment: newComment, comments };
  }

  async function updateComment(id, patch) {
    const comments = await loadComments();
    const idx = comments.findIndex((c) => c.id === id);
    if (idx === -1) return { comment: null, comments };

    comments[idx] = {
      ...comments[idx],
      ...patch,
      updatedAt: Date.now()
    };
    await saveComments(comments);
    return { comment: comments[idx], comments };
  }

  async function deleteComment(id) {
    const comments = await loadComments();
    const filtered = comments
      .filter((c) => c.id !== id)
      .map((c, index) => ({ ...c, number: index + 1 }));
    await saveComments(filtered);
    return filtered;
  }

  async function clearComments(scope = 'all', currentRouteKey = null) {
    if (scope === 'screen' && currentRouteKey) {
      const comments = await loadComments();
      const remaining = comments
        .filter((c) => c.screen?.routeKey !== currentRouteKey)
        .map((c, index) => ({ ...c, number: index + 1 }));
      await saveComments(remaining);
      return remaining;
    }
    const key = getSiteKey();
    await chrome.storage.local.remove(key);
    return [];
  }

  window.AIFLStorage = {
    getSiteKey,
    getRouteKey,
    loadComments,
    saveComments,
    addComment,
    updateComment,
    deleteComment,
    clearComments
  };
})();

