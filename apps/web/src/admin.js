// /admin: review reports, flagged names and flagged scores; rename, clear, hide or approve.
// Needs the ADMIN_TOKEN secret (kept in this browser's sessionStorage only, never in the page).
const C = window.Chez;
const esc = C.ui.esc;
const KEY = 'chez:admin-token';
const tok = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };

async function call(method, path, body) {
  const res = await fetch('/api/admin' + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
  return data;
}
const when = (ts) => new Date(ts).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function pageAdmin() {
  return `<h1 class="page-title">Admin</h1>
    <form class="card stack" data-login>
      <div class="field"><label for="admTok">Admin token</label><input id="admTok" type="password" autocomplete="off" value=""></div>
      <button class="btn" type="submit">Open</button>
    </form>
    <div data-admin class="stack"></div>`;
}

export function afterAdmin() {
  const box = document.querySelector('[data-admin]');
  const form = document.querySelector('[data-login]');
  form.onsubmit = (e) => { e.preventDefault(); try { sessionStorage.setItem(KEY, document.getElementById('admTok').value.trim()); } catch (err) {} load(); };
  async function act(path, body, ok = 'Done') {
    try { await call('POST', path, body); C.ui.toast(ok); load(); } catch (e) { C.ui.toast('Failed: ' + e.message); }
  }
  async function load() {
    if (!tok()) return;
    box.innerHTML = '<p class="muted">Loading…</p>';
    let d;
    try { d = await call('GET', '/overview'); } catch (e) { box.innerHTML = `<p class="error">${esc(e.message === 'admin_only' ? 'Wrong token.' : e.message)}</p>`; return; }
    form.hidden = true;
    const rej = (d.rejections30d || []).map((r) => `${esc(r.tier || '?')}: ${r.n}`).join(' · ') || 'none';
    box.innerHTML = `
      <section class="card"><h2>Name rejections (30 days)</h2><p>${rej}</p></section>
      <section class="card"><h2>Open reports (${d.reports.length})</h2>
        <div class="rows">${d.reports.map((r) => `<div class="row"><span><b>${esc(r.handle || '(no name)')}</b><small>${esc(r.reason || '')} · ${when(r.created_at)} · ${r.open_count} open</small></span>
          <span class="hstack">
            <button class="btn alt small" data-p="${r.player_id}" data-a="clear_name">Clear name</button>
            <button class="btn alt small" data-p="${r.player_id}" data-a="hide">Hide player</button>
            <button class="btn alt small" data-r="${r.id}">Dismiss</button></span></div>`).join('') || '<p class="muted">None.</p>'}</div></section>
      <section class="card"><h2>Flagged names (${d.flaggedNames.length})</h2>
        <div class="rows">${d.flaggedNames.map((p) => `<div class="row"><span><b>${esc(p.handle)}</b><small>${when(p.created_at)}</small></span>
          <span class="hstack"><button class="btn alt small" data-p="${p.id}" data-a="approve">Approve</button>
          <button class="btn alt small" data-p="${p.id}" data-a="clear_name">Clear name</button>
          <button class="btn alt small" data-rename="${p.id}">Rename…</button></span></div>`).join('') || '<p class="muted">None.</p>'}</div></section>
      <section class="card"><h2>Flagged scores (${d.flaggedRuns.length})</h2>
        <p class="muted">Above the game's plausible maximum. Hidden from boards until approved.</p>
        <div class="rows">${d.flaggedRuns.map((r) => `<div class="row"><span><b>${esc(r.handle || '(no name)')}</b><small>${esc(r.game)} · ${esc(r.mode)} · ${when(r.finished_at)}</small></span>
          <span class="hstack"><b>${r.score}</b><button class="btn alt small" data-run="${r.id}" data-a="approve">Approve</button>
          <button class="btn alt small" data-run="${r.id}" data-a="hide">Hide</button></span></div>`).join('') || '<p class="muted">None.</p>'}</div></section>
      <section class="card"><h2>Hidden players (${d.hiddenPlayers.length})</h2>
        <div class="rows">${d.hiddenPlayers.map((p) => `<div class="row"><span>${esc(p.handle || p.id)}</span><button class="btn alt small" data-p="${p.id}" data-a="unhide">Unhide</button></div>`).join('') || '<p class="muted">None.</p>'}</div></section>
      <section class="card"><h2>Find a player</h2>
        <form class="hstack" data-find><input class="field-input" placeholder="name or id" style="flex:1;min-height:44px;border:3px solid var(--line);border-radius:12px;padding:0 10px"><button class="btn small" type="submit">Find</button></form>
        <div data-found></div></section>`;
    box.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.p) return act('/player', { id: b.dataset.p, action: b.dataset.a, resolveReports: true });
      if (b.dataset.r) return act('/report', { id: b.dataset.r });
      if (b.dataset.run) return act('/run', { id: b.dataset.run, action: b.dataset.a });
      if (b.dataset.rename) {
        const name = prompt('New name for this player (3 to 16 letters, numbers, _ or -):');
        if (name) act('/player', { id: b.dataset.rename, action: 'rename', name, resolveReports: true });
      }
    };
    box.querySelector('[data-find]').onsubmit = async (e) => {
      e.preventDefault();
      const q = e.target.querySelector('input').value.trim();
      const out = box.querySelector('[data-found]');
      try {
        const r = await call('GET', '/player/' + encodeURIComponent(q));
        out.innerHTML = `<p><b>${esc(r.player.handle || '(no name)')}</b> · ${esc(r.player.status)} · ${esc(r.player.id)}</p>
          <div class="hstack"><button class="btn alt small" data-p="${r.player.id}" data-a="hide">Hide player</button><button class="btn alt small" data-p="${r.player.id}" data-a="unhide">Unhide</button><button class="btn alt small" data-p="${r.player.id}" data-a="clear_name">Clear name</button></div>
          <div class="rows">${r.runs.map((x) => `<div class="row"><span>${esc(x.game)} · ${esc(x.mode)}<small>${when(x.finished_at)}${x.flagged ? ' · flagged' : ''}${x.hidden ? ' · hidden' : ''}</small></span>
            <span class="hstack"><b>${x.score}</b><button class="btn alt small" data-run="${x.id}" data-a="${x.hidden ? 'unhide' : 'hide'}">${x.hidden ? 'Unhide' : 'Hide'}</button></span></div>`).join('')}</div>`;
      } catch (err) { out.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    };
  }
  load();
}
