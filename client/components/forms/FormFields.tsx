/**
 * Form Field Components
 *
 * Individual field components for dynamic form rendering.
 * Each component handles its specific input type with proper
 * autofill hints, validation, and styling.
 */

import type React from "react";
import { useState } from "react";
import {
	StyleSheet,
	Switch,
	Text,
	TextInput,
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
	NumberField,
	SelectField,
	StringField,
} from "../../types/forms";
import {
	getAutoCompleteType,
	getKeyboardType,
	getTextContentType,
} from "../../utils/forms";

export const getFormFieldStyles = (theme: ThemeMode) => {
	const isDark = theme === "dark";
	const colors = {
		label: isDark ? "#f5f5f5" : "#333",
		helpText: isDark ? "#9c9c9c" : "#666",
		error: isDark ? "#ff6b6b" : "#e53935",
		inputBg: isDark ? "#111" : "#f5f5f5",
		inputText: isDark ? "#f5f5f5" : "#000",
		inputBorder: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)",
		optionBg: isDark ? "#111" : "#f5f5f5",
		optionBorder: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.06)",
		optionText: isDark ? "#f5f5f5" : "#333",
		optionSelectedBg: isDark ? "#7fb7ff" : "#007AFF",
		optionSelectedBorder: isDark ? "#7fb7ff" : "#007AFF",
		optionSelectedText: isDark ? "#111" : "#fff",
	};

	return StyleSheet.create({
		fieldContainer: {
			marginBottom: 16,
		},
		halfWidth: {
			width: "48%",
		},
		label: {
			fontSize: 14,
			fontWeight: "600",
			color: colors.label,
			marginBottom: 6,
		},
		required: {
			color: colors.error,
		},
		helpText: {
			fontSize: 12,
			color: colors.helpText,
			marginTop: 4,
		},
		errorText: {
			fontSize: 12,
			color: colors.error,
			marginTop: 4,
		},
		textInput: {
			backgroundColor: colors.inputBg,
			borderRadius: 10,
			paddingHorizontal: 14,
			paddingVertical: 12,
			fontSize: 16,
			color: colors.inputText,
			borderWidth: 1,
			borderColor: colors.inputBorder,
		},
		textArea: {
			minHeight: 100,
			textAlignVertical: "top",
		},
		switchContainer: {
			flexDirection: "row",
			alignItems: "center",
		},
		optionsContainer: {
			gap: 8,
		},
		optionButton: {
			backgroundColor: colors.optionBg,
			borderRadius: 10,
			paddingVertical: 12,
			paddingHorizontal: 14,
			borderWidth: 1,
			borderColor: colors.optionBorder,
		},
		optionButtonSelected: {
			backgroundColor: colors.optionSelectedBg,
			borderColor: colors.optionSelectedBorder,
		},
		optionText: {
			fontSize: 15,
			color: colors.optionText,
		},
		optionTextSelected: {
			color: colors.optionSelectedText,
			fontWeight: "500",
		},
		cardContainer: {
			gap: 10,
		},
		cardRow: {
			flexDirection: "row",
			gap: 10,
		},
		cardExpiry: {
			flex: 1,
		},
		cardCvc: {
			width: 80,
		},
	});
};

export type FormFieldStyles = ReturnType<typeof getFormFieldStyles>;

// =============================================================================
// Shared Components
// =============================================================================

interface FieldWrapperProps {
	field: FormField;
	children: React.ReactNode;
	error?: string;
	styles: FormFieldStyles;
}

