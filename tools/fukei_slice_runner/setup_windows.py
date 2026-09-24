"""Small GUI setup tool for Desktop and per-user Windows Startup shortcuts."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from tkinter import messagebox, ttk

from startup import APP_TITLE, RuntimePaths, desktop_dir, resolve_runtime_paths, shortcut_path, startup_dir


@dataclass(frozen=True)
class ShortcutSpec:
    path: Path
    target: Path
    arguments: str
    working_directory: Path
    icon_location: str


def _powershell_literal(value: str | Path) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _powershell_executable() -> str:
    executable = shutil.which("powershell.exe") or shutil.which("pwsh.exe")
    if not executable:
        raise RuntimeError("PowerShellが見つからないためshortcutを作成できません")
    return executable


def _no_console_flags() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0


def create_shortcut(spec: ShortcutSpec) -> None:
    """Create a .lnk using the Windows built-in WScript.Shell COM object."""

    spec.path.parent.mkdir(parents=True, exist_ok=True)
    script = "; ".join(
        (
            "$ErrorActionPreference = 'Stop'",
            f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut({_powershell_literal(spec.path)})",
            f"$s.TargetPath = {_powershell_literal(spec.target)}",
            f"$s.Arguments = {_powershell_literal(spec.arguments)}",
            f"$s.WorkingDirectory = {_powershell_literal(spec.working_directory)}",
            f"$s.IconLocation = {_powershell_literal(spec.icon_location)}",
            "$s.Description = 'FUKEI Slice Runner'",
            "$s.Save()",
        )
    )
    subprocess.run(
        [
            _powershell_executable(),
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        check=True,
        creationflags=_no_console_flags(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if not spec.path.is_file():
        raise RuntimeError(f"shortcutを作成できませんでした: {spec.path}")


def remove_shortcut(path: str | Path) -> bool:
    target = Path(path)
    if not target.exists():
        return False
    target.unlink()
    return True


def desktop_spec(paths: RuntimePaths, folder: str | Path | None = None) -> ShortcutSpec:
    return ShortcutSpec(
        path=shortcut_path(folder or desktop_dir()),
        target=paths.pythonw,
        arguments=f'"{paths.app}"',
        working_directory=paths.root,
        icon_location=f"{paths.pythonw},0",
    )


def startup_spec(paths: RuntimePaths, folder: str | Path | None = None) -> ShortcutSpec:
    return ShortcutSpec(
        path=shortcut_path(folder or startup_dir()),
        target=paths.pythonw,
        arguments=f'"{paths.app}" --startup',
        working_directory=paths.root,
        icon_location=f"{paths.pythonw},0",
    )


class SetupApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("FUKEI Slice Runner Setup")
        self.geometry("540x300")
        self.resizable(False, False)
        self.configure(padx=18, pady=16)
        self.paths = resolve_runtime_paths()
        self.desktop_shortcut = desktop_spec(self.paths)
        self.startup_shortcut = startup_spec(self.paths)
        self.status_var = tk.StringVar(value="")
        self.desktop_status = tk.StringVar(value="")
        self.startup_status = tk.StringVar(value="")
        self._build_ui()
        self._refresh()

    def _build_ui(self) -> None:
        ttk.Label(self, text="FUKEI Slice Runner Setup", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        ttk.Label(self, text="Author向けの起動ショートカットを設定します。管理者権限は不要です。", foreground="#667085").pack(anchor="w", pady=(3, 16))

        state = ttk.LabelFrame(self, text="Status", padding=10)
        state.pack(fill="x")
        ttk.Label(state, textvariable=self.desktop_status).pack(anchor="w", pady=3)
        ttk.Label(state, textvariable=self.startup_status).pack(anchor="w", pady=3)
        ttk.Label(state, textvariable=self.status_var, foreground="#667085", wraplength=480).pack(anchor="w", pady=(8, 0))

        actions = ttk.Frame(self)
        actions.pack(fill="x", pady=(18, 0))
        ttk.Button(actions, text="Install", command=self._install).pack(side="left")
        ttk.Button(actions, text="Remove from Startup", command=self._remove_startup).pack(side="left", padx=(8, 0))
        ttk.Button(actions, text="Remove Desktop shortcut", command=self._remove_desktop).pack(side="left", padx=(8, 0))
        ttk.Button(actions, text="Close", command=self.destroy).pack(side="right")

        paths = ttk.Frame(self)
        paths.pack(fill="x", pady=(14, 0))
        ttk.Label(paths, text=f"Desktop: {self.desktop_shortcut.path}", foreground="#667085", wraplength=500).pack(anchor="w")
        ttk.Label(paths, text=f"Startup: {self.startup_shortcut.path}", foreground="#667085", wraplength=500).pack(anchor="w")

    def _refresh(self) -> None:
        self.desktop_status.set(("✓" if self.desktop_shortcut.path.is_file() else "—") + " Desktop shortcut")
        self.startup_status.set(("✓" if self.startup_shortcut.path.is_file() else "—") + " Windows Startup shortcut")

    def _install(self) -> None:
        try:
            create_shortcut(self.desktop_shortcut)
            create_shortcut(self.startup_shortcut)
            self.status_var.set("Desktop shortcutとWindows Startup登録を作成しました")
            self._refresh()
        except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
            self.status_var.set(f"設定できません: {exc}")
            messagebox.showerror("FUKEI Slice Runner Setup", str(exc))

    def _remove_startup(self) -> None:
        try:
            removed = remove_shortcut(self.startup_shortcut.path)
            self.status_var.set("Windows Startup登録を解除しました" if removed else "Windows Startup登録はありません")
            self._refresh()
        except OSError as exc:
            self.status_var.set(f"解除できません: {exc}")

    def _remove_desktop(self) -> None:
        try:
            removed = remove_shortcut(self.desktop_shortcut.path)
            self.status_var.set("Desktop shortcutを削除しました" if removed else "Desktop shortcutはありません")
            self._refresh()
        except OSError as exc:
            self.status_var.set(f"削除できません: {exc}")


def main() -> None:
    if os.name != "nt":
        raise SystemExit("setup_windows.pyはWindows用です")
    app = SetupApp()
    app.mainloop()


if __name__ == "__main__":
    main()

