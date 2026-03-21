import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDF Tools - All-in-one PDF Utility | 100% Free & Secure",
  description:
    "Free online PDF tools: Merge, Split, Compress, Invert, Grayscale, Reorder, Rotate, Protect, Sign, and more. 100% local processing in your browser — your files never leave your device.",
  keywords: [
    "PDF Tools",
    "Merge PDF",
    "Split PDF",
    "Compress PDF",
    "PDF Editor",
    "Secure PDF",
    "PDF to Image",
    "Convert PDF",
    "Free PDF Tools",
    "Local PDF Processing",
  ],
  authors: [{ name: "Arun Gupta" }],
  openGraph: {
    title: "PDF Tools - All-in-one PDF Utility",
    description: "100% Secure & Local PDF tools in your browser.",
    url: "https://arungupta1526.github.io/pdf-tools/",
    siteName: "PDF Tools",
    images: [
      {
        url: "/icon.png",
        width: 1024,
        height: 1024,
        alt: "PDF Tools Icon",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF Tools - All-in-one PDF Utility",
    description: "100% Secure & Local PDF tools in your browser.",
    images: ["/icon.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
