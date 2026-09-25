'use client';

// Server-renders every <style jsx> block into the page's HTML. Without this
// (App Router needs it; the Pages Router did it automatically), a styled-jsx
// component's elements arrived from the server with their jsx-* class names
// but none of their CSS, so on every full page load (e.g. opening a profile
// from the favorites drawer) the career timeline and stats area showed as
// raw, unstyled text until the page's JavaScript started and injected the
// styles. See https://nextjs.org/docs/app/guides/css-in-js#styled-jsx
import { useState, type ReactNode } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { StyleRegistry, createStyleRegistry } from 'styled-jsx';

export default function StyledJsxRegistry({ children }: { children: ReactNode }) {
  // Created once, lazily, so the registry survives re-renders.
  const [jsxStyleRegistry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles();
    jsxStyleRegistry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>;
}
