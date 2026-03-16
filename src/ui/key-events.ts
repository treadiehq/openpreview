export type KeyPressLike = {
  name?: string;
  sequence?: string;
  raw?: string;
  ctrl?: boolean;
  meta?: boolean;
  option?: boolean;
  shift?: boolean;
  eventType?: string;
};

export function isEscapeKey(key: KeyPressLike): boolean {
  return key.name === "escape" || key.sequence === "\x1b" || key.raw === "\x1b";
}

export function isTabKey(key: KeyPressLike): boolean {
  return key.name === "tab" || key.sequence === "\t" || key.raw === "\t";
}

export function isPlainKey(key: KeyPressLike, value: string): boolean {
  return (
    (key.eventType ?? "press") === "press" &&
    !key.ctrl &&
    !key.meta &&
    !key.option &&
    key.raw === value
  );
}
