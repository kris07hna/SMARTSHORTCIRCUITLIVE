import "./globals.css";

export const metadata = {
  title: "OPTOSAFE-AN | IOT BASED SHORT CIRCUIT PROTECTION SYSTEM WIHT LIVE MONITORING",
  description: "OPTOSAFE-AN is a live short-circuit protection and monitoring dashboard powered by Firebase and Next.js.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
