import "./styles/globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "HyveWyre™",
  description: "Mass texting + campaign management",
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
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              async function updateFavicon() {
                try {
                  let faviconPath = '/logo-premium.png'; // Default for login/public pages

                  // Fetch plan type from API
                  try {
                    const response = await fetch('/api/user/plan');
                    const data = await response.json();

                    if (data.ok && data.planType) {
                      // Update favicon based on plan
                      if (data.planType === 'professional' || data.planType === 'premium') {
                        faviconPath = '/logo-premium.png';
                        document.documentElement.style.setProperty('--accent', '#a855f7');
                        document.documentElement.style.setProperty('--accent-hover', '#9333ea');
                      } else {
                        faviconPath = '/logo-basic.png';
                      }
                    }
                  } catch (apiError) {
                    console.log('User not logged in or API error:', apiError);
                  }

                  // Update favicon dynamically
                  const existingLink = document.querySelector("link[rel*='icon']");
                  if (existingLink) {
                    existingLink.href = faviconPath;
                  } else {
                    const link = document.createElement('link');
                    link.type = 'image/png';
                    link.rel = 'icon';
                    link.href = faviconPath;
                    document.getElementsByTagName('head')[0].appendChild(link);
                  }
                } catch (e) {
                  console.error('Favicon update error:', e);
                }
              }

              // Initial update
              updateFavicon();

              // Listen for plan changes
              window.addEventListener('planTypeChanged', updateFavicon);
            })();
          `
        }} />
      </head>
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              border: '1px solid rgba(255,255,255,0.1)',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#f9fafb',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#f9fafb',
              },
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
