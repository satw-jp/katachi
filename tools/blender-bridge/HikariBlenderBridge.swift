import AppKit
import Carbon
import Darwin
import Foundation
import UniformTypeIdentifiers

private let studySuffix = ".blender-study.json"

private struct StagedStudy {
    let directory: URL
    let sidecar: URL
    let blend: URL
}

final class HikariBlenderBridge: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var chooseButton: NSButton!
    private var progress: NSProgressIndicator!
    private var currentProcess: Process?
    private var pendingURLs: [URL] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        NSApp.activate(ignoringOtherApps: true)

        let queued = pendingURLs
        pendingURLs.removeAll()
        queued.forEach(routeIncomingURL)

        if CommandLine.arguments.contains("--self-test") {
            let result = selfTest()
            print(result.message)
            if !result.ok { Darwin.exit(1) }
            NSApp.terminate(nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        NSAppleEventManager.shared().removeEventHandler(
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        urls.forEach(routeIncomingURL)
    }

    @objc private func handleGetURLEvent(
        _ event: NSAppleEventDescriptor,
        withReplyEvent replyEvent: NSAppleEventDescriptor
    ) {
        guard let value = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue,
              let url = URL(string: value)
        else { return }
        routeIncomingURL(url)
    }

    private func routeIncomingURL(_ url: URL) {
        guard window != nil else {
            pendingURLs.append(url)
            return
        }
        if url.scheme == "hikari-blender" {
            openBridgeURL(url)
        } else if url.isFileURL {
            importStudy(at: url)
        }
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 260),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Hikari Blender Bridge"
        window.center()
        window.isReleasedWhenClosed = false

        let title = NSTextField(labelWithString: "HikariからBlenderへ")
        title.font = .systemFont(ofSize: 24, weight: .medium)
        title.alignment = .center

        let description = NSTextField(wrappingLabelWithString:
            "Hikariで見つけた雰囲気を、Blenderの詳細制作の開始点へ渡します。.blender-study.jsonを選ぶと.blendを生成して開きます。"
        )
        description.alignment = .center
        description.textColor = .secondaryLabelColor

        chooseButton = NSButton(title: "Hikari書き出しフォルダを選ぶ", target: self, action: #selector(chooseStudy))
        chooseButton.bezelStyle = .rounded
        chooseButton.controlSize = .large

        progress = NSProgressIndicator()
        progress.style = .spinning
        progress.controlSize = .small
        progress.isDisplayedWhenStopped = false

        statusLabel = NSTextField(wrappingLabelWithString: initialStatus())
        statusLabel.alignment = .center
        statusLabel.textColor = .secondaryLabelColor

        let statusRow = NSStackView(views: [progress, statusLabel])
        statusRow.orientation = .horizontal
        statusRow.alignment = .centerY
        statusRow.spacing = 8

        let stack = NSStackView(views: [title, description, chooseButton, statusRow])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false

        let content = NSView()
        content.addSubview(stack)
        window.contentView = content
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: content.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor, constant: -32),
            stack.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            description.widthAnchor.constraint(equalToConstant: 440),
            statusLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
        ])
        window.makeKeyAndOrderFront(nil)
    }

    private func initialStatus() -> String {
        let blenderOK = FileManager.default.isExecutableFile(atPath: blenderExecutable.path)
        let importerOK = FileManager.default.isReadableFile(atPath: importerScript.path)
        if !blenderOK { return "Blender.appが /Applications に見つかりません" }
        if !importerOK { return "Bridge内のHikari importerが見つかりません" }
        return "準備できています"
    }

    private var blenderExecutable: URL {
        URL(fileURLWithPath: "/Applications/Blender.app/Contents/MacOS/Blender")
    }

    private var importerScript: URL {
        Bundle.main.resourceURL!.appendingPathComponent("import_hikari_study.py")
    }

    private func selfTest() -> (ok: Bool, message: String) {
        let blenderOK = FileManager.default.isExecutableFile(atPath: blenderExecutable.path)
        let importerOK = FileManager.default.isReadableFile(atPath: importerScript.path)
        return (
            blenderOK && importerOK,
            "HIKARI_BLENDER_BRIDGE_SELF_TEST blender=\(blenderOK ? "ok" : "missing") importer=\(importerOK ? "ok" : "missing")"
        )
    }

    @objc private func chooseStudy() {
        chooseBundleDirectory(caseName: nil)
    }

    private func chooseBundleDirectory(caseName: String?) {
        let panel = NSOpenPanel()
        panel.title = "Hikariの書き出し先フォルダを選ぶ"
        panel.message = "通常はDownloadsです。macOSがこのフォルダ内のOBJと設定をBridgeへ許可します。"
        panel.prompt = "このフォルダを使う"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        guard panel.runModal() == .OK, let directory = panel.url else { return }

        if let caseName {
            importStudy(at: directory.appendingPathComponent(caseName + studySuffix))
            return
        }

        let candidates = ((try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []).filter { $0.lastPathComponent.hasSuffix(studySuffix) }
        if candidates.count == 1, let only = candidates.first {
            importStudy(at: only)
            return
        }

        let filePanel = NSOpenPanel()
        filePanel.title = "Blenderへ渡すケースを選ぶ"
        filePanel.prompt = "Blenderで開く"
        filePanel.canChooseDirectories = false
        filePanel.canChooseFiles = true
        filePanel.allowsMultipleSelection = false
        filePanel.allowedContentTypes = [.json]
        filePanel.directoryURL = directory
        if filePanel.runModal() == .OK, let sidecar = filePanel.url {
            importStudy(at: sidecar)
        }
    }

    private func openBridgeURL(_ url: URL) {
        guard url.host == "open",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let caseName = components.queryItems?.first(where: { $0.name == "case" })?.value,
              isSafeCaseName(caseName)
        else {
            showError("Hikariから受け取ったケース名が正しくありません")
            return
        }

        chooseBundleDirectory(caseName: caseName)
    }

    private func isSafeCaseName(_ value: String) -> Bool {
        !value.isEmpty
            && value.count <= 160
            && value.unicodeScalars.allSatisfy {
                CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-").contains($0)
            }
    }

    private func importStudy(at sidecar: URL) {
        guard currentProcess == nil else {
            showError("現在のBlender変換が終わるまで待ってください")
            return
        }
        guard sidecar.lastPathComponent.hasSuffix(studySuffix) else {
            showError("末尾が \(studySuffix) のファイルを選んでください")
            return
        }
        guard FileManager.default.isReadableFile(atPath: sidecar.path) else {
            showError("\(sidecar.lastPathComponent) が見つかりません。Hikariの5ファイルを同じフォルダへ置いてください")
            return
        }
        guard FileManager.default.isExecutableFile(atPath: blenderExecutable.path) else {
            showError("Blender.appが /Applications に見つかりません")
            return
        }
        guard FileManager.default.isReadableFile(atPath: importerScript.path) else {
            showError("Bridge内のHikari importerが見つかりません")
            return
        }

        let baseName = String(sidecar.lastPathComponent.dropLast(studySuffix.count))
        let output = availableBlendURL(directory: sidecar.deletingLastPathComponent(), baseName: baseName)
        do {
            let staged = try stageStudy(sidecar: sidecar, baseName: baseName)
            runBlender(staged: staged, output: output)
        } catch {
            showError("Blender用ファイルを準備できませんでした: \(error.localizedDescription)")
        }
    }

    private func stageStudy(sidecar: URL, baseName: String) throws -> StagedStudy {
        let data = try Data(contentsOf: sidecar)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let geometry = root["geometry"] as? [String: Any],
              let meshes = geometry["meshes"] as? [String: Any],
              let assets = meshes["assets"] as? [[String: Any]]
        else {
            throw NSError(domain: "HikariBlenderBridge", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Blender設定のmesh一覧を読めません",
            ])
        }

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("HikariBlenderBridge", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        do {
            let stagedSidecar = directory.appendingPathComponent(sidecar.lastPathComponent)
            try FileManager.default.copyItem(at: sidecar, to: stagedSidecar)
            let sourceDirectory = sidecar.deletingLastPathComponent().standardizedFileURL
            for asset in assets {
                guard let filename = asset["filename"] as? String, !filename.isEmpty else {
                    throw NSError(domain: "HikariBlenderBridge", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "meshファイル名がありません",
                    ])
                }
                let source = sourceDirectory.appendingPathComponent(filename).standardizedFileURL
                let sourcePrefix = sourceDirectory.path.hasSuffix("/")
                    ? sourceDirectory.path
                    : sourceDirectory.path + "/"
                guard source.path.hasPrefix(sourcePrefix), source.lastPathComponent == filename else {
                    throw NSError(domain: "HikariBlenderBridge", code: 3, userInfo: [
                        NSLocalizedDescriptionKey: "Downloads外のmesh参照は使えません",
                    ])
                }
                try FileManager.default.copyItem(at: source, to: directory.appendingPathComponent(filename))
            }
            return StagedStudy(
                directory: directory,
                sidecar: stagedSidecar,
                blend: directory.appendingPathComponent(baseName + ".blend")
            )
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    private func availableBlendURL(directory: URL, baseName: String) -> URL {
        let primary = directory.appendingPathComponent(baseName + ".blend")
        if !FileManager.default.fileExists(atPath: primary.path) { return primary }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return directory.appendingPathComponent("\(baseName)-from-hikari-\(formatter.string(from: Date())).blend")
    }

    private func runBlender(staged: StagedStudy, output: URL) {
        chooseButton.isEnabled = false
        progress.startAnimation(nil)
        statusLabel.stringValue = "Blenderシーンを生成中…"
        statusLabel.textColor = .secondaryLabelColor

        let process = Process()
        process.executableURL = blenderExecutable
        process.arguments = [
            "--background",
            "--python", importerScript.path,
            "--", staged.sidecar.path,
            "--clear",
            "--save", staged.blend.path,
        ]
        let logURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("hikari-blender-bridge-\(UUID().uuidString).log")
        guard FileManager.default.createFile(atPath: logURL.path, contents: nil),
              let logHandle = try? FileHandle(forWritingTo: logURL)
        else {
            progress.stopAnimation(nil)
            chooseButton.isEnabled = true
            showError("一時ログを作成できませんでした")
            return
        }
        process.standardOutput = logHandle
        process.standardError = logHandle
        currentProcess = process

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            do {
                try process.run()
                process.waitUntilExit()
                try? logHandle.close()
                let data = (try? Data(contentsOf: logURL)) ?? Data()
                let log = String(data: data, encoding: .utf8) ?? ""
                try? FileManager.default.removeItem(at: logURL)
                DispatchQueue.main.async {
                    self.finish(process: process, staged: staged, output: output, log: log)
                }
            } catch {
                try? logHandle.close()
                try? FileManager.default.removeItem(at: logURL)
                try? FileManager.default.removeItem(at: staged.directory)
                DispatchQueue.main.async {
                    self.currentProcess = nil
                    self.progress.stopAnimation(nil)
                    self.chooseButton.isEnabled = true
                    self.showError("Blenderを起動できませんでした: \(error.localizedDescription)")
                }
            }
        }
    }

    private func finish(process: Process, staged: StagedStudy, output: URL, log: String) {
        currentProcess = nil
        progress.stopAnimation(nil)
        chooseButton.isEnabled = true

        guard process.terminationStatus == 0, FileManager.default.fileExists(atPath: staged.blend.path) else {
            let tail = log.split(separator: "\n").suffix(5).joined(separator: "\n")
            try? FileManager.default.removeItem(at: staged.directory)
            showError("Blender変換に失敗しました\n\(tail)")
            return
        }

        do {
            try FileManager.default.copyItem(at: staged.blend, to: output)
            try? FileManager.default.removeItem(at: staged.directory)
        } catch {
            try? FileManager.default.removeItem(at: staged.directory)
            showError("完成した.blendを保存できませんでした: \(error.localizedDescription)")
            return
        }

        statusLabel.stringValue = "\(output.lastPathComponent) を作成しました"
        statusLabel.textColor = .systemGreen
        guard NSWorkspace.shared.open(output) else {
            showError(".blendは作成できましたが、Blenderで開けませんでした")
            return
        }
        NSApp.hide(nil)
    }

    private func showError(_ message: String) {
        statusLabel.stringValue = message
        statusLabel.textColor = .systemRed
        NSApp.activate(ignoringOtherApps: true)
    }
}

let application = NSApplication.shared
let delegate = HikariBlenderBridge()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
