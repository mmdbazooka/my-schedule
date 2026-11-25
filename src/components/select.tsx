"use client";

import * as Menu from "@radix-ui/react-select";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

type Props = {
  children: ReactNode; compact?: boolean; name?: string; id?: string; value?: number | string; defaultValue?: number | string;
  "aria-label"?: string; "aria-describedby"?: string; onValueChange?: (value: string) => void;
};

export function Select({ children, compact, name, value, defaultValue, onValueChange, ...labels }: Props) {
  const options = Children.toArray(children).filter((child) => isValidElement<{ value: string | number; children: ReactNode }>(child));
  const [local, setLocal] = useState(String(defaultValue ?? options[0]?.props.value ?? ""));
  const selected = String(value ?? local);
  // Prefix every option so the empty filter and user-defined IDs are both valid Radix values.
  return <Menu.Root dir="rtl" value={`opt:${selected}`} onValueChange={(key) => {
    const next = key.slice(4);
    setLocal(next);
    onValueChange?.(next);
  }}>
    {name && <input type="hidden" name={name} value={selected} />}
    <Menu.Trigger {...labels} className={compact ? "choice-trigger choice-trigger-compact" : "choice-trigger"}><Menu.Value /><Menu.Icon><ChevronDown size={16} /></Menu.Icon></Menu.Trigger>
    <Menu.Content position="popper" sideOffset={4} collisionPadding={8} className="choice-popup">
      <Menu.Viewport>{options.map(({ props }) => <Menu.Item key={props.value} value={`opt:${props.value}`} className="choice-option">
        <Menu.ItemText>{props.children}</Menu.ItemText><Menu.ItemIndicator><Check size={16} /></Menu.ItemIndicator>
      </Menu.Item>)}</Menu.Viewport>
    </Menu.Content>
  </Menu.Root>;
}
