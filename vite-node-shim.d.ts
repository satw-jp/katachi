declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: "utf8" },
  ): string;
}

declare module "node:process" {
  export function cwd(): string;
  export const env: Record<string, string | undefined>;
}
