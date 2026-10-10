import "./globals.css";
import Link from "next/link";
import SessionWrapper from "../components/SessionWrapper";

export const metadata = { title: "Student Success Platform", description: "Student progress, early risk estimates and mentor-approved action plans for institutions." };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <SessionWrapper>
          <div className="flex-1">{children}</div>
          <footer className="border-t border-stone-300 mt-8 py-4 text-sm text-stone-600">
            <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-x-6 gap-y-1">
              <span>Student Success Platform</span>
              <Link className="underline" href="/privacy">Privacy policy</Link>
              <Link className="underline" href="/terms">Terms and conditions</Link>
            </div>
          </footer>
        </SessionWrapper>
      </body>
    </html>
  );
}
