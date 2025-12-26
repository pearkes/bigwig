import type { TextInputProps } from "react-native";
import type { AutocompleteHint, FormField } from "../types/forms";

export function getTextContentType(
	autocomplete?: AutocompleteHint,
): TextInputProps["textContentType"] {
	if (!autocomplete) return undefined;

	const mapping: Record<string, string> = {
		name: "name",
		"given-name": "givenName",
		"family-name": "familyName",
		email: "emailAddress",
		tel: "telephoneNumber",
		url: "URL",
		"street-address": "streetAddressLine1",
		"address-line1": "streetAddressLine1",
		"address-line2": "streetAddressLine2",
		city: "addressCity",
		region: "addressState",
		"postal-code": "postalCode",
		country: "countryName",
		"country-name": "countryName",
		"cc-name": "creditCardName",
		"cc-number": "creditCardNumber",
		"cc-exp": "creditCardExpiration",
		"cc-exp-month": "creditCardExpirationMonth",
		"cc-exp-year": "creditCardExpirationYear",
		"cc-csc": "creditCardSecurityCode",
		username: "username",
		"current-password": "password",
		"new-password": "newPassword",
		"one-time-code": "oneTimeCode",
	};

	return mapping[autocomplete];
}

export function getAutoCompleteType(
	autocomplete?: AutocompleteHint,
): TextInputProps["autoComplete"] {
	if (!autocomplete) return undefined;

	// Platform autoComplete values
	const mapping: Record<string, string> = {
		name: "name",
		"given-name": "name-given",
		"family-name": "name-family",
		"honorific-prefix": "name-prefix",
		email: "email",
		tel: "tel",
		url: "url",
		"street-address": "street-address",
		"address-line1": "address-line1",
		"address-line2": "address-line2",
		city: "address-level2",
		region: "address-level1",
		"postal-code": "postal-code",
		country: "country",
		"cc-name": "cc-name",
		"cc-number": "cc-number",
		"cc-exp": "cc-exp",
		"cc-exp-month": "cc-exp-month",
		"cc-exp-year": "cc-exp-year",
		"cc-csc": "cc-csc",
		username: "username",
		"current-password": "password",
		"new-password": "password-new",
		"one-time-code": "sms-otp",
	};

	return mapping[autocomplete];
}

export function getKeyboardType(
	field: FormField,
): TextInputProps["keyboardType"] {
	switch (field.type) {
		case "number":
			return "numeric";
		case "phone":
			return "phone-pad";
		case "email":
			return "email-address";
		case "url":
			return "url";
		default:
			return "default";
	}
}
