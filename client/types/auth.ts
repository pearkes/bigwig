export type AuthStatus = "loading" | "unpaired" | "authenticated";

export type PairingClaim = {
	serverFingerprint: string;
	matchCode: string;
	pairingNonce: string;
	expiresAt: number;
};
