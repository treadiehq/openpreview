import { Box, Text, Select } from "@opentui/core";
import { theme } from "../theme.ts";

export interface PaletteCommand {
  name: string;
  description?: string;
  value: string;
}

export function CommandPalette({
  commands,
}: {
  commands: PaletteCommand[];
}) {
  const select = Select({
    id: "palette-select",
    width: 36,
    height: Math.min(commands.length + 2, 12),
    options: commands.map((c) => ({ name: c.name, description: c.description ?? "", value: c.value })),
    showDescription: true,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.accent,
    selectedTextColor: theme.bg,
    textColor: theme.text,
    descriptionColor: theme.textMuted,
  });
  const box = Box(
    {
      flexDirection: "column",
      padding: 1,
      borderStyle: "rounded",
      borderColor: theme.borderFocus,
      backgroundColor: theme.bg,
      position: "absolute",
      left: "50%",
      top: "50%",
      marginLeft: -18,
      marginTop: -6,
      zIndex: 100,
    },
    Text({ content: "Command palette", fg: theme.textMuted }),
    select
  );
  return { box, select };
}
