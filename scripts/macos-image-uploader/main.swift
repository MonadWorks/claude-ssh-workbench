import AppKit
import UniformTypeIdentifiers

final class DropView: NSView {
    var receive: (([URL]) -> Void)?
    override init(frame: NSRect) { super.init(frame: frame); registerForDraggedTypes([.fileURL]) }
    required init?(coder: NSCoder) { fatalError() }
    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation { .copy }
    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty else { return false }
        receive?(urls); return true
    }
}

final class Delegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var uploader: Uploader?
    var host = "claude-host"
    var busy = false
    var copied = ""
    let status = NSTextField(wrappingLabelWithString: "")
    let result = NSTextView()
    let progress = NSProgressIndicator()
    let clipboardButton = NSButton(title: "上传剪贴板图片", target: nil, action: nil)
    let chooseButton = NSButton(title: "选择图片…", target: nil, action: nil)
    let copyButton = NSButton(title: "再次复制路径", target: nil, action: nil)
    var pending: [URL] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "退出传图工具", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; menu.addItem(appItem)
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        let paste = editMenu.addItem(withTitle: "粘贴", action: #selector(pasteFromMenu(_:)), keyEquivalent: "v")
        paste.target = self
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu; menu.addItem(editItem); NSApp.mainMenu = menu
        var configError: Error?
        do {
            struct Config: Decodable { let host: String }
            if let url = Bundle.main.url(forResource: "config", withExtension: "json") {
                host = try JSONDecoder().decode(Config.self, from: Data(contentsOf: url)).host
            }
            uploader = try Uploader(host: host)
        } catch { configError = error }
        let content = DropView(frame: NSRect(x: 0, y: 0, width: 580, height: 360))
        content.receive = { [weak self] urls in self?.uploadFiles(urls) }
        window = NSWindow(contentRect: content.frame, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "传图给 \(host.uppercased())"
        window.contentView = content
        window.isReleasedWhenClosed = false
        window.delegate = self

        let title = NSTextField(labelWithString: "把图片发给远端 Claude")
        title.font = .boldSystemFont(ofSize: 20)
        let hint = NSTextField(wrappingLabelWithString: "上传后自动复制远端路径。回到 Claude 终端，按 ⌘V 粘贴，再补充你的要求并发送。")
        hint.textColor = .secondaryLabelColor
        let buttons = NSStackView(views: [clipboardButton, chooseButton, copyButton])
        buttons.orientation = .horizontal; buttons.spacing = 10
        for button in [clipboardButton, chooseButton, copyButton] { button.bezelStyle = .rounded; button.target = self }
        clipboardButton.action = #selector(uploadClipboard)
        chooseButton.action = #selector(choose)
        copyButton.action = #selector(copyAgain); copyButton.isEnabled = false
        status.stringValue = "可把图片文件拖进此窗口，也可从剪贴板上传。"
        let shortcut = NSTextField(wrappingLabelWithString: "截图到剪贴板：⌃⇧⌘4，然后在此窗口按 ⌘V。支持 PNG、JPEG、GIF、WebP。")
        shortcut.font = .systemFont(ofSize: 12); shortcut.textColor = .secondaryLabelColor
        progress.style = .spinning; progress.isDisplayedWhenStopped = false; progress.controlSize = .small
        let statusRow = NSStackView(views: [progress, status]); statusRow.spacing = 8; statusRow.alignment = .centerY
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder
        result.isEditable = false; result.isSelectable = true
        result.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        result.textContainerInset = NSSize(width: 6, height: 8)
        result.autoresizingMask = [.width]; result.textContainer?.widthTracksTextView = true
        scroll.documentView = result
        let stack = NSStackView(views: [title, hint, buttons, statusRow, scroll, shortcut])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 80),
            hint.widthAnchor.constraint(equalTo: stack.widthAnchor),
            statusRow.widthAnchor.constraint(equalTo: stack.widthAnchor),
            shortcut.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
        if let error = configError { status.stringValue = error.localizedDescription; clipboardButton.isEnabled = false; chooseButton.isEnabled = false }
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if !pending.isEmpty { let urls = pending; pending = []; uploadFiles(urls) }
    }

    func application(_ sender: NSApplication, open urls: [URL]) {
        if window == nil { pending.append(contentsOf: urls) }
        else { window.makeKeyAndOrderFront(nil); uploadFiles(urls) }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window?.makeKeyAndOrderFront(nil); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { !busy }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if busy { status.stringValue = "正在传输，请完成后再退出。"; return .terminateCancel }
        return .terminateNow
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { if busy { status.stringValue = "正在传输，请完成后再关闭。" }; return !busy }

    @objc func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
        panel.allowsMultipleSelection = true; panel.canChooseDirectories = false
        panel.prompt = "上传图片"
        panel.beginSheetModal(for: window) { [weak self] response in if response == .OK { self?.uploadFiles(panel.urls) } }
    }

    @objc func uploadClipboard() {
        guard !busy, window.attachedSheet == nil else { return }
        let board = NSPasteboard.general
        if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty { uploadFiles(urls); return }
        do {
            if let data = board.data(forType: .png) { try start([ImageFile(data: data)]); return }
            if let image = NSImage(pasteboard: board), let tiff = image.tiffRepresentation,
               let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                try start([ImageFile(data: png)]); return
            }
            throw UploadError("剪贴板中没有图片。请先截图或复制图片，也可以点击「选择图片…」。")
        } catch { showError(error) }
    }

    @objc func pasteFromMenu(_ sender: Any?) {
        if window.attachedSheet != nil { NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: sender) }
        else { uploadClipboard() }
    }

    func uploadFiles(_ urls: [URL]) {
        guard !busy else { NSSound.beep(); return }
        do {
            guard urls.count <= 20 else { throw UploadError("每次最多上传 20 张图片。") }
            var images: [ImageFile] = [], bytes = 0
            for url in urls {
                let image = try ImageFile(url: url)
                bytes += image.data.count
                guard bytes <= 100 * 1024 * 1024 else { throw UploadError("每次上传的图片合计需小于 100 MB。") }
                images.append(image)
            }
            try start(images)
        } catch { showError(error) }
    }

    func showError(_ error: Error) { copied = ""; copyButton.isEnabled = false; status.stringValue = "未完成上传"; result.string = error.localizedDescription }
    func setBusy(_ value: Bool) {
        busy = value; clipboardButton.isEnabled = !value; chooseButton.isEnabled = !value
        copyButton.isEnabled = !value && !copied.isEmpty
        if value { progress.startAnimation(nil) } else { progress.stopAnimation(nil) }
    }
    @objc func copyAgain() {
        guard !copied.isEmpty else { return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(copied, forType: .string)
        status.stringValue = "路径已复制。回到 Claude 终端按 ⌘V 粘贴。"
    }
    func start(_ images: [ImageFile]) throws {
        guard let uploader = uploader else { throw UploadError("SSH 配置无效。") }
        guard !busy else { return }
        copied = ""; result.string = ""; setBusy(true)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let paths = try uploader.upload(images) { message in DispatchQueue.main.async { self?.status.stringValue = message } }
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.copied = Uploader.clipboardText(paths)
                    self.result.string = paths.joined(separator: "\n")
                    self.setBusy(false); self.copyAgain()
                    self.status.stringValue = "\(images.count) 张图片上传成功，路径已复制。回到 Claude 按 ⌘V。"
                }
            } catch { DispatchQueue.main.async { self?.setBusy(false); self?.showError(error) } }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = Delegate()
app.delegate = delegate
app.run()
