import { Chip } from "../chip/chip";

type ChipGroupProps = {
  options: { v: string; l: string }[];
} & ({ multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value: string; onChange: (value: string) => void });

export function ChipGroup(props: ChipGroupProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {props.options.map(option => {
        const active = props.multiple ? props.value.includes(option.v) : props.value === option.v;
        return <Chip key={option.v} label={option.l} active={active} onClick={() => {
          if (props.multiple) {
            props.onChange(active ? props.value.filter(value => value !== option.v) : [...props.value, option.v]);
          } else props.onChange(option.v);
        }} />;
      })}
    </div>
  );
}
