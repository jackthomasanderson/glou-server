import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { defaultLocale } from "../lib/i18n/locales";

const sansFont = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Glou cellar",
	description: "Contextual bottle CRUD with optimistic UI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang={defaultLocale} className={sansFont.variable}>
			<body>
				<Providers initialLocale={defaultLocale}>{children}</Providers>
			</body>
		</html>
	);
}
