import { Select } from "@radix-ui/themes";

interface SelectProps<T> {
  className?: string;
  options: {
    value: T;
    label: string;
    disabled?: boolean;
  }[];
  placeholder?: string;
  value?: T;
  onChange?: (value: T) => void;
}

function SelectComponent<T>({ className, options, placeholder, value, onChange }: SelectProps<T>) {
  const valueIndex = options.findIndex((option) => option.value === value);
  return (
    <Select.Root
      value={`${valueIndex !== -1 ? valueIndex : ""}`}
      onValueChange={(value) => onChange?.(options[parseInt(value)].value)}
      disabled={options.length === 0}
    >
      <Select.Trigger placeholder={placeholder} className={className} />
      <Select.Content>
        <Select.Group>
          {options.map((option, index) => (
            <Select.Item key={index} value={`${index}`} disabled={option.disabled}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
export { SelectComponent as Select };
