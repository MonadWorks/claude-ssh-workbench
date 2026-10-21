import Foundation

@main
struct ImageUploaderTests {
    static func rejects(_ action: () throws -> Void) {
        do { try action(); fatalError("Expected rejection") } catch {}
    }
    static func main() throws {
        _ = try Uploader(host: "my-windows-host")
        for host in ["-oProxyCommand=bad", "host\nother", "user@host", "host;bad", ""] {
            rejects { _ = try Uploader(host: host) }
        }
        assert(Uploader.psQuote("C:\\a'b\\$(echo test)") == "'C:\\a''b\\$(echo test)'")
        let escaped = try Uploader.sftpQuote("/tmp/a \"b\"\\c")
        assert(escaped == "\"/tmp/a \\\"b\\\"\\\\c\"")
        rejects { _ = try Uploader.sftpQuote("/tmp/ok\nput bad") }
        rejects { _ = try ImageFile(data: Data("not an image".utf8)) }
        rejects { _ = try ImageFile(data: Data(count: 21 * 1024 * 1024)) }
        let png = try ImageFile(data: Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=")!)
        assert(png.ext == "png")
        let uploader = try Uploader(host: "unused-test-host")
        rejects { _ = try uploader.upload([]) { _ in fatalError("Must reject before SSH") } }
        rejects { _ = try uploader.upload(Array(repeating: png, count: 21)) { _ in fatalError("Must reject before SSH") } }
        let paths = ["C:\\Users\\Name With Space\\ClaudeUploads\\image-01.png", "C:\\images\\image-02.jpg"]
        let text = Uploader.clipboardText(paths)
        assert(Uploader.sftpPath(paths[0]) == "/C:/Users/Name With Space/ClaudeUploads/image-01.png")
        assert(text == "\"\(paths[0])\" \"\(paths[1])\"")
        assert(!text.contains("\n")) // Pasting paths must never submit a prompt.
        print("Image uploader checks passed (no network or clipboard access)")
    }
}
