const pkg = await import("../../package.json");

export const VERSION = pkg.version ?? "0.0.0";
