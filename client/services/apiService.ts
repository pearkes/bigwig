import { MAX_RETRIES, RECONNECT_DELAYS } from "../constants/timeouts";

export type AuthFetchContext = {
	getSession: () => Promise<string | null>;
};

type FetchWithAuthParams = {
	url: string;
	context: AuthFetchContext;
	options?: RequestInit;
	retries?: number;
};

export const fetchWithAuth = async ({
	url,
	context,
	options = {},
	retries = MAX_RETRIES,
}: FetchWithAuthParams): Promise<Response> => {
	const session = await context.getSession();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string>),
	};
	if (session) {
		headers.Authorization = `Bearer ${session}`;
	}

	let lastError: Error | null = null;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			const response = await fetch(url, { ...options, headers });
			return response;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			lastError = error;
			console.warn(`[fetch] Attempt ${attempt + 1} failed:`, error.message);
			if (attempt < retries - 1) {
				const delay = RECONNECT_DELAYS[attempt] || 1000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
	throw lastError || new Error("Request failed");
};

export const safeJson = async (response: Response): Promise<unknown | null> => {
	const contentType = response.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}
	try {
		return await response.json();
	} catch {
		return null;
	}
};

export const fetchWorkersStatus = async (
	serverUrl: string,
	context: AuthFetchContext,
) => {
	const response = await fetchWithAuth({
		url: `${serverUrl}/workers`,
		context,
		retries: 1,
	});
	let data: unknown = null;
	try {
		data = await safeJson(response);
	} catch {
		data = null;
	}
	return { ok: response.ok, status: response.status, data };
};
