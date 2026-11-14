// Read-only browser regression. Open a bracket Stat Ledger (or Rules), then
// evaluate this script at mobile and desktop widths, for both home and visitor,
// in both themes. It checks rendered geometry and paint order independently of CSS.
(() => {
  const required = (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  };
  const footerElement = required('.yat-footer');
  const footer = footerElement.getBoundingClientRect();
  const art = required('.yat-unified-footer-art').getBoundingClientRect();
  const message = required('.yat-page-message-strip');
  const metadata = message.getBoundingClientRect();
  const expectedHeight = parseFloat(getComputedStyle(message).getPropertyValue('--yat-facts-h'));
  if (Math.abs(metadata.height - expectedHeight) > 1) {
    throw new Error(`Metadata height changed: ${metadata.height}, expected ${expectedHeight}`);
  }
  const boundary = footer.top;
  const light = document.body.classList.contains('light-theme');
  if (document.documentElement.classList.contains('light-theme') !== light) {
    throw new Error('Theme state differs between the page and its root');
  }
  const drawers = [...document.querySelectorAll('.yfp-drawer')];
  if (!drawers.length) throw new Error('Open a bracket drawer before running this check');
  const panels = drawers.map((drawer) => {
    const bounds = drawer.getBoundingClientRect();
    if (bounds.height <= 0 || bounds.right <= 0 || bounds.left >= innerWidth) {
      throw new Error('Drawer is not visible; wait for its entrance animation');
    }
    if (Math.abs(bounds.bottom - boundary) > 1) {
      throw new Error(`Drawer must meet footer without gap or overlap: ${bounds.bottom - boundary}px`);
    }
    const wrapper = drawer.closest('.yfp-drawer-wrap');
    if (art.top < footer.top && Number(getComputedStyle(footerElement).zIndex) <= Number(getComputedStyle(wrapper).zIndex)) {
      throw new Error('YaTi artwork must paint above the drawer');
    }
    const color = getComputedStyle(drawer).backgroundColor;
    const rgba = color.match(/[\d.]+/g)?.map(Number) || [];
    if (rgba.length < 3 || (rgba[3] ?? 1) !== 1) {
      throw new Error(`Drawer background must be opaque: ${color}`);
    }
    const brightness = (rgba[0] + rgba[1] + rgba[2]) / 3;
    if ((light && brightness < 200) || (!light && brightness > 70)) {
      throw new Error(`Drawer background does not follow ${light ? 'light' : 'dark'} theme: ${color}`);
    }
    const header = required('.yat-topbar').getBoundingClientRect();
    if (bounds.top < header.bottom - 1) throw new Error('Drawer overlaps the top bar');
    return { side: drawer.classList.contains('left') ? 'visitor' : 'home', bottom: bounds.bottom, background: color };
  });
  return { width: innerWidth, height: innerHeight, theme: light ? 'light' : 'dark', metadataHeight: metadata.height, boundary, panels };
})();
