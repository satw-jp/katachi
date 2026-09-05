declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: "utf8" },
  ): string;
}

declare module "node:process" {
  export function cwd(): string;
}

declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array;
}