export const FieldWrapper = ({
	field,
	children,
	error,
	styles,
}: FieldWrapperProps) => (
	<View
		style={[
			styles.fieldContainer,
			field.ui?.width === "half" && styles.halfWidth,
		]}
	>
		<Text style={styles.label}>
			{field.label}
			{field.required && <Text style={styles.required}> *</Text>}
		</Text>
		{children}
		{field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
		{error && <Text style={styles.errorText}>{error}</Text>}
	</View>
);

// =============================================================================
// Text Field
// =============================================================================

interface TextFieldProps {
	field: StringField | ContactField;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	styles: FormFieldStyles;
	placeholderTextColor: string;
}

export const TextField = ({
	field,
	value,
	onChange,
	error,
	styles,
	placeholderTextColor,
}: TextFieldProps) => {
	const isMultiline = field.type === "textarea";
	const isPassword = field.type === "password";

	return (
		<FieldWrapper field={field} error={error} styles={styles}>
			<TextInput
				style={[styles.textInput, isMultiline && styles.textArea]}
				value={value}
				onChangeText={onChange}
				placeholder={field.placeholder}
				placeholderTextColor={placeholderTextColor}
				keyboardType={getKeyboardType(field)}
				textContentType={getTextContentType(field.autocomplete)}
				autoComplete={getAutoCompleteType(field.autocomplete)}
				secureTextEntry={isPassword}
				multiline={isMultiline}
				numberOfLines={isMultiline ? 4 : 1}
				maxLength={
					field.type !== "phone" &&
					field.type !== "email" &&
					field.type !== "url"
						? (field as StringField).maxLength
						: undefined
				}
				autoCapitalize={field.type === "email" ? "none" : "sentences"}
			/>
		</FieldWrapper>
	);
};

// =============================================================================
// Number Field
// =============================================================================

interface NumberFieldProps {
	field: NumberField;
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	error?: string;
	styles: FormFieldStyles;
	placeholderTextColor: string;
}

export const NumberFieldComponent = ({
	field,
	value,
	onChange,
	error,
	styles,
	placeholderTextColor,
}: NumberFieldProps) => {
	const [textValue, setTextValue] = useState(value?.toString() ?? "");

	const handleChange = (text: string) => {
		setTextValue(text);
		const num = parseFloat(text);
		if (!Number.isNaN(num)) {
			onChange(num);
		} else if (text === "") {
			onChange(undefined);
		}
	};

	return (
		<FieldWrapper field={field} error={error} styles={styles}>
			<TextInput
				style={styles.textInput}
				value={textValue}
				onChangeText={handleChange}
				placeholder={field.placeholder}
				placeholderTextColor={placeholderTextColor}
				keyboardType="numeric"
			/>
		</FieldWrapper>
	);
};

// =============================================================================
// Boolean Field (Switch)
// =============================================================================

interface BooleanFieldProps {
	field: BooleanField;
	value: boolean;
	onChange: (value: boolean) => void;
	styles: FormFieldStyles;
	theme: ThemeMode;
}

export const BooleanFieldComponent = ({
	field,
	value,
	onChange,
	styles,
	theme,
}: BooleanFieldProps) => {
	const isDark = theme === "dark";
	return (
		<FieldWrapper field={field} styles={styles}>
			<View style={styles.switchContainer}>
				<Switch
					value={value}
					onValueChange={onChange}
					trackColor={{
						false: isDark ? "#333" : "#e0e0e0",
						true: isDark ? "#7fb7ff" : "#007AFF",
					}}
					thumbColor={isDark ? "#f5f5f5" : "#fff"}
				/>
			</View>
		</FieldWrapper>
	);
};

// =============================================================================
// Select Field
// =============================================================================

interface SelectFieldProps {
	field: SelectField;
	value: string | string[];
	onChange: (value: string | string[]) => void;
	error?: string;
	styles: FormFieldStyles;
}

export const SelectFieldComponent = ({
	field,
	value,
	onChange,
	error,
	styles,
}: SelectFieldProps) => {
	const isMulti = field.type === "multiselect";
	const selectedValues = isMulti
		? (value as string[]) || []
		: [value as string];

	const handleSelect = (optionValue: string) => {
		if (isMulti) {
			const current = (value as string[]) || [];
			if (current.includes(optionValue)) {
				onChange(current.filter((v) => v !== optionValue));
			} else {
				onChange([...current, optionValue]);
			}
		} else {
			onChange(optionValue);
		}
	};

	return (
		<FieldWrapper field={field} error={error} styles={styles}>
			<View style={styles.optionsContainer}>
				{field.options.map((option) => {
					const isSelected = selectedValues.includes(option.value);
					return (
						<TouchableOpacity
							key={option.value}
							style={[
								styles.optionButton,
								isSelected && styles.optionButtonSelected,
							]}
							onPress={() => handleSelect(option.value)}
							activeOpacity={0.7}
						>
							<Text
								style={[
									styles.optionText,
									isSelected && styles.optionTextSelected,
								]}
							>
								{option.label}
							</Text>
						</TouchableOpacity>
					);
				})}
			</View>
		</FieldWrapper>
	);
};

// =============================================================================
// Date/Time Field
// =============================================================================

interface DateTimeFieldProps {
	field: DateTimeField;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	styles: FormFieldStyles;
	placeholderTextColor: string;
}

export const DateTimeFieldComponent = ({
	field,
	value,
	onChange,
	error,
	styles,
	placeholderTextColor,
}: DateTimeFieldProps) => {
	// For POC, use a simple text input. In production, use a date picker.
	const placeholder =
		field.type === "date"
			? "YYYY-MM-DD"
			: field.type === "time"
				? "HH:MM"
				: "YYYY-MM-DD HH:MM";

	return (
		<FieldWrapper field={field} error={error} styles={styles}>
			<TextInput
				style={styles.textInput}
				value={value}
				onChangeText={onChange}
				placeholder={field.placeholder || placeholder}
				placeholderTextColor={placeholderTextColor}
				keyboardType={
					field.type === "time" ? "numbers-and-punctuation" : "default"
				}
			/>
		</FieldWrapper>
	);
};

// =============================================================================
// Credit Card Field (Composite)
// =============================================================================

interface CreditCardFieldProps {
	field: CreditCardField;
	value: CreditCardValue;
	onChange: (value: CreditCardValue) => void;
	error?: string;
	styles: FormFieldStyles;
	placeholderTextColor: string;
}

export const CreditCardFieldComponent = ({
	field,
	value,
	onChange,
	error,
	styles,
	placeholderTextColor,
}: CreditCardFieldProps) => {
	const updateField = (key: keyof CreditCardValue, val: string) => {
		onChange({ ...value, [key]: val });
	};

	return (
		<FieldWrapper field={field} error={error} styles={styles}>
			<View style={styles.cardContainer}>
				{field.collectName && (
					<TextInput
						style={styles.textInput}
						value={value.name || ""}
						onChangeText={(v) => updateField("name", v)}
						placeholder="Name on card"
						placeholderTextColor={placeholderTextColor}
						textContentType="creditCardName"
						autoComplete="cc-name"
						autoCapitalize="words"
					/>
				)}

				<TextInput
					style={styles.textInput}
					value={value.number}
					onChangeText={(v) => updateField("number", formatCardNumber(v))}
					placeholder="Card number"
					placeholderTextColor={placeholderTextColor}
					keyboardType="number-pad"
					textContentType="creditCardNumber"
					autoComplete="cc-number"
					maxLength={19}
				/>

				<View style={styles.cardRow}>
					<TextInput
						style={[styles.textInput, styles.cardExpiry]}
						value={formatExpiry(value.expMonth, value.expYear)}
						onChangeText={(v) => {
							const { month, year } = parseExpiry(v);
							onChange({ ...value, expMonth: month, expYear: year });
						}}
						placeholder="MM/YY"
						placeholderTextColor={placeholderTextColor}
						keyboardType="number-pad"
						textContentType="creditCardExpiration"
						autoComplete="cc-exp"
						maxLength={5}
					/>

					<TextInput
						style={[styles.textInput, styles.cardCvc]}
						value={value.cvc}
						onChangeText={(v) =>
							updateField("cvc", v.replace(/\D/g, "").slice(0, 4))
						}
						placeholder="CVC"
						placeholderTextColor={placeholderTextColor}
						keyboardType="number-pad"
						textContentType="creditCardSecurityCode"
						autoComplete="cc-csc"
						maxLength={4}
						secureTextEntry
					/>
				</View>
			</View>
		</FieldWrapper>
	);
};

// Card number formatting (adds spaces)
function formatCardNumber(value: string): string {
	const digits = value.replace(/\D/g, "").slice(0, 16);
	return digits.replace(/(.{4})/g, "$1 ").trim();
}

// Expiry formatting
function formatExpiry(month: string, year: string): string {
	if (!month && !year) return "";
	return `${month}/${year}`;
}

function parseExpiry(value: string): { month: string; year: string } {
	const clean = value.replace(/\D/g, "").slice(0, 4);
	if (clean.length <= 2) {
		return { month: clean, year: "" };
	}
	return { month: clean.slice(0, 2), year: clean.slice(2) };
}
