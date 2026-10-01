'use client';

/**
 * Renders hospital-authored HTML in an isolated browsing context.
 *
 * This is the ONE place the sandbox attribute string is written — every
 * editor preview and the live subdomain page reuse it, so the actual
 * security control has a single source of truth instead of copies that can
 * quietly drift apart.
 *
 * Deliberately no `allow-same-origin`: the HTML here is written by a hospital
 * admin (or a superadmin on their behalf), not by us, and it shares a
 * subdomain with that hospital's own signed-in dashboard. Without this
 * isolation, a script in the pasted HTML could read the session token
 * `authStorage` keeps in localStorage for whoever is signed in on that
 * subdomain — `allow-same-origin` plus `allow-scripts` together would let it
 * do exactly that. `allow-top-navigation-by-user-activation` is what lets a
 * real click (e.g. a "Sign In" link to `/login`) still navigate the actual
 * tab, without letting the page silently redirect on load.
 */
export function SandboxedHtmlFrame({
  html,
  title = 'Hospital landing page',
  className,
}: {
  html: string;
  title?: string;
  className?: string;
}) {
  return (
    <iframe
      srcDoc={html}
      title={title}
      className={className}
      sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
      referrerPolicy="no-referrer"
    />
  );
}
