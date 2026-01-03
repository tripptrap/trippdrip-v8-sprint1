import "./styles/globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Toaster } from "react-hot-toast";
import Script from "next/script";

export const metadata = {
  title: "HyveWyre - AI-Powered SMS Marketing Platform for Insurance & Real Estate Agents",
  description: "HyveWyre is an AI-powered SMS marketing and lead management platform built for insurance agents and real estate professionals. Automate conversations, manage leads, and boost conversions with smart messaging workflows.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HyveWyre",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo-premium.png" type="image/png" />
        {/* PWA Meta Tags - iOS requires these specific tags */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#14b8a6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HyveWyre" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="HyveWyre" />
      </head>
      <body>
        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-QWBCNNKC08"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-QWBCNNKC08', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
        {/* PWA Service Worker Registration */}
        <Script id="pwa-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(
                  function(registration) {
                    console.log('PWA: Service Worker registered', registration.scope);
                  },
                  function(err) {
                    console.log('PWA: Service Worker registration failed', err);
                  }
                );
              });
            }
          `}
        </Script>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#27272a',
              color: '#f4f4f5',
              border: '1px solid rgba(52, 211, 153, 0.2)',
            },
            success: {
              iconTheme: {
                primary: '#34d399',
                secondary: '#f4f4f5',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#f4f4f5',
              },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
