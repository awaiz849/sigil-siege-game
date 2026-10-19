// Friendly on-screen messages for things that go wrong (camera, WebGL, downloads, crashes, devices).
// Plain HTML on top of everything (styles in index.html), so they work even when WebGL or the game
// itself is broken. A "blocking" notice covers the screen; a "banner" is a small bar at the top.

export interface NoticeAction {
  label: string;
  onClick: () => void;
  /** The main button (gold); also triggered by Enter. */
  primary?: boolean;
}

export interface NoticeOptions {
  /** One notice per id: showing the same id again replaces it. */
  id: string;
  title?: string;
  body: string;
  /** Optional second line: what to do, in smaller text. */
  hint?: string;
  actions?: NoticeAction[];
  kind?: 'blocking' | 'banner';
}

const open = new Map<string, HTMLElement>();

export function showNotice(opts: NoticeOptions): void {
  hideNotice(opts.id);
  const kind = opts.kind ?? 'blocking';
  const el = document.createElement('div');
  el.className = kind === 'banner' ? 'notice-banner' : 'notice';
  el.setAttribute('role', kind === 'banner' ? 'status' : 'alertdialog');
  el.dataset.notice = opts.id;

  const box = document.createElement('div');
  box.className = 'notice-box';
  if (opts.title) {
    const h = document.createElement('h2');
    h.textContent = opts.title;
    box.append(h);
  }
  const p = document.createElement('p');
  p.textContent = opts.body;
  box.append(p);
  if (opts.hint) {
    const hint = document.createElement('p');
    hint.className = 'notice-hint';
    hint.textContent = opts.hint;
    box.append(hint);
  }
  const actions = opts.actions ?? [];
  if (actions.length > 0) {
    const row = document.createElement('div');
    row.className = 'notice-actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      if (a.primary) b.className = 'primary';
      b.addEventListener('click', a.onClick);
      row.append(b);
    }
    box.append(row);
  }
  if (kind === 'banner') {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notice-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => hideNotice(opts.id));
    box.append(close);
  }
  el.append(box);
  document.body.append(el);
  open.set(opts.id, el);
  // Keyboard: Enter = the primary action of the newest blocking notice.
  const primary = actions.find((a) => a.primary);
  if (kind === 'blocking' && primary) (el.querySelector('button.primary') as HTMLButtonElement | null)?.focus();
}

export function hideNotice(id: string): void {
  open.get(id)?.remove();
  open.delete(id);
}

export function isNoticeOpen(id: string): boolean {
  return open.has(id);
}

/** Reload button, used by most notices. */
export const reloadAction = (label = 'Reload'): NoticeAction => ({ label, primary: true, onClick: () => location.reload() });

/** Change the main text of an open notice in place (e.g. a download percentage). */
export function setNoticeText(id: string, text: string): void {
  const p = open.get(id)?.querySelector('.notice-box p');
  if (p) p.textContent = text;
}
