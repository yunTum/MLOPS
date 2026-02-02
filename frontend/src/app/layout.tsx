import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { TaskProgress } from "@/components/layout/TaskProgress";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MLOps Platform",
  description: "Advanced MLOps Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
          <TaskProgress />
        </div>
      </body>
    </html>
  );
}
