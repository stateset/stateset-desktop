/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FormSection,
  ToggleSetting,
  SelectSetting,
  NumberSetting,
  TextInput,
  TextArea,
} from './FormComponents';

describe('FormSection', () => {
  it('renders title, description and children', () => {
    render(
      <FormSection title="General" description="Basic settings">
        <p>Section content</p>
      </FormSection>
    );
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByText('Basic settings')).toBeInTheDocument();
    expect(screen.getByText('Section content')).toBeInTheDocument();
  });

  it('omits the description when not provided', () => {
    render(
      <FormSection title="General">
        <p>Content</p>
      </FormSection>
    );
    expect(screen.queryByText('Basic settings')).not.toBeInTheDocument();
  });
});

describe('ToggleSetting', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an accessible switch associated with its label', () => {
    render(<ToggleSetting label="Auto-save" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: /auto-save/i });
    expect(toggle).not.toBeChecked();
  });

  it('renders the description', () => {
    render(
      <ToggleSetting
        label="Auto-save"
        description="Save changes automatically"
        checked
        onChange={onChange}
      />
    );
    expect(screen.getByText('Save changes automatically')).toBeInTheDocument();
  });

  it('calls onChange with the new value when toggled', () => {
    render(<ToggleSetting label="Auto-save" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when unchecking', () => {
    render(<ToggleSetting label="Auto-save" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('disables the switch when disabled', () => {
    render(<ToggleSetting label="Auto-save" checked={false} onChange={onChange} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('does not collide ids when two toggles share a label', () => {
    render(
      <>
        <ToggleSetting label="Same" checked={false} onChange={onChange} />
        <ToggleSetting label="Same" checked onChange={onChange} />
      </>
    );
    const toggles = screen.getAllByRole('switch');
    expect(toggles[0].id).not.toBe(toggles[1].id);
  });
});

describe('SelectSetting', () => {
  const options = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a labelled select with options', () => {
    render(<SelectSetting label="Theme" value="dark" options={options} onChange={onChange} />);
    const select = screen.getByLabelText('Theme');
    expect(select).toHaveValue('dark');
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument();
  });

  it('calls onChange with the selected value', () => {
    render(<SelectSetting label="Theme" value="dark" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('disables the select when disabled', () => {
    render(
      <SelectSetting label="Theme" value="dark" options={options} onChange={onChange} disabled />
    );
    expect(screen.getByLabelText('Theme')).toBeDisabled();
  });
});

describe('NumberSetting', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a labelled number input with the current value', () => {
    render(<NumberSetting label="Timeout" value={30} onChange={onChange} />);
    expect(screen.getByLabelText('Timeout')).toHaveValue(30);
  });

  it('calls onChange with a number', () => {
    render(<NumberSetting label="Timeout" value={30} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Timeout'), { target: { value: '45' } });
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it('renders the unit label', () => {
    render(<NumberSetting label="Timeout" value={30} onChange={onChange} unit="seconds" />);
    expect(screen.getByText('seconds')).toBeInTheDocument();
  });

  it('applies min, max and step attributes', () => {
    render(
      <NumberSetting label="Timeout" value={30} onChange={onChange} min={1} max={60} step={5} />
    );
    const input = screen.getByLabelText('Timeout');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '60');
    expect(input).toHaveAttribute('step', '5');
  });
});

describe('TextInput', () => {
  it('associates the label with the input', () => {
    render(<TextInput label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('calls onChange with the string value', () => {
    const onChange = vi.fn();
    render(<TextInput label="Email" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    expect(onChange).toHaveBeenCalledWith('a@b.com');
  });

  it('announces errors and links them to the input', () => {
    render(<TextInput label="Email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Invalid email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('is valid without an error', () => {
    render(<TextInput label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('respects an external id', () => {
    render(<TextInput label="Email" id="custom-id" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'custom-id');
  });
});

describe('TextArea', () => {
  it('associates the label with the textarea', () => {
    render(<TextArea label="Notes" />);
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('calls onChange with the string value', () => {
    const onChange = vi.fn();
    render(<TextArea label="Notes" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('announces errors and links them to the textarea', () => {
    render(<TextArea label="Notes" error="Too long" />);
    const textarea = screen.getByLabelText('Notes');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Too long');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', error.id);
  });
});
