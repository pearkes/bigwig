export async function runCommand(
	command: string[],
	cwd?: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
	const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { ok: exitCode === 0, stdout, stderr };
}
