"""Windows startup helpers for FUKEI Slice Runner.

This module intentionally contains no slice execution logic.  It only resolves
the application location, creates the per-user single-instance mutex, and
brings an existing GUI window forward when a duplicate launch is attempted.
"""

from __future__ import annotations

import ctypes
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


APP_TITLE = "FUKEI Slice Runner"
MUTEX_NAME = "Local\\FUKEI_Slice_Runner_MVP"
ERROR_ALREADY_EXISTS = 183


@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    app: Path
    setup: Path
    python: Path
    pythonw: Path


def resolve_pythonw(executable: str | Path | None = None) -> Path:
    """Use pythonw.exe beside the setup interpreter when it exists."""

    current = Path(executable or sys.executable).expanduser().resolve()
    if current.name.casefold() == "pythonw.exe" and current.is_file():
        return current
    sibling = current.with_name("pythonw.exe")
    return sibling if sibling.is_file() else current


def resolve_runtime_paths(base_dir: str | Path | None = None, executable: str | Path | None = None) -> RuntimePaths:
    root = Path(base_dir or Path(__file__).resolve().parent).expanduser().resolve()
    python = Path(executable or sys.executable).expanduser().resolve()
    return RuntimePaths(
        root=root,
        app=root / "app.py",
        setup=root / "setup_windows.py",
        python=python,
        pythonw=resolve_pythonw(python),
    )


def _known_folder(folder_id: str) -> Path | None:
    if os.name != "nt":
        return None
    try:
        import uuid

        class GUID(ctypes.Structure):
            _fields_ = [
                ("Data1", ctypes.c_ulong),
                ("Data2", ctypes.c_ushort),
                ("Data3", ctypes.c_ushort),
                ("Data4", ctypes.c_ubyte * 8),
            ]

        guid = GUID.from_buffer_copy(uuid.UUID(folder_id).bytes_le)
        path_ptr = ctypes.c_wchar_p()
        result = ctypes.windll.shell32.SHGetKnownFolderPath(
            ctypes.byref(guid), 0, None, ctypes.byref(path_ptr)
        )
        if result != 0 or not path_ptr.value:
            return None
        path = Path(path_ptr.value)
        ctypes.windll.ole32.CoTaskMemFree(path_ptr)
        return path
    except (AttributeError, OSError, ValueError):
        return None


def desktop_dir() -> Path:
    # FOLDERID_Desktop; this also handles OneDrive/redirected Desktop paths.
    return _known_folder("B4BFCC3A-DB2C-424C-B029-7FE99A87C641") or (Path.home() / "Desktop")


def startup_dir() -> Path:
    appdata = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    return appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def shortcut_path(folder: str | Path, name: str = APP_TITLE) -> Path:
    return Path(folder) / f"{name}.lnk"


def _windows_message(text: str, title: str = APP_TITLE) -> None:
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, text, title, 0x00000040)


class SingleInstance:
    """Named Windows mutex; stale PID files are deliberately not used."""

    def __init__(self, name: str = MUTEX_NAME) -> None:
        self.name = name
        self.handle: Any = None

    def acquire(self) -> bool:
        if os.name != "nt":
            return True
        kernel32 = ctypes.windll.kernel32
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.GetLastError.restype = ctypes.c_ulong
        handle = kernel32.CreateMutexW(None, False, self.name)
        if not handle:
            raise OSError("FUKEI Slice Runner mutexを作成できません")
        if kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(handle)
            return False
        self.handle = handle
        return True

    def release(self) -> None:
        if self.handle is not None and os.name == "nt":
            ctypes.windll.kernel32.CloseHandle(self.handle)
            self.handle = None

    @staticmethod
    def bring_existing_to_front() -> bool:
        if os.name != "nt":
            return False
        user32 = ctypes.windll.user32
        user32.FindWindowW.restype = ctypes.c_void_p
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        handle = user32.FindWindowW(None, APP_TITLE)
        if not handle:
            return False
        user32.ShowWindow(handle, 9)  # SW_RESTORE
        user32.SetForegroundWindow(handle)
        user32.FlashWindow(handle, True)
        return True

    @classmethod
    def notify_duplicate(cls) -> None:
        cls.bring_existing_to_front()
        _windows_message("すでにFUKEI Slice Runnerが起動しています", APP_TITLE)

