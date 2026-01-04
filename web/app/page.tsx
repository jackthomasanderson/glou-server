import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function HomePage() {
	const cookieStore = cookies();
	const sessionToken = cookieStore.get("session_token")?.value;

	if (!sessionToken) {
		redirect("/login");
	}

	redirect("/dashboard");
}
