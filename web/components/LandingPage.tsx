"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LandingPage() {
	const { isAuthenticated, isLoading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (isAuthenticated && !isLoading) {
			router.push("/dashboard");
		}
	}, [isAuthenticated, isLoading, router]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
				<div className="text-slate-600 dark:text-slate-400">Loading...</div>
			</div>
		);
	}

	if (isAuthenticated) {
		return null; // Will redirect to dashboard
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
			<div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-slate-900 rounded-lg shadow-lg text-center">
				<h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
					Glou
				</h1>
				<p className="text-slate-600 dark:text-slate-400 mb-2">
					Contextual bottle cockpit
				</p>
				<p className="text-slate-500 dark:text-slate-500 mb-8 text-sm">
					Two-step entry with category essentials and optional depth
				</p>

				<div className="space-y-3">
					<Link
						href="/login"
						className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
					>
						Sign In
					</Link>
					<Link
						href="/register"
						className="block w-full py-3 px-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
					>
						Create Account
					</Link>
				</div>

				<p className="text-xs text-slate-500 dark:text-slate-500 mt-6">
					Demo • Password: min 12 characters • 2FA available after registration
				</p>
			</div>
		</div>
	);
}
