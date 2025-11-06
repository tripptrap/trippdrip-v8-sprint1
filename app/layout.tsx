import "./styles/globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "HyveWyre™",
  description: "Mass texting + campaign management",
  icons: {
    icon: '/icon.png',
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
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const points = localStorage.getItem('userPoints');
                if (points) {
                  const data = JSON.parse(points);
                  if (data.planType === 'professional' || data.planType === 'premium') {
                    document.documentElement.style.setProperty('--accent', '#a855f7');
                    document.documentElement.style.setProperty('--accent-hover', '#9333ea');
                  }
                }
              } catch (e) {}
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
