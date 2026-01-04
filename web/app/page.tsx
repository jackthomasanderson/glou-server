import Link from "next/link";

export const metadata = {
	title: "Glou - Contextual Bottle Cockpit",
};

export default function HomePage() {
	return (
		<div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
			<div className="w-full max-w-lg mx-auto px-4">
				{/* Header Card */}
				<div className="mb-8 text-center">
					<div className="inline-block mb-4">
						<div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-red-500 flex items-center justify-center shadow-2xl">
							<span className="text-2xl font-black text-white">G</span>
						</div>
					</div>
					<h1 className="text-5xl font-black text-white mb-3 tracking-tight">
						Glou
					</h1>
					<p className="text-lg text-amber-100 mb-2 font-medium">
						Contextual Bottle Cockpit
					</p>
					<p className="text-sm text-slate-300">
						Smart management for luxury assets
					</p>
				</div>

				{/* Main Card */}
				<div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl mb-6">
					<div className="space-y-4">
						<p className="text-slate-300 text-center text-sm leading-relaxed">
							Two-step entry with category essentials and optional depth. Manage your wine, spirits, and cigars collection with precision.
						</p>

						{/* Action Buttons */}
						<div className="space-y-3 pt-4">
							<Link
								href="/login"
								className="block w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 hover:shadow-lg text-center"
							>
								Sign In
							</Link>
							<Link
								href="/register"
								className="block w-full py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 hover:shadow-lg border border-slate-600 text-center"
							>
								Create Account
							</Link>
						</div>
					</div>
				</div>

				{/* Footer Info */}
				<div className="text-center space-y-2">
					<p className="text-xs text-slate-400">
						<span className="text-amber-400">•</span> Password: minimum 12 characters
					</p>
					<p className="text-xs text-slate-400">
						<span className="text-amber-400">•</span> 2FA available after registration
					</p>
					<p className="text-xs text-slate-500 mt-4">
						Version 1.0.0 • FEAT-02 Implementation
					</p>
				</div>
			</div>
		</div>
	);
}
