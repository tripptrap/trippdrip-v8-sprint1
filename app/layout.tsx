import "./styles/globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "TrippDrip",
  description: "Mass texting + campaign management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
        <div className="min-h-screen flex">
          <Sidebar />
          <main className="flex-1 flex flex-col">
            <Topbar />
            <div className="container py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
