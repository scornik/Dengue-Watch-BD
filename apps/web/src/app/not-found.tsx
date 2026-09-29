import Link from "next/link";

// Fallback for paths outside any locale segment.
export default function RootNotFound() {
  return (
    <html lang="bn">
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>৪০৪ · Page not found</h1>
        <Link href="/">হোম · Home</Link>
      </body>
    </html>
  );
}
