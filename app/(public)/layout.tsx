// Dark mode for the public pages (#134).
//
// Tailwind is on the `class` strategy (`darkMode: 'class'`), so a `dark:` variant
// only applies when `<html>` carries the `dark` class. lib/ThemeContext sets it —
// but ThemeProvider is mounted only in the dashboard layout, and it reads a saved
// preference from localStorage and the user's DB settings.
//
// A public visitor has neither. So every `dark:` class across the legal and
// compliance pages was inert, and they rendered fully light no matter the OS
// setting while reading in source as though dark mode were supported.
//
// ── Which pages, and why not all of them ────────────────────────────────────
//
// Measured rather than assumed — `dark:` classes vs total classNames per page:
//
//   compliance  50/74     privacy  20/34     terms  30/49     refund  24/36
//   team/*      32/78, 27/58        error    7/9
//   opt-in       0/52     opt-in/[slug]  0/11
//   preview      2/594
//
// The first group is written for dark and renders correctly in it — verified in a
// browser, not inferred. The last two are not: enabling dark on `/preview` turned
// 32 headings into near-black text on a near-black background, because 174 of its
// light-text classes have no dark counterpart. That is a design pass on the
// primary marketing surface, not a missing class, and it is not something to do
// silently — so the landing page and the opt-in proof page stay light.
//
// `/opt-in` staying light is a small bonus: it is the consent evidence carriers
// screenshot during verification, and a stable appearance there is worth more
// than theme support.
//
// ── Why a raw <script> and not next/script or an effect ─────────────────────
//
// This must run BEFORE first paint or the page flashes light and then switches,
// which is worse than not supporting dark mode at all. `next/script` defers, and
// a useEffect runs after hydration. An inline script executes where it is parsed.
//
// ── Why here and not the root layout ────────────────────────────────────────
//
// The root layout wraps the dashboard too. Applying prefers-color-scheme there
// would change what a logged-in user with no saved theme sees — currently light,
// a deliberate default rather than an accident.
const LIGHT_ONLY = ['/preview', '/opt-in'];

const THEME_INIT = `(function(){try{
  var p = location.pathname.replace(/\\/+$/, '') || '/';
  var lightOnly = ${JSON.stringify(LIGHT_ONLY)}.some(function(r){ return p === r || p.indexOf(r + '/') === 0; });
  if (lightOnly) { document.documentElement.classList.remove('dark'); return; }
  var saved = localStorage.getItem('theme');
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
}catch(e){}})();`;

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      {children}
    </div>
  )
}
