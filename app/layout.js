import "./globals.css";

export const metadata = {
  title: "IAFF / PSC 1001 — Intro to International Relations",
  description: "Classical Realism, Strategy & Analysis — with an AI Socratic tutor.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
