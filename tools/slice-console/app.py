"""FUKEI Slice Runner - small Tkinter GUI for ASTRA-prepared native slice jobs."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

from job import JobSpec, ValidationResult, load_job, validate_job
from progress import format_duration, format_remaining
from runner import SliceRunner
from package_gcode import inspect_gcode, package_gcode
from startup import SingleInstance


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("FUKEI Slice Runner")
        self.geometry("850x760")
        self.minsize(680, 620)
        self.configure(padx=16, pady=14)

        self.job: JobSpec | None = None
        self.runner: SliceRunner | None = None
        self.events: queue.Queue[tuple[str, dict]] = queue.Queue()
        self.validation: list[ValidationResult] = []
        self.last_run_dir: Path | None = None
        self.review_artifact_path: Path | None = None
        self.package_running = False
        self._build_ui()
        self.after(250, self._poll_events)

    def _build_ui(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        style.configure("Title.TLabel", font=("Segoe UI", 18, "bold"))
        style.configure("Section.TLabel", font=("Segoe UI", 10, "bold"))
        style.configure("Pass.TLabel", foreground="#147a3d")
        style.configure("Fail.TLabel", foreground="#b42318")
        style.configure("Muted.TLabel", foreground="#667085")

        tabs = ttk.Notebook(self)
        tabs.pack(fill="both", expand=True)
        slice_tab = ttk.Frame(tabs, padding=8)
        package_tab = ttk.Frame(tabs, padding=8)
        tabs.add(slice_tab, text="Slice")
        tabs.add(package_tab, text="完成G-code → Bambu用3MF")
        self._build_package_tab(package_tab)

        ttk.Label(slice_tab, text="FUKEI Slice Runner", style="Title.TLabel").pack(anchor="w")
        ttk.Label(slice_tab, text="ASTRAが準備したnative slice jobを実行します。設定はread-onlyです。", style="Muted.TLabel").pack(anchor="w", pady=(2, 12))

        job_frame = ttk.LabelFrame(slice_tab, text="Job", padding=10)
        job_frame.pack(fill="x")
        self.job_path_var = tk.StringVar(value="")
        ttk.Entry(job_frame, textvariable=self.job_path_var, state="readonly").pack(side="left", fill="x", expand=True)
        self.select_button = ttk.Button(job_frame, text="選択", command=self._select_job)
        self.select_button.pack(side="left", padx=(8, 0))

        details = ttk.Frame(slice_tab)
        details.pack(fill="x", pady=(12, 6))
        self.detail_vars = {key: tk.StringVar(value="--") for key in ("candidate", "printer", "layer", "material", "support", "engine")}
        detail_labels = (("candidate", "Candidate"), ("printer", "Printer"), ("layer", "Layer"), ("material", "Material"), ("support", "Support"), ("engine", "Engine"))
        for row, (key, label) in enumerate(detail_labels):
            ttk.Label(details, text=label, width=14).grid(row=row // 2, column=(row % 2) * 2, sticky="w", pady=3)
            ttk.Label(details, textvariable=self.detail_vars[key]).grid(row=row // 2, column=(row % 2) * 2 + 1, sticky="w", padx=(0, 24), pady=3)

        checks_frame = ttk.LabelFrame(slice_tab, text="Validation", padding=10)
        checks_frame.pack(fill="x", pady=(0, 8))
        self.check_vars: dict[str, tk.StringVar] = {}
        self.check_labels: dict[str, ttk.Label] = {}
        for row, key in enumerate(("job", "engine", "inputs", "input_mode", "profiles", "output", "locks", "cli")):
            self.check_vars[key] = tk.StringVar(value="—")
            label = ttk.Label(checks_frame, textvariable=self.check_vars[key], width=44)
            label.grid(row=row // 2, column=(row % 2) * 2, sticky="w", padx=(0, 18), pady=2)
            self.check_labels[key] = label
        self.validation_message = tk.StringVar(value="SLICE_JOB.jsonを選択してください")
        ttk.Label(checks_frame, textvariable=self.validation_message, style="Muted.TLabel", wraplength=650).grid(row=4, column=0, columnspan=4, sticky="w", pady=(7, 0))

        actions = ttk.Frame(slice_tab)
        actions.pack(fill="x", pady=(0, 10))
        self.run_button = ttk.Button(actions, text="G-codeを書き出す", command=self._start_run, state="disabled")
        self.run_button.pack(side="left")
        self.cancel_button = ttk.Button(actions, text="Cancel", command=self._cancel_run, state="disabled")
        self.cancel_button.pack(side="left", padx=(8, 0))
        self.review_button = ttk.Button(actions, text="Bambu Studioで確認", command=self._open_review_artifact, state="disabled")
        self.review_button.pack(side="right", padx=(8, 0))
        self.open_button = ttk.Button(actions, text="結果フォルダを開く", command=self._open_output, state="disabled")
        self.open_button.pack(side="right")

        progress_frame = ttk.LabelFrame(slice_tab, text="Status", padding=10)
        progress_frame.pack(fill="x")
        self.status_var = tk.StringVar(value="READY")
        self.mode_var = tk.StringVar(value="")
        self.phase_var = tk.StringVar(value="現在: --")
        self.elapsed_var = tk.StringVar(value="経過時間: --:--")
        self.remaining_var = tk.StringVar(value="残り推定: --")
        self.finish_var = tk.StringVar(value="完了予定: --")
        ttk.Label(progress_frame, textvariable=self.status_var, style="Section.TLabel").pack(anchor="w")
        self.progress = ttk.Progressbar(progress_frame, orient="horizontal", mode="determinate", maximum=100)
        self.progress.pack(fill="x", pady=(8, 2))
        ttk.Label(progress_frame, textvariable=self.mode_var, style="Muted.TLabel").pack(anchor="w")
        ttk.Label(progress_frame, textvariable=self.phase_var).pack(anchor="w", pady=(7, 0))
        ttk.Label(progress_frame, textvariable=self.elapsed_var).pack(anchor="w")
        ttk.Label(progress_frame, textvariable=self.remaining_var).pack(anchor="w")
        ttk.Label(progress_frame, textvariable=self.finish_var).pack(anchor="w")

        log_actions = ttk.Frame(slice_tab)
        log_actions.pack(fill="x", pady=(10, 4))
        self.log_button = ttk.Button(log_actions, text="ログを表示", command=self._toggle_logs)
        self.log_button.pack(anchor="w")
        self.log_frame = ttk.Frame(slice_tab)
        self.log_text = ScrolledText(self.log_frame, height=10, state="disabled", wrap="none")
        self.log_text.pack(fill="both", expand=True)
        self.log_visible = False

    def _build_package_tab(self, parent: ttk.Frame) -> None:
        ttk.Label(parent, text="完成G-codeをBambu用sliced .gcode.3mfに包装", style="Section.TLabel").pack(anchor="w", pady=(0, 10))
        self.gcode_var = tk.StringVar()
        self.context_var = tk.StringVar()
        self.package_output_var = tk.StringVar()
        for label, variable, command in (
            ("G-code", self.gcode_var, self._select_gcode),
            ("元の3MF設定", self.context_var, self._select_context),
            ("出力フォルダ", self.package_output_var, self._select_package_output),
        ):
            row = ttk.Frame(parent)
            row.pack(fill="x", pady=4)
            ttk.Label(row, text=label, width=20).pack(side="left")
            ttk.Entry(row, textvariable=variable, state="readonly").pack(side="left", fill="x", expand=True)
            ttk.Button(row, text="選択", command=command).pack(side="left", padx=(6, 0))
        self.package_info = tk.StringVar(value="G-codeを選択してください")
        ttk.Label(parent, textvariable=self.package_info, wraplength=770, justify="left").pack(anchor="w", pady=10)
        self.package_button = ttk.Button(parent, text="3MF化", command=self._start_package, state="disabled")
        self.package_button.pack(anchor="w")
        self.package_result = tk.StringVar(value="")
        ttk.Label(parent, textvariable=self.package_result, wraplength=770, justify="left").pack(anchor="w", pady=12)

    def _select_gcode(self) -> None:
        selected = filedialog.askopenfilename(title="完成G-codeを選択", filetypes=[("G-code", "*.gcode")])
        if selected:
            path = Path(selected)
            self.gcode_var.set(str(path))
            self.package_output_var.set(str(path.parent / "package_only"))
            job_path = path.parent / "SLICE_JOB.json"
            if job_path.is_file():
                try:
                    job_data = json.loads(job_path.read_text(encoding="utf-8"))
                    sources = job_data.get("inputs", [])
                    if sources:
                        source = Path(sources[0])
                        if not source.is_absolute():
                            source = (job_path.parent / source).resolve()
                        if source.is_file() and source.suffix.lower() == ".3mf":
                            self.context_var.set(str(source))
                except (OSError, ValueError, TypeError, json.JSONDecodeError):
                    pass
            self.package_info.set("確認中…")
            self.package_button.configure(state="disabled")
            def work() -> None:
                try:
                    info = inspect_gcode(path)
                    message = (f"{path.name} | {info['bytes']:,} bytes | SHA256 {info['sha256']} | "
                               f"layers {info['layers']} | printer {info['printer'] or '--'} | material {info['material'] or '--'}")
                except Exception as exc:
                    message = f"FAILED: {exc}"
                self.after(0, lambda: self._show_package_info(message))
            threading.Thread(target=work, daemon=True).start()

    def _show_package_info(self, message: str) -> None:
        self.package_info.set(message)
        self.package_button.configure(state="normal" if not message.startswith("FAILED") and not self.package_running and self.context_var.get() else "disabled")

    def _select_context(self) -> None:
        selected = filedialog.askopenfilename(title="元の3MF設定を選択（任意）", filetypes=[("3MF", "*.3mf")])
        if selected:
            self.context_var.set(selected)
            if self.gcode_var.get() and not self.package_info.get().startswith("FAILED"):
                self.package_button.configure(state="normal")

    def _select_package_output(self) -> None:
        selected = filedialog.askdirectory(title="package出力フォルダを選択")
        if selected:
            self.package_output_var.set(selected)

    def _start_package(self) -> None:
        if self.package_running or not self.gcode_var.get() or not self.package_output_var.get():
            return
        self.package_running = True
        self.package_button.configure(state="disabled")
        self.package_result.set("包装と検証を実行中…")
        gcode, output = Path(self.gcode_var.get()), Path(self.package_output_var.get())
        context = Path(self.context_var.get()) if self.context_var.get() else None
        def work() -> None:
            result = package_gcode(gcode, output, context)
            self.after(0, lambda: self._finish_package(result))
        threading.Thread(target=work, daemon=True).start()

    def _finish_package(self, result: dict) -> None:
        self.package_running = False
        self.package_button.configure(state="normal")
        self.package_result.set(
            f"{result['status']} | {result.get('error', '')}\n"
            f"{result['output_path']}\nPackage SHA256: {result.get('package_sha256', '--')}\n"
            f"Embedded SHA256: {result.get('embedded_sha256', '--')}\n"
            f"Standalone SHA256: {result.get('standalone_sha256', '--')}\n"
            f"{result.get('hash_match', '--')} | Preview: AUTHOR CHECK")

    def _select_job(self) -> None:
        path = filedialog.askopenfilename(title="SLICE_JOB.jsonを選択", filetypes=[("SLICE_JOB.json", "SLICE_JOB.json"), ("JSON", "*.json")])
        if not path:
            return
        self._load_job(Path(path))

    def _load_job(self, path: Path) -> None:
        try:
            job = load_job(path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            self.job = None
            self.job_path_var.set(str(path))
            self.validation_message.set(f"Jobを読めません: {exc}")
            self._set_run_enabled(False)
            return
        self.job = job
        self.job_path_var.set(str(path))
        display = job.display
        values = {
            "candidate": job.candidate or "--",
            "printer": display.get("printer", "--"),
            "layer": display.get("layer_height", "--"),
            "material": " / ".join(str(value) for value in (display.get("material"), display.get("temperature")) if value) or "--",
            "support": display.get("support", "--"),
            "engine": display.get("engine", job.cli.get("version", "--")),
        }
        for key, value in values.items():
            self.detail_vars[key].set(str(value))
        self.validation = validate_job(job)
        self._show_validation()
        self.status_var.set("READY")
        self.progress.configure(value=0)
        self.review_artifact_path = None
        self.review_button.configure(state="disabled")
        self.mode_var.set("")
        self.phase_var.set("現在: --")
        self.elapsed_var.set("経過時間: --:--")
        self.remaining_var.set("残り推定: --")
        self.finish_var.set("完了予定: --")

    def _show_validation(self) -> None:
        for result in self.validation:
            prefix = "✓" if result.ok else "✕"
            self.check_vars[result.key].set(f"{prefix} {result.label}: {result.detail}")
            self.check_labels[result.key].configure(style="Pass.TLabel" if result.ok else "Fail.TLabel")
        failures = [result.detail for result in self.validation if not result.ok]
        self.validation_message.set("Validation OK" if not failures else "実行不可: " + " / ".join(failures))
        self._set_run_enabled(not failures)

    def _set_run_enabled(self, enabled: bool) -> None:
        self.run_button.configure(state="normal" if enabled and self.runner is None else "disabled")

    def _start_run(self) -> None:
        if self.job is None or self.runner is not None:
            return
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")
        self.runner = SliceRunner(self.job)
        self.status_var.set("SLICING")
        self.run_button.configure(state="disabled")
        self.cancel_button.configure(state="normal")
        self.open_button.configure(state="disabled")
        self.review_button.configure(state="disabled")
        self.review_artifact_path = None
        try:
            self.runner.start(lambda event, payload: self.events.put((event, payload)))
        except RuntimeError as exc:
            self.runner = None
            self.validation_message.set(str(exc))
            self._set_run_enabled(True)

    def _cancel_run(self) -> None:
        if self.runner is not None:
            self.cancel_button.configure(state="disabled")
            self.status_var.set("CANCELLING")
            self.runner.cancel()

    def _poll_events(self) -> None:
        try:
            while True:
                event, payload = self.events.get_nowait()
                self._handle_event(event, payload)
        except queue.Empty:
            pass
        self.after(250, self._poll_events)

    def _handle_event(self, event: str, payload: dict) -> None:
        if event == "line":
            stream = payload.get("stream", "stdout")
            self.log_text.configure(state="normal")
            self.log_text.insert("end", f"[{stream}] {payload.get('line', '')}\n")
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        elif event == "progress":
            percent = float(payload.get("percent", 0))
            self.progress.configure(value=percent)
            self.mode_var.set("実測進捗" if payload.get("actual") else "推定進捗")
            self.phase_var.set(f"現在: {payload.get('phase', '準備中')}")
            self.elapsed_var.set(f"経過時間: {format_duration(payload.get('elapsed_seconds'))}")
            self.remaining_var.set(f"残り推定: {format_remaining(payload.get('remaining_seconds'))}")
            finish = payload.get("finish_at")
            if finish:
                try:
                    finish_dt = datetime.fromisoformat(finish).astimezone()
                    self.finish_var.set(f"完了予定: {finish_dt.strftime('%H:%M')}")
                except ValueError:
                    self.finish_var.set("完了予定: --")
        elif event == "complete":
            self._finish_run(payload)
        elif event == "error":
            self.status_var.set("FAILED")
            self.validation_message.set(f"実行できません: {payload.get('message', '')}")
            self.runner = None
            self.cancel_button.configure(state="disabled")
            self._set_run_enabled(bool(self.job and not [x for x in self.validation if not x.ok]))

    def _finish_run(self, payload: dict) -> None:
        manifest = payload.get("manifest")
        if not isinstance(manifest, dict):
            manifest = {}
        status = manifest.get("status", payload.get("status", "FAILED"))
        elapsed_seconds = manifest.get("elapsed_seconds", payload.get("elapsed_seconds"))
        finished_at = manifest.get("finished_at", payload.get("finished_at"))
        if status == "SUCCESS":
            self.progress.configure(value=100)
            self.mode_var.set("完了")
            self.phase_var.set("現在: 完了")
            self.elapsed_var.set(f"経過時間: {format_duration(elapsed_seconds)}")
            self.remaining_var.set("残り推定: 0分")
            self.finish_var.set(f"完了時刻: {finished_at}" if finished_at else "完了時刻: --")
            self.status_var.set("Slice completed")
        else:
            try:
                current_progress = float(self.progress["value"])
            except (KeyError, TypeError, ValueError, tk.TclError):
                current_progress = 0.0
            self.progress.configure(value=min(99.0, max(0.0, current_progress)))
            self.mode_var.set("未確定")
            self.phase_var.set("現在: --")
            self.elapsed_var.set(f"経過時間: {format_duration(elapsed_seconds)}")
            self.remaining_var.set(f"残り推定: {format_remaining(None)}")
            self.finish_var.set("完了予定: --")
            self.status_var.set("CANCELLED / NOT PRINTABLE" if status == "CANCELLED" else "✕ Slice failed")
        self.cancel_button.configure(state="disabled")
        self.runner = None
        run_dir = payload.get("run_dir")
        self.last_run_dir = Path(run_dir) if run_dir else None
        self.open_button.configure(state="normal" if self.last_run_dir and self.last_run_dir.is_dir() else "disabled")
        self.review_artifact_path = None
        review_artifact = manifest.get("review_artifact")
        if status == "SUCCESS" and isinstance(review_artifact, dict) and review_artifact.get("review_ready") is True:
            candidate = review_artifact.get("path")
            if candidate:
                candidate_path = Path(candidate)
                if candidate_path.is_file():
                    self.review_artifact_path = candidate_path
        self.review_button.configure(state="normal" if self.review_artifact_path else "disabled")
        message = f"Exit code: {payload.get('exit_code')}; RESULT_MANIFEST.jsonを生成しました"
        if status == "SUCCESS" and isinstance(review_artifact, dict) and review_artifact.get("review_ready") is not True:
            message += f" / Review artifact unavailable: {review_artifact.get('error', '原因不明')}"
        if payload.get("error"):
            message += f" / {payload['error']}"
        self.validation_message.set(message)
        self._set_run_enabled(bool(self.job and not [x for x in self.validation if not x.ok]))

    def _toggle_logs(self) -> None:
        self.log_visible = not self.log_visible
        if self.log_visible:
            self.log_frame.pack(fill="both", expand=True)
            self.log_button.configure(text="ログを隠す")
        else:
            self.log_frame.pack_forget()
            self.log_button.configure(text="ログを表示")

    def _open_output(self) -> None:
        if not self.last_run_dir:
            return
        try:
            if os.name == "nt":
                os.startfile(self.last_run_dir)  # type: ignore[attr-defined]
            else:
                subprocess.Popen(["xdg-open", str(self.last_run_dir)])
        except OSError as exc:
            messagebox.showerror("結果フォルダ", f"フォルダを開けません: {exc}")

    def _open_review_artifact(self) -> None:
        """Open the successful, user-selected review artifact in Bambu Studio."""

        review_path = self.review_artifact_path
        if review_path is None or not review_path.is_file() or self.job is None:
            return
        try:
            engine_path = Path(self.job.engine_path)
            subprocess.Popen([str(engine_path), str(review_path)], cwd=str(engine_path.parent), shell=False)
        except (OSError, TypeError, AttributeError) as exc:
            messagebox.showerror("Bambu Studio", f"review artifactを開けません: {exc}")

    def _on_close(self) -> None:
        if self.runner is not None:
            if not messagebox.askyesno("終了", "実行中です。Cancelして終了しますか？"):
                return
            self.runner.cancel()
        self.destroy()


def _startup_args(argv: list[str]) -> tuple[bool, Path | None]:
    startup = "--startup" in argv
    job_args = [item for item in argv if item != "--startup"]
    return startup, (Path(job_args[0]) if job_args else None)


def main() -> None:
    startup, initial_job = _startup_args(sys.argv[1:])
    instance = SingleInstance()
    if not instance.acquire():
        instance.notify_duplicate()
        return
    try:
        app = App()
        app.protocol("WM_DELETE_WINDOW", app._on_close)
        if initial_job is not None:
            app._load_job(initial_job)
        if startup:
            app.after(100, app.iconify)
        app.mainloop()
    finally:
        instance.release()


if __name__ == "__main__":
    main()
