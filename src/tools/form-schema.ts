/**
 * Form Schema DSL - A JSON-Schema-flavored form specification for AI-generated forms.
 */

export const SUPPORTED_FIELD_TYPES = [
	"string",
	"number",
	"boolean",
	"select",
	"multiselect",
	"date",
	"time",
	"datetime",
	"phone",
	"email",
	"url",
	"textarea",
	"password",
	"credit-card",
] as const;

export type FieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

export const SUPPORTED_FORMATS = [
	"email",
	"uri",
	"phone",
	"postal-code",
	"country",
	"currency",
] as const;

export type FieldFormat = (typeof SUPPORTED_FORMATS)[number];

export const SUPPORTED_AUTOCOMPLETE = [
	"name",
	"given-name",
	"family-name",
	"honorific-prefix",
	"email",
	"tel",
	"url",
	"street-address",
	"address-line1",
	"address-line2",
	"city",
	"region",
	"postal-code",
	"country",
	"country-name",
	"cc-name",
	"cc-number",
	"cc-exp",
	"cc-exp-month",
	"cc-exp-year",
	"cc-csc",
	"cc-type",
	"username",
	"current-password",
	"new-password",
	"one-time-code",
] as const;

export type AutocompleteHint = (typeof SUPPORTED_AUTOCOMPLETE)[number];

export interface BaseField {
	id: string;
	label: string;
	type: FieldType;
	required?: boolean;
	placeholder?: string;
	helpText?: string;
	defaultValue?: string | number | boolean | string[];
	autocomplete?: AutocompleteHint;
	showIf?: {
		fieldId: string;
		equals: string | number | boolean;
	};
	ui?: {
		width?: "full" | "half" | "third";
		section?: string;
		order?: number;
	};
}

export interface StringField extends BaseField {
	type: "string" | "textarea" | "password";
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	format?: FieldFormat;
}

export interface NumberField extends BaseField {
	type: "number";
	minimum?: number;
	maximum?: number;
	step?: number;
}

export interface BooleanField extends BaseField {
	type: "boolean";
}

export interface SelectField extends BaseField {
	type: "select" | "multiselect";
	options: Array<{ value: string; label: string }>;
}

export interface DateTimeField extends BaseField {
	type: "date" | "time" | "datetime";
	minDate?: string;
	maxDate?: string;
}

export interface ContactField extends BaseField {
	type: "phone" | "email" | "url";
}

export interface CreditCardField extends BaseField {
	type: "credit-card";
	collectName?: boolean;
}

export type FormField =
	| StringField
	| NumberField
	| BooleanField
	| SelectField
	| DateTimeField
	| ContactField
	| CreditCardField;

export interface FormSchema {
	version: 1;
	id: string;
	title?: string;
	description?: string;
	submitLabel?: string;
	cancelLabel?: string;
	fields: FormField[];
}

export interface FormResponse {
	formId: string;
	values: Record<
		string,
		string | number | boolean | string[] | CreditCardValue
	>;
	cancelled?: boolean;
	reason?: string;
}

export interface CreditCardValue {
	number: string;
	expMonth: string;
	expYear: string;
	cvc: string;
	name?: string;
}

export interface FormValidationResult {
	valid: boolean;
	normalized: FormSchema;
	errors: string[];
	warnings: string[];
}
