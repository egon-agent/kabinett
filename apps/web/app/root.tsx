import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/root";
import "./fonts.css";
import "./app.css";
import { useFavorites } from "./lib/favorites";
import { ensureRequestContext } from "./lib/request-context.server";
import { getOgLocale, resolveUiLocale, uiText, useUiLocale } from "./lib/ui-language";

export function headers() {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
}

export function loader({ request }: Route.LoaderArgs) {
  const campaign = ensureRequestContext(request);
  const uiLocale = resolveUiLocale(campaign.id);
  return {
    campaignId: campaign.id,
    uiLocale,
  };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://nationalmuseumse.iiifhosting.com" },
  { rel: "preconnect", href: "https://ems.dimu.org" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const uiLocale = useUiLocale();

  return (
    <html lang={uiLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#FFFFFF" />
        <meta property="og:locale" content={getOgLocale(uiLocale)} />
        <meta property="og:site_name" content="Kabinett" />
        <meta name="robots" content="index,follow" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
window.addEventListener('error',function(event){
  var target=event&&event.target;
  if(target&&target.tagName==='IMG'){
    target.classList.add('is-broken');
  }
},true);
`}} />
        <Meta />
        <Links />
        {/* Cloudflare Web Analytics */}
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"f5cecb07f7fc4aaa97824680349461e0"}'
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes loading-bar {
            0% { width: 0%; margin-left: 0; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}} />
      </head>
      <body className="bg-white text-primary font-sans antialiased m-0">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-white focus:text-primary focus:px-4 focus:py-2 focus-ring"
        >
          {uiText(uiLocale, "Hoppa till innehåll", "Skip to content")}
        </a>
        <Header />
        <main id="main-content" className="app-main pb-[4.5rem] lg:pb-0">{children}</main>
        <BottomNav />
        <ScrollRestoration />
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: `
window.__toast=function(msg){
  var d=document.createElement('div');
  d.textContent=msg;
  d.className='app-toast';
  document.body.appendChild(d);
  requestAnimationFrame(function(){d.classList.add('app-toast--visible')});
  setTimeout(function(){d.classList.remove('app-toast--visible');setTimeout(function(){d.remove()},300)},2000);
};
`}} />
      </body>
    </html>
  );
}

function useIsLightPage() {
  return true;
}

function NavLink({
  href,
  label,
  path,
  isDark,
}: {
  href: string;
  label: string;
  path: string;
  isDark: boolean;
}) {
  const isActive = path === href || (href !== "/" && path.startsWith(href));
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "no-underline transition-colors focus-ring relative pb-0.5 px-1 py-1",
        isDark
          ? "hover:text-dark-primary"
          : "hover:text-primary",
        isActive
          ? isDark
            ? "text-accent font-medium"
            : "text-accent font-medium"
          : isDark
            ? "text-dark-secondary"
            : "text-secondary",
      ].join(" ")}
    >
      {label}
      {isActive && (
        <span className="absolute left-0 right-0 -bottom-[0.2rem] h-[2px] bg-accent" />
      )}
    </a>
  );
}

function Header() {
  const location = useLocation();
  const path = location.pathname;
  const isHome = path === "/";
  const isLight = useIsLightPage();
  const isDark = !isLight;
  const uiLocale = useUiLocale();
  const showSchool = uiLocale !== "en";
  const navItems = [
    { href: "/discover", label: uiText(uiLocale, "Upptäck", "Discover") },
    { href: "/search?type=visual&focus=1", label: uiText(uiLocale, "Sök", "Search") },
    ...(showSchool ? [{ href: "/skola", label: uiText(uiLocale, "Skola", "School") }] : []),
    { href: "/favorites", label: uiText(uiLocale, "Sparade", "Favorites") },
    { href: "/om", label: uiText(uiLocale, "Om", "About") },
  ];

  return (
    <header
      className={[
        "fixed top-0 left-0 right-0 z-[60] border-b",
        isDark
          ? "bg-dark-bg border-dark-rule"
          : "bg-white border-rule",
      ].join(" ")}
    >
      <nav
        aria-label={uiText(uiLocale, "Huvudnavigering", "Main navigation")}
        className="flex items-center justify-between px-4 md:px-6 lg:px-10 h-[3.5rem]"
      >
        <a
          href="/"
          aria-current={path === "/" ? "page" : undefined}
          className={[
            "text-[13px] tracking-[0.12em] uppercase no-underline focus-ring font-normal",
            isDark ? "text-dark-primary" : "text-primary",
            isHome ? "invisible" : "",
          ].join(" ")}
        >
          KABINETT
        </a>
        <div
          className={[
            "hidden lg:flex items-center gap-6 text-[13px] tracking-[0.015em]",
          ].join(" ")}
        >
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} path={path} isDark={isDark} />
          ))}
        </div>
      </nav>
    </header>
  );
}

function BottomNav() {
  const { count } = useFavorites();
  const path = useLocation().pathname;

  const isLight = useIsLightPage();
  const isDark = !isLight;
  const uiLocale = useUiLocale();

  const tabs: Array<{
    href: string;
    label: string;
    active: boolean;
    badge?: number;
    icon: (color: string) => React.ReactNode;
  }> = [
    {
      href: "/",
      label: uiText(uiLocale, "Hem", "Home"),
      active: path === "/",
      icon: (color: string) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      href: "/discover",
      label: uiText(uiLocale, "Upptäck", "Discover"),
      active: path === "/discover",
      icon: (color: string) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={color} opacity="0.15" stroke={color} />
        </svg>
      ),
    },
    {
      href: "/search?type=visual&focus=1",
      label: uiText(uiLocale, "Sök", "Search"),
      active: path === "/search",
      icon: (color: string) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      ),
    },
    ...(uiLocale === "en"
      ? []
      : [{
        href: "/skola",
        label: uiText(uiLocale, "Skola", "School"),
        active: path === "/skola" || path.startsWith("/skola/"),
        icon: (color: string) => (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
            <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 18 6.5v11A1.5 1.5 0 0 1 16.5 19h-12A1.5 1.5 0 0 1 3 17.5v-11z" />
            <path d="M18 7.5h2a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-11" />
            <path d="M6.5 9.5h8" />
            <path d="M6.5 12.5h8" />
          </svg>
        ),
      }]),
    {
      href: "/favorites",
      label: uiText(uiLocale, "Sparade", "Favorites"),
      active: path === "/favorites",
      badge: count,
      icon: (color: string) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
          <path d="M20.8 5.6c-1.4-1.6-3.9-1.6-5.3 0L12 9.1 8.5 5.6c-1.4-1.6-3.9-1.6-5.3 0-1.6 1.8-1.4 4.6.2 6.2L12 21l8.6-9.2c1.6-1.6 1.8-4.4.2-6.2z" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      aria-label={uiText(uiLocale, "Snabbnavigering", "Quick navigation")}
      className={[
        "fixed bottom-0 left-0 right-0 z-[60] pb-[env(safe-area-inset-bottom)] border-t lg:hidden",
        isDark
          ? "bg-dark-bg border-dark-rule"
          : "bg-white border-rule",
      ].join(" ")}
    >
      <div
        className="flex justify-around items-center h-[3.5rem] max-w-[32rem] mx-auto"
      >
        {tabs.map((tab) => {
          const color = tab.active
            ? "var(--color-accent)"
            : (isDark ? "var(--color-dark-secondary)" : "var(--color-secondary)");
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              aria-label={tab.label}
              className="flex flex-col items-center no-underline relative py-1 px-2 focus-ring"
            >
              {tab.icon(color)}
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute top-0 right-[0.15rem] w-[6px] h-[6px] rounded-[50%] bg-accent" />
              ) : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <>
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-[2px]">
          <div
            className="h-full bg-accent animate-[loading-bar_1.5s_ease-in-out_infinite]"
          />
        </div>
      )}
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const uiLocale = useUiLocale();
  let message = uiText(uiLocale, "Något gick fel", "Something went wrong");
  let details = uiText(uiLocale, "Ett oväntat fel uppstod. Ladda om sidan och försök igen.", "An unexpected error occurred. Reload the page and try again.");
  let stack = "";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      message = uiText(uiLocale, "Sidan hittades inte", "Page not found");
      details = uiText(uiLocale, "Sidan du söker finns inte eller har flyttats.", "The page you're looking for doesn't exist or has moved.");
    } else {
      message = uiText(uiLocale, "Sidan kunde inte visas", "This page could not be shown");
      details = import.meta.env.DEV ? (error.statusText || details) : uiText(uiLocale, "Vi kunde inte visa sidan just nu.", "We could not show this page right now.");
    }
  } else if (error instanceof Error) {
    if (import.meta.env.DEV) {
      details = error.message;
    }
    stack = error.stack || "";
  }

  const showStack = import.meta.env.DEV;

  return (
    <div className="py-[4rem] px-5 min-h-screen flex items-center justify-center">
      <div className="max-w-md">
        <h1 className="text-[2rem] md:text-[2.4rem] text-primary">{message}</h1>
        <p className="mt-4 text-secondary leading-[1.55] text-[15px]">{details}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-primary text-white text-[13px] border-none cursor-pointer hover:bg-black transition-colors focus-ring"
          >
            {uiText(uiLocale, "Försök igen", "Try again")}
          </button>
          <a
            href="/"
            className="px-5 py-2.5 border border-rule text-primary text-[13px] no-underline hover:bg-paper transition-colors focus-ring"
          >
            {uiText(uiLocale, "Till startsidan", "Go to homepage")}
          </a>
        </div>
      </div>
      {showStack && stack && (
        <pre className="mt-4 text-[0.65rem] text-[#999] text-left max-w-[90vw] overflow-auto whitespace-pre-wrap">
          {stack}
        </pre>
      )}
    </div>
  );
}
