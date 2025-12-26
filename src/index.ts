import {
	printServerUsage,
	SERVER_HELP,
	startServer,
	unpairServer,
} from "./server/index";
import { runToolCli } from "./tools/registry";
import { printWorkerUsage, startWorker, WORKER_HELP } from "./worker/index";

declare const BUILD_ROLE: string | undefined;

const MAIN_HELP = [
	"Usage: bigwig <command> [args]",
	"",
	"Commands:",
	"  server             Start the web server",
	"  worker             Start the worker",
	"  tool <name>        Run a tool",
	"",
	"Help:",
	"  --help, -h         Show this help",
	"  tool --help        List available tools",
	"",
	"Details:",
	...SERVER_HELP.split("\n").map((line) => `  ${line}`),
	"",
	...WORKER_HELP.split("\n").map((line) => `  ${line}`),
].join("\n");

function printUsage(): void {
	console.log(MAIN_HELP);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const buildRole = typeof BUILD_ROLE !== "undefined" ? BUILD_ROLE : "";
	if (args[0] === "tool") {
		try {
			const exitCode = await runToolCli(args.slice(1));
			process.exit(exitCode);
		} catch (err) {
			console.error(`Tool error: ${err}`);
			process.exit(1);
		}
	}
	const wantsHelp = args.includes("--help") || args.includes("-h");

	if (wantsHelp) {
		if (buildRole === "server" || args[0] === "server") {
			printServerUsage();
			return;
		}
		if (buildRole === "worker" || args[0] === "worker") {
			printWorkerUsage();
			return;
		}
		printUsage();
		return;
	}

	if (buildRole === "server") {
		if (args[0] === "unpair") {
			unpairServer();
			return;
		}
		startServer(args);
		return;
	}
	if (buildRole === "worker") {
		void startWorker(args);
		return;
	}
	if (args[0] === "server") {
		if (args[1] === "unpair") {
			unpairServer();
			return;
		}
		startServer(args.slice(1));
		return;
	}
	if (args[0] === "worker") {
		void startWorker(args.slice(1));
		return;
	}
	if (args[0] === "tool") {
		try {
			const exitCode = await runToolCli(args.slice(1));
			process.exit(exitCode);
		} catch (err) {
			console.error(`Tool error: ${err}`);
			process.exit(1);
		}
	}

	printUsage();
	process.exit(1);
}

void main();
