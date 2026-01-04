import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { defaultLocale } from "../lib/i18n/locales";

const displayFont = Playfair_Display({ subsets: ["latin"], variable: "--font-display" });
const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
	title: "Glou cellar",
	description: "Contextual bottle CRUD with optimistic UI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang={defaultLocale} className={`${displayFont.variable} ${bodyFont.variable}`}>
			<body>
				<Providers initialLocale={defaultLocale}>{children}</Providers>
			</body>
		</html>
	);
}
