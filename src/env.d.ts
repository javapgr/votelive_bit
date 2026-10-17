type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
	interface Locals extends Runtime {}
}

interface Env {
	ADMIN_KEY?: string;
	QR_SECRET?: string;
}

declare namespace Cloudflare {
	interface Env {
		ADMIN_KEY?: string;
		QR_SECRET?: string;
	}
}
