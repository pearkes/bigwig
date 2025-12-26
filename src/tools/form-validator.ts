/**
 * Form Schema Validator and Normalizer
 */

import {
	type AutocompleteHint,
	type FieldFormat,
	type FieldType,
	type FormField,
	type FormSchema,
	type FormValidationResult,
	SUPPORTED_AUTOCOMPLETE,
	SUPPORTED_FIELD_TYPES,
	SUPPORTED_FORMATS,
} from "./form-schema";

const SUPPORTED_TYPES_SET = new Set(SUPPORTED_FIELD_TYPES);
const SUPPORTED_FORMATS_SET = new Set(SUPPORTED_FORMATS);
const SUPPORTED_AUTOCOMPLETE_SET = new Set(SUPPORTED_AUTOCOMPLETE);

type StringFieldLike = Extract<
	FormField,
	{ type: "string" | "textarea" | "password" }
>;
type NumberFieldLike = Extract<FormField, { type: "number" }>;
type SelectFieldLike = Extract<FormField, { type: "select" | "multiselect" }>;
type DateTimeFieldLike = Extract<
	FormField,
	{ type: "date" | "time" | "datetime" }
>;
type CreditCardFieldLike = Extract<FormField, { type: "credit-card" }>;

export function validateFormSchema(input: unknown): FormValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!input || typeof input !== "object") {
		return {
			valid: false,
			normalized: createEmptyForm(),
			errors: ["Form schema must be an object"],
			warnings: [],
		};
	}

	const raw = input as Record<string, unknown>;

	if (!raw.id || typeof raw.id !== "string") {
		errors.push("Form must have a string 'id'");
	}

	if (!Array.isArray(raw.fields)) {
		errors.push("Form must have a 'fields' array");
		return {
			valid: false,
			normalized: createEmptyForm(),
			errors,
			warnings,
		};
	}

	const normalizedFields: FormField[] = [];
	const fieldIds = new Set<string>();

	for (let i = 0; i < raw.fields.length; i++) {
		const field = raw.fields[i];
		const result = normalizeField(field, i, fieldIds, warnings);

		if (result.error) {
			errors.push(result.error);
		}

		if (result.field) {
			normalizedFields.push(result.field);
			fieldIds.add(result.field.id);
		}
	}

	for (const field of normalizedFields) {
		if (field.showIf && !fieldIds.has(field.showIf.fieldId)) {
			warnings.push(
				`Field '${field.id}' has showIf referencing unknown field '${field.showIf.fieldId}'; removing condition`,
			);
			delete field.showIf;
		}
	}

	const normalized: FormSchema = {
		version: 1,
		id: String(raw.id || `form_${Date.now()}`),
		title: typeof raw.title === "string" ? raw.title : undefined,
		description:
			typeof raw.description === "string" ? raw.description : undefined,
		submitLabel:
			typeof raw.submitLabel === "string" ? raw.submitLabel : undefined,
		cancelLabel:
			typeof raw.cancelLabel === "string" ? raw.cancelLabel : undefined,
		fields: normalizedFields,
	};

	return {
		valid: errors.length === 0 && normalizedFields.length > 0,
		normalized,
		errors,
		warnings,
	};
}

interface NormalizeFieldResult {
	field?: FormField;
	error?: string;
}

