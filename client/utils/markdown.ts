export const isMarkdown = (text: string): boolean => {
	if (!text) return false;
	const patterns = [
		/^#{1,6}\s/m,
		/\*\*[^*]+\*\*/,
		/\*[^*]+\*/,
		/`[^`]+`/,
		/```[\s\S]*```/,
		/^\s*[-*+]\s/m,
		/^\s*\d+\.\s/m,
		/\[.+\]\(.+\)/,
		/^\s*>/m,
		/\|.+\|/,
	];
	return patterns.some((p) => p.test(text));
};
