import { expandHome, readJsonFile, writeJsonFile } from "../shared/utils";

export type WorkerCredentials = {
	server_url: string;
	worker_id: string;
	credential: string;
	public_key: string;
	private_key: string;
};

const CREDS_PATH = expandHome("~/.bigwig/worker.json");

export async function loadWorkerCredentials(): Promise<WorkerCredentials | null> {
	const data = await readJsonFile<WorkerCredentials | null>(CREDS_PATH, null);
	return data;
}

export async function saveWorkerCredentials(
	creds: WorkerCredentials,
): Promise<void> {
	await writeJsonFile(CREDS_PATH, creds);
}
