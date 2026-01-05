import { redirect } from "next/navigation";

export default function HomePage() {
	// BYPASS POUR FEAT-01 : redirection directe vers dashboard
	// sans vérification de session
	redirect("/dashboard");

	// Code original (désactivé) :
	// const cookieStore = await cookies();
	// const sessionToken = cookieStore.get("session_token")?.value;
	// if (!sessionToken) {
	//   redirect("/login");
	// }
	// redirect("/dashboard");
}
