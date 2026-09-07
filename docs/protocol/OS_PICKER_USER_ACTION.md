# OS Picker / User Action Protocol

Applies to all SOL / LUNA / worker lanes on Windows, macOS, and equivalent OS-native file/folder selection UI.

## Rule

Do not open an OS-native file or folder picker without context and explicit user action.

Before a picker is opened, the user must be told at minimum:

- lane / task name
- whether a file or folder must be selected
- why the selection is needed
- the recommended path or target
- what will happen after selection
- any path or location that must not be selected

The picker should open only after the user explicitly invokes an action such as `ファイルを選択`, `フォルダを選択`, or `選択ダイアログを開く`.

## Worker behavior

A SOL / LUNA / browser worker must not attempt to fully automate an OS picker when user interaction is required.

Instead:

1. surface the required context before the picker;
2. enter `USER ACTION REQUIRED`;
3. wait for the user to make or cancel the selection;
4. continue only after the application receives the resulting selection state.

If the user cancels the picker, do not classify that as implementation failure. Preserve the task as waiting for user action unless the cancellation itself exposes a product defect.

## Scope

This rule is cross-lane and applies to:

- SKIN / AB / C and related lanes
- HANA
- Hikari
- Research / Astra workflows
- Viewer / ART
- device / infrastructure / migration work
- any other lane that can invoke OS-native file/folder selection UI

## Product guidance

Where practical, prefer an in-app or chat-visible pre-picker step that explains the requested selection before the OS UI takes focus. The goal is to preserve task context when the native picker obscures the originating application or chat.
