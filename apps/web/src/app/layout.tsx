import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeetPlus",
  description: "Управление ассортиментом для компьютерных клубов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <Suspense fallback={null}>
            <NavigationFeedback />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
