import { describe, expect, test } from "bun:test";
import { __test__ } from "../../../src/worker/index";

describe("worker ed25519", () => {
	test("getEd25519 configures sha512 so keygen works", async () => {
		const { getPublicKey } = await __test__.getEd25519();
		const privateKey = crypto.getRandomValues(new Uint8Array(32));
		const publicKey = await getPublicKey(privateKey);
		expect(publicKey).toBeInstanceOf(Uint8Array);
		expect(publicKey.length).toBe(32);
	});
});
