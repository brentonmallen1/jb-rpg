import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface BaseFieldProps {
  /** Field label text */
  label: string
  /** Unique ID for the input (auto-generated if not provided) */
  id?: string
  /** Optional helper text */
  hint?: string
}

interface InputFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  type?: 'text' | 'number' | 'email' | 'password' | 'url'
}

interface SelectFieldProps extends BaseFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  children: ReactNode
}

interface TextareaFieldProps extends BaseFieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {}

const labelStyle = {
  display: 'block',
  marginBottom: 'var(--space-xs)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)'
}

const hintStyle = {
  marginTop: 'var(--space-xs)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)'
}

/**
 * Labeled input field with consistent styling.
 */
export function InputField({ label, id, hint, ...inputProps }: InputFieldProps) {
  const fieldId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <label htmlFor={fieldId} style={labelStyle}>
        {label}
      </label>
      <input
        id={fieldId}
        className="input"
        style={{ width: '100%' }}
        {...inputProps}
      />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

/**
 * Labeled select field with consistent styling.
 */
export function SelectField({ label, id, hint, children, ...selectProps }: SelectFieldProps) {
  const fieldId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <label htmlFor={fieldId} style={labelStyle}>
        {label}
      </label>
      <select
        id={fieldId}
        className="input"
        style={{ width: '100%' }}
        {...selectProps}
      >
        {children}
      </select>
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

/**
 * Labeled textarea field with consistent styling.
 */
export function TextareaField({ label, id, hint, ...textareaProps }: TextareaFieldProps) {
  const fieldId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <label htmlFor={fieldId} style={labelStyle}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className="input"
        style={{ width: '100%', resize: 'vertical' }}
        {...textareaProps}
      />
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

/**
 * Labeled checkbox field with consistent styling.
 */
export function CheckboxField({ label, ...inputProps }: Omit<InputFieldProps, 'type'>) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      cursor: 'pointer',
      fontSize: 'var(--text-sm)'
    }}>
      <input type="checkbox" {...inputProps} />
      {label}
    </label>
  )
}
