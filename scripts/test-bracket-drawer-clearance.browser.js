// Read-only browser regression. Open a bracket Stat Ledger (or Rules), then
// evaluate this script at mobile and desktop widths, for both home and visitor.
// It checks rendered geometry, independently of the CSS implementation.
(() => {
  const required = (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
  };
  const footer = required('.yat-footer').getBoundingClientRect();
  const art = required('.yat-unified-footer-art').getBoundingClientRect();
  const message = required('.yat-page-message-strip');
  const metadata = message.getBoundingClientRect();
  const expectedHeight = parseFloat(getComputedStyle(message).getPropertyValue('--yat-facts-h'));
  if (Math.abs(metadata.height - expectedHeight) > 1) {
    throw new Error(`Metadata height changed: ${metadata.height}, expected ${expectedHeight}`);
  }
  const boundary = Math.min(footer.top, art.top, metadata.top);
  const drawers = [...document.querySelectorAll('.yfp-drawer')];
  if (!drawers.length) throw new Error('Open a bracket drawer before running this check');
  const panels = drawers.map((drawer) => {
    const bounds = drawer.getBoundingClientRect();
    if (bounds.height <= 0 || bounds.right <= 0 || bounds.left >= innerWidth) {
      throw new Error('Drawer is not visible; wait for its entrance animation');
    }
    if (bounds.bottom > boundary + 1) {
      throw new Error(`Drawer overlaps footer/YaTi by ${bounds.bottom - boundary}px`);
    }
    const header = required('.yat-topbar').getBoundingClientRect();
    if (bounds.top < header.bottom - 1) throw new Error('Drawer overlaps the top bar');
    return { side: drawer.classList.contains('left') ? 'visitor' : 'home', bottom: bounds.bottom };
  });
  return { width: innerWidth, height: innerHeight, metadataHeight: metadata.height, boundary, panels };
})();