function normalizeField(
	input: unknown,
	index: number,
	existingIds: Set<string>,
	warnings: string[],
): NormalizeFieldResult {
	if (!input || typeof input !== "object") {
		return { error: `Field at index ${index} is not an object` };
	}

	const raw = input as Record<string, unknown>;

	if (!raw.id || typeof raw.id !== "string") {
		return { error: `Field at index ${index} missing required 'id'` };
	}

	if (existingIds.has(raw.id)) {
		return { error: `Duplicate field id '${raw.id}' at index ${index}` };
	}

	if (!raw.label || typeof raw.label !== "string") {
		return { error: `Field '${raw.id}' missing required 'label'` };
	}

	let type: FieldType = "string";
	if (typeof raw.type === "string") {
		if (SUPPORTED_TYPES_SET.has(raw.type as FieldType)) {
			type = raw.type as FieldType;
		} else {
			warnings.push(
				`Field '${raw.id}' has unsupported type '${raw.type}'; downgrading to 'string'`,
			);
		}
	}

	const field: FormField = {
		id: raw.id,
		label: raw.label,
		type,
		required: raw.required === true,
		placeholder:
			typeof raw.placeholder === "string" ? raw.placeholder : undefined,
		helpText: typeof raw.helpText === "string" ? raw.helpText : undefined,
	} as FormField;

	if (typeof raw.autocomplete === "string") {
		const autocomplete = raw.autocomplete as AutocompleteHint;
		if (SUPPORTED_AUTOCOMPLETE_SET.has(autocomplete)) {
			field.autocomplete = autocomplete;
		} else {
			warnings.push(
				`Field '${raw.id}' has unsupported autocomplete '${raw.autocomplete}'; ignoring`,
			);
		}
	}

	if (raw.defaultValue !== undefined) {
		const dv = raw.defaultValue;
		if (
			typeof dv === "string" ||
			typeof dv === "number" ||
			typeof dv === "boolean" ||
			(Array.isArray(dv) && dv.every((v) => typeof v === "string"))
		) {
			field.defaultValue = dv;
		}
	}

	if (raw.showIf && typeof raw.showIf === "object") {
		const showIf = raw.showIf as Record<string, unknown>;
		if (typeof showIf.fieldId === "string" && showIf.equals !== undefined) {
			field.showIf = {
				fieldId: showIf.fieldId,
				equals: showIf.equals as string | number | boolean,
			};
		}
	}

	if (raw.ui && typeof raw.ui === "object") {
		const ui = raw.ui as Record<string, unknown>;
		field.ui = {};
		if (ui.width === "full" || ui.width === "half" || ui.width === "third") {
			field.ui.width = ui.width;
		}
		if (typeof ui.section === "string") {
			field.ui.section = ui.section;
		}
		if (typeof ui.order === "number") {
			field.ui.order = ui.order;
		}
	}

	switch (type) {
		case "string":
		case "textarea":
		case "password": {
			const stringField = field as StringFieldLike;
			if (typeof raw.minLength === "number" && raw.minLength >= 0) {
				stringField.minLength = raw.minLength;
			}
			if (typeof raw.maxLength === "number" && raw.maxLength > 0) {
				stringField.maxLength = raw.maxLength;
			}
			if (typeof raw.pattern === "string") {
				try {
					new RegExp(raw.pattern);
					stringField.pattern = raw.pattern;
				} catch {
					warnings.push(
						`Field '${raw.id}' has invalid regex pattern; ignoring`,
					);
				}
			}
			if (typeof raw.format === "string") {
				const format = raw.format as FieldFormat;
				if (SUPPORTED_FORMATS_SET.has(format)) {
					stringField.format = format;
				} else {
					warnings.push(
						`Field '${raw.id}' has unsupported format '${raw.format}'; ignoring`,
					);
				}
			}
			break;
		}

		case "number": {
			const numberField = field as NumberFieldLike;
			if (typeof raw.minimum === "number") {
				numberField.minimum = raw.minimum;
			}
			if (typeof raw.maximum === "number") {
				numberField.maximum = raw.maximum;
			}
			if (typeof raw.step === "number" && raw.step > 0) {
				numberField.step = raw.step;
			}
			break;
		}

		case "select":
		case "multiselect": {
			if (Array.isArray(raw.options)) {
				const options = raw.options
					.filter(
						(o): o is { value: string; label: string } =>
							o &&
							typeof o === "object" &&
							typeof (o as { value?: unknown }).value === "string" &&
							typeof (o as { label?: unknown }).label === "string",
					)
					.map((o) => ({ value: o.value, label: o.label }));

				if (options.length === 0) {
					warnings.push(
						`Field '${raw.id}' is ${type} but has no valid options; downgrading to 'string'`,
					);
					field.type = "string";
				} else {
					const selectField = field as SelectFieldLike;
					selectField.options = options;
				}
			} else {
				warnings.push(
					`Field '${raw.id}' is ${type} but missing options; downgrading to 'string'`,
				);
				field.type = "string";
			}
			break;
		}

		case "date":
		case "time":
		case "datetime": {
			const dateTimeField = field as DateTimeFieldLike;
			if (typeof raw.minDate === "string") {
				dateTimeField.minDate = raw.minDate;
			}
			if (typeof raw.maxDate === "string") {
				dateTimeField.maxDate = raw.maxDate;
			}
			break;
		}

		case "credit-card": {
			const creditCardField = field as CreditCardFieldLike;
			creditCardField.collectName = raw.collectName === true;
			break;
		}
	}

	return { field };
}

function createEmptyForm(): FormSchema {
	return {
		version: 1,
		id: `form_${Date.now()}`,
		fields: [],
	};
}

export function createSchemaErrorResponse(result: FormValidationResult): {
	type: "form_schema_error";
	errors: string[];
	warnings: string[];
} {
	return {
		type: "form_schema_error",
		errors: result.errors,
		warnings: result.warnings,
	};
}
