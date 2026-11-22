// News is read fresh only when a fan opens its panel or returns to the
// visible page. No timers, hidden-tab polling or server/crawler reads.
export function watchVisibleNews(
  panel: HTMLElement,
  activeClass: string,
  onChange: (visible: boolean) => void,
): () => void {
  let visible = false;
  const isVisible = () => document.visibilityState !== 'hidden' && panel.classList.contains(activeClass);
  const check = () => {
    const next = isVisible();
    if (next === visible) return;
    visible = next;
    onChange(next);
  };
  const focus = () => {
    if (!isVisible()) return;
    visible = true;
    onChange(true);
  };
  const observer = new MutationObserver(check);
  observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', focus);
  check();
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', focus);
  };
}
