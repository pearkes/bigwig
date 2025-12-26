/**
 * Dynamic Form Component
 *
 * Renders a form from a FormSchema, handling all field types,
 * conditional display, validation, and submission.
 */

import { useEffect, useMemo, useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import type { ThemeMode } from "../../theme/theme";
import type {
	BooleanField,
	ContactField,
	CreditCardField,
	CreditCardValue,
	DateTimeField,
	FormField,
	FormSchema,
	FormValues,
	NumberField,
	SelectField,
	StringField,
} from "../../types/forms";
import {
	BooleanFieldComponent,
	CreditCardFieldComponent,
	DateTimeFieldComponent,
	getFormFieldStyles,
	NumberFieldComponent,
	SelectFieldComponent,
	TextField,
} from "./FormFields";

// =============================================================================
// Types
// =============================================================================

interface DynamicFormProps {
	schema: FormSchema;
	onSubmit: (values: FormValues) => void;
	onCancel: () => void;
	isSubmitting?: boolean;
	resolvedTheme: ThemeMode;
}

interface FieldErrors {
	[fieldId: string]: string;
}

type FormValue = FormValues[string];

// =============================================================================
// Component
// =============================================================================

export const DynamicForm = ({
	schema,
	onSubmit,
	onCancel,
	isSubmitting = false,
	resolvedTheme,
}: DynamicFormProps) => {
	const [values, setValues] = useState<FormValues>({});
	const [errors, setErrors] = useState<FieldErrors>({});
	const [touched, setTouched] = useState<Set<string>>(new Set());
	const styles = useMemo(
		() => getDynamicFormStyles(resolvedTheme),
		[resolvedTheme],
	);
	const fieldStyles = useMemo(
		() => getFormFieldStyles(resolvedTheme),
		[resolvedTheme],
	);
	const placeholderTextColor = resolvedTheme === "dark" ? "#8c8c8c" : "#999";

	// Debug: log schema on render
	console.log("[DynamicForm] Rendering with schema:", {
		id: schema?.id,
		title: schema?.title,
		fieldsCount: schema?.fields?.length,
		fields: schema?.fields?.map((f) => ({
			id: f.id,
			type: f.type,
			label: f.label,
		})),
	});

	// Initialize default values
	useEffect(() => {
		if (!schema?.fields || !Array.isArray(schema.fields)) {
			console.warn(
				"[DynamicForm] Cannot initialize defaults: schema.fields is not an array",
			);
			return;
		}
		const defaults: FormValues = {};
		for (const field of schema.fields) {
			if (field.defaultValue !== undefined) {
				defaults[field.id] = field.defaultValue;
			} else if (field.type === "boolean") {
				defaults[field.id] = false;
			} else if (field.type === "credit-card") {
				defaults[field.id] = { number: "", expMonth: "", expYear: "", cvc: "" };
			} else if (field.type === "multiselect") {
				defaults[field.id] = [];
			} else if (field.type === "number") {
				defaults[field.id] = undefined;
			} else {
				defaults[field.id] = "";
			}
		}
		setValues(defaults);
	}, [schema]);

	// Determine which fields are visible based on showIf conditions
	const visibleFields = useMemo(() => {
		if (!schema?.fields || !Array.isArray(schema.fields)) {
			console.warn(
				"[DynamicForm] schema.fields is not an array:",
				schema?.fields,
			);
			return [];
		}
		return schema.fields.filter((field) => {
			if (!field.showIf) return true;
			const dependentValue = values[field.showIf.fieldId];
			return dependentValue === field.showIf.equals;
		});
	}, [schema?.fields, values]);

	// Update a field value
	const updateValue = (fieldId: string, value: FormValue) => {
		setValues((prev) => ({ ...prev, [fieldId]: value }));
		setTouched((prev) => new Set(prev).add(fieldId));

		// Clear error when user starts typing
		if (errors[fieldId]) {
			setErrors((prev) => {
				const next = { ...prev };
				delete next[fieldId];
				return next;
			});
		}
	};

	// Validate all fields
	const validate = (): boolean => {
		const newErrors: FieldErrors = {};

		for (const field of visibleFields) {
			const value = values[field.id];

			// Required check
			if (field.required) {
				if (value === undefined || value === null || value === "") {
					newErrors[field.id] = `${field.label} is required`;
					continue;
				}
				if (field.type === "credit-card") {
					const card = value as CreditCardValue;
					if (!card.number || !card.expMonth || !card.expYear || !card.cvc) {
						newErrors[field.id] = "Please complete all card fields";
						continue;
					}
				}
				if (
					field.type === "multiselect" &&
					Array.isArray(value) &&
					value.length === 0
				) {
					newErrors[field.id] = "Please select at least one option";
					continue;
				}
			}

			// Type-specific validation
			if (value !== undefined && value !== null && value !== "") {
				if (field.type === "email" && typeof value === "string") {
					if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
						newErrors[field.id] = "Please enter a valid email";
					}
				}

				if (field.type === "number" && typeof value === "number") {
					const numField = field as NumberField;
					if (numField.minimum !== undefined && value < numField.minimum) {
						newErrors[field.id] = `Minimum value is ${numField.minimum}`;
					}
					if (numField.maximum !== undefined && value > numField.maximum) {
						newErrors[field.id] = `Maximum value is ${numField.maximum}`;
					}
				}

				if (
					(field.type === "string" || field.type === "textarea") &&
					typeof value === "string"
				) {
					const strField = field as StringField;
					if (
						strField.minLength !== undefined &&
						value.length < strField.minLength
					) {
						newErrors[field.id] =
							`Minimum length is ${strField.minLength} characters`;
					}
					if (
						strField.maxLength !== undefined &&
						value.length > strField.maxLength
					) {
						newErrors[field.id] =
							`Maximum length is ${strField.maxLength} characters`;
					}
					if (strField.pattern) {
						try {
							if (!new RegExp(strField.pattern).test(value)) {
								newErrors[field.id] = "Invalid format";
							}
						} catch {}
					}
				}
			}
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	// Handle form submission
	const handleSubmit = () => {
		if (isSubmitting) return;

		if (validate()) {
			// Only include visible field values
			const submittedValues: FormValues = {};
			for (const field of visibleFields) {
				submittedValues[field.id] = values[field.id];
			}
			onSubmit(submittedValues);
		}
	};

	// Render a field based on its type
	const renderField = (field: FormField) => {
		const value = values[field.id];
		const error = touched.has(field.id) ? errors[field.id] : undefined;

		switch (field.type) {
			case "string":
			case "textarea":
			case "password":
				return (
					<TextField
						key={field.id}
						field={field as StringField}
						value={(value as string) || ""}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);

			case "phone":
			case "email":
			case "url":
				return (
					<TextField
						key={field.id}
						field={field as ContactField}
						value={(value as string) || ""}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);

			case "number":
				return (
					<NumberFieldComponent
						key={field.id}
						field={field as NumberField}
						value={value as number | undefined}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);

			case "boolean":
				return (
					<BooleanFieldComponent
						key={field.id}
						field={field as BooleanField}
						value={(value as boolean) || false}
						onChange={(v) => updateValue(field.id, v)}
						styles={fieldStyles}
						theme={resolvedTheme}
					/>
				);

			case "select":
			case "multiselect":
				return (
					<SelectFieldComponent
						key={field.id}
						field={field as SelectField}
						value={value as string | string[]}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
					/>
				);

			case "date":
			case "time":
			case "datetime":
				return (
					<DateTimeFieldComponent
						key={field.id}
						field={field as DateTimeField}
						value={(value as string) || ""}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);

			case "credit-card":
				return (
					<CreditCardFieldComponent
						key={field.id}
						field={field as CreditCardField}
						value={
							(value as CreditCardValue) || {
								number: "",
								expMonth: "",
								expYear: "",
								cvc: "",
							}
						}
						onChange={(v) => updateValue(field.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);

			default: {
				// Fallback for unknown types - render as text
				const fallbackField = field as FormField;
				return (
					<TextField
						key={fallbackField.id}
						field={{ ...fallbackField, type: "string" } as StringField}
						value={(value as string) || ""}
						onChange={(v) => updateValue(fallbackField.id, v)}
						error={error}
						styles={fieldStyles}
						placeholderTextColor={placeholderTextColor}
					/>
				);
			}
		}
	};

	// Group fields by section if specified
	const groupedFields = useMemo(() => {
		const sections = new Map<string, FormField[]>();
		const noSection: FormField[] = [];

		for (const field of visibleFields) {
			if (field.ui?.section) {
				const existing = sections.get(field.ui.section) || [];
				existing.push(field);
				sections.set(field.ui.section, existing);
			} else {
				noSection.push(field);
			}
		}

		return { sections, noSection };
	}, [visibleFields]);

	return (
		<View style={styles.container}>
			{schema.title && <Text style={styles.title}>{schema.title}</Text>}
			{schema.description && (
				<Text style={styles.description}>{schema.description}</Text>
			)}

			<ScrollView
				style={styles.fieldsContainer}
				showsVerticalScrollIndicator={false}
			>
				{/* Debug: show field count */}
				{visibleFields.length === 0 && (
					<Text style={styles.emptyStateText}>
						No fields to display (schema has {schema?.fields?.length || 0}{" "}
						fields)
					</Text>
				)}

				{/* Render unsectioned fields */}
				{groupedFields.noSection.map(renderField)}

				{/* Render sectioned fields */}
				{Array.from(groupedFields.sections.entries()).map(
					([sectionName, fields]) => (
						<View key={sectionName} style={styles.section}>
							<Text style={styles.sectionTitle}>{sectionName}</Text>
							{fields.map(renderField)}
						</View>
					),
				)}
			</ScrollView>

			<View style={styles.buttonContainer}>
				<TouchableOpacity
					style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
					onPress={handleSubmit}
					disabled={isSubmitting}
					activeOpacity={0.7}
				>
					<Text
						style={[styles.submitText, isSubmitting && styles.textDisabled]}
					>
						{isSubmitting ? "Submitting..." : schema.submitLabel || "Submit"}
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={styles.cancelButton}
					onPress={onCancel}
					disabled={isSubmitting}
					activeOpacity={0.7}
				>
					<Text style={styles.cancelText}>
						{schema.cancelLabel || "Cancel"}
					</Text>
				</TouchableOpacity>

				<Text style={styles.privacyNote}>
					This form was requested by your AI agent. Data will be shared with the
					agent to complete your request.
				</Text>
			</View>
		</View>
	);
};

// =============================================================================
// Styles
// =============================================================================

const getDynamicFormStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		title: isDark ? "#f5f5f5" : "#000",
		description: isDark ? "#bdbdbd" : "#666",
		sectionTitle: isDark ? "#f5f5f5" : "#333",
		submitBg: isDark ? "#7fb7ff" : "#007AFF",
		submitText: isDark ? "#111" : "#fff",
		submitDisabled: isDark ? "#333" : "#ccc",
		cancelText: isDark ? "#bdbdbd" : "#666",
		privacyText: isDark ? "#9c9c9c" : "#999",
		emptyText: isDark ? "#9c9c9c" : "#999",
	};

	return StyleSheet.create({
		container: {
			flexShrink: 1,
		},
		title: {
			fontSize: 20,
			fontWeight: "700",
			color: colors.title,
			marginBottom: 8,
			textAlign: "center",
		},
		description: {
			fontSize: 14,
			color: colors.description,
			marginBottom: 20,
			textAlign: "center",
			lineHeight: 20,
		},
		fieldsContainer: {
			flexShrink: 1,
		},
		section: {
			marginTop: 16,
			marginBottom: 8,
		},
		sectionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: colors.sectionTitle,
			marginBottom: 12,
		},
		buttonContainer: {
			marginTop: 20,
			gap: 12,
		},
		submitButton: {
			backgroundColor: colors.submitBg,
			borderRadius: 12,
			paddingVertical: 14,
			alignItems: "center",
		},
		buttonDisabled: {
			backgroundColor: colors.submitDisabled,
		},
		submitText: {
			fontSize: 16,
			fontWeight: "600",
			color: colors.submitText,
		},
		textDisabled: {
			color: colors.privacyText,
		},
		cancelButton: {
			paddingVertical: 10,
			alignItems: "center",
		},
		cancelText: {
			fontSize: 15,
			color: colors.cancelText,
		},
		privacyNote: {
			fontSize: 11,
			color: colors.privacyText,
			textAlign: "center",
			marginTop: 12,
			lineHeight: 16,
		},
		emptyStateText: {
			color: colors.emptyText,
			textAlign: "center",
			padding: 20,
		},
	});
};
