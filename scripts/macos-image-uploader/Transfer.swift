import Foundation
import CryptoKit

struct UploadError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

struct UploadFile {
    let data: Data
    let name: String

    init(data: Data, name: String = "clipboard.png") throws {
        guard data.count <= 20 * 1024 * 1024 else { throw UploadError("每个文件需小于 20 MB。") }
        self.data = data
        self.name = name
    }

    init(url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, let size = values.fileSize, size <= 20 * 1024 * 1024 else {
            throw UploadError("请选择小于 20 MB 的文件。文件夹请先压缩。")
        }
        try self.init(data: Data(contentsOf: url), name: url.lastPathComponent)
    }

    static func remoteName(_ name: String, index: Int) -> String {
        let leaf = name.replacingOccurrences(of: "\\", with: "/").split(separator: "/").last.map(String.init) ?? "file"
        let allowed = CharacterSet.letters.union(.decimalDigits).union(.nonBaseCharacters).union(CharacterSet(charactersIn: " ._()-"))
        let clean = String(String.UnicodeScalarView(leaf.unicodeScalars.map { allowed.contains($0) ? $0 : UnicodeScalar(95)! }))
            .trimmingCharacters(in: CharacterSet(charactersIn: " ."))
        let ext = (clean as NSString).pathExtension
        let suffix = !ext.isEmpty && ext.count <= 16 && ext.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) != nil ? "." + ext : ""
        let stem = suffix.isEmpty ? clean : String(clean.dropLast(suffix.count))
        var short = ""
        for character in stem.prefix(96) {
            let next = short + String(character)
            if next.utf8.count > 180 { break }
            short = next
        }
        return String(format: "%02d-", index + 1) + (short.isEmpty ? "file" : short) + suffix
    }
}

struct Uploader {
    let host: String

    init(host: String) throws {
        guard host.range(of: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", options: .regularExpression) != nil else {
            throw UploadError("请在配置中填写有效的 SSH 主机别名。")
        }
        self.host = host
    }

    static func psQuote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "''") + "'" }
    static func sftpQuote(_ value: String) throws -> String {
        guard !value.contains(where: { $0 == "\n" || $0 == "\r" || $0 == "\0" }) else { throw UploadError("文件路径包含无效字符。") }
        return "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
    static func clipboardText(_ paths: [String]) -> String { paths.map { "\"\($0)\"" }.joined(separator: " ") }
    // Windows OpenSSH SFTP treats C:/... as relative; /C:/... is absolute.
    static func sftpPath(_ windowsPath: String) -> String { "/" + windowsPath.replacingOccurrences(of: "\\", with: "/") }

    private var options: [String] { ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", "-o", "StrictHostKeyChecking=yes"] }

    // Files keep stdout/stderr bounded in memory and avoid pipe-buffer deadlocks.
    private func run(_ executable: String, _ args: [String], input: Data = Data(), timeout: TimeInterval = 120) throws -> Data {
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent("claude-upload-process-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: temp) }
        let inURL = temp.appendingPathComponent("stdin"), outURL = temp.appendingPathComponent("stdout"), errURL = temp.appendingPathComponent("stderr")
        try input.write(to: inURL)
        FileManager.default.createFile(atPath: outURL.path, contents: nil)
        FileManager.default.createFile(atPath: errURL.path, contents: nil)
        let stdin = try FileHandle(forReadingFrom: inURL), stdout = try FileHandle(forWritingTo: outURL), stderr = try FileHandle(forWritingTo: errURL)
        defer { try? stdin.close(); try? stdout.close(); try? stderr.close() }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = args
        process.standardInput = stdin; process.standardOutput = stdout; process.standardError = stderr
        let finished = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in finished.signal() }
        try process.run()
        if finished.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            if finished.wait(timeout: .now() + 2) == .timedOut { kill(process.processIdentifier, SIGKILL); process.waitUntilExit() }
            throw UploadError("传输超时。请确认两台电脑在线、SSH 可以连接，再重试。")
        }
        if process.terminationStatus != 0 {
            let raw = (try? Data(contentsOf: errURL)) ?? Data()
            let detail = String(decoding: raw.suffix(1600), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw UploadError("传输失败。请确认远端在线、SSH 可以连接。\n" + detail)
        }
        return try Data(contentsOf: outURL)
    }

    private func powershell(_ body: String) throws -> Data {
        let script = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding; " + body
        let encoded = script.data(using: .utf16LittleEndian)!.base64EncodedString()
        let data = try run("/usr/bin/ssh", ["-T"] + options + [host, "powershell.exe -NoLogo -NoProfile -EncodedCommand " + encoded])
        return Data(String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{feff}"))).utf8)
    }

    func upload(_ files: [UploadFile], progress: @escaping (String) -> Void) throws -> [String] {
        guard !files.isEmpty, files.count <= 20 else { throw UploadError("每次请选择 1 到 20 个文件。") }
        guard files.reduce(0, { $0 + $1.data.count }) <= 100 * 1024 * 1024 else { throw UploadError("每次上传的文件合计需小于 100 MB。") }
        let batch = UUID().uuidString.lowercased()
        let staging = FileManager.default.temporaryDirectory.appendingPathComponent("claude-files-" + batch)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: staging) }
        let names = files.enumerated().map { UploadFile.remoteName($0.element.name, index: $0.offset) }
        for (file, name) in zip(files, names) { try file.data.write(to: staging.appendingPathComponent(name)) }

        progress("正在连接 \(host)…")
        let rootJSON = try powershell("$d=Join-Path $env:USERPROFILE 'ClaudeUploads\\\(batch)'; New-Item -ItemType Directory -Path $d -Force | Out-Null; ConvertTo-Json -InputObject $d -Compress")
        let root = try JSONDecoder().decode(String.self, from: rootJSON)
        guard root.range(of: "^[A-Za-z]:[\\\\/]", options: .regularExpression) != nil, !root.contains(where: { $0.isNewline || $0 == "\0" || $0 == "\"" }) else { throw UploadError("远端返回了无效的上传目录。") }
        let paths = names.map { root + "\\" + $0 }
        let batchInput = try zip(names, paths).map { name, remote in
            "put " + (try Self.sftpQuote(staging.appendingPathComponent(name).path)) + " " + (try Self.sftpQuote(Self.sftpPath(remote)))
        }.joined(separator: "\n") + "\n"
        progress("正在上传 \(files.count) 个文件…")
        _ = try run("/usr/bin/sftp", ["-q", "-b", "-"] + options + [host], input: Data(batchInput.utf8), timeout: 300)
        progress("正在核对文件完整性…")
        let verify = "$files=@(" + paths.map(Self.psQuote).joined(separator: ",") + "); $hashes=@($files | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() }); ConvertTo-Json -InputObject $hashes -Compress"
        let hashes = try JSONDecoder().decode([String].self, from: powershell(verify))
        let expected = files.map { SHA256.hash(data: $0.data).map { String(format: "%02x", $0) }.joined() }
        guard hashes == expected else { throw UploadError("远端文件校验失败，请重新上传。") }
        return paths
    }
}
