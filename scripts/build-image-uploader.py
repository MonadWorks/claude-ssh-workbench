#!/usr/bin/env python3
"""Build a standalone macOS image uploader using an existing SSH alias."""
import argparse
import json
import pathlib
import platform
import plistlib
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--host", default="claude-host", help="Existing SSH config alias")
parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("dist/Claude Image Uploader.app"))
args = parser.parse_args()
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", args.host):
    parser.error("--host must be an SSH config alias")
output = args.output.expanduser().resolve()
if output.suffix != ".app" or output.exists():
    parser.error("--output must be a new .app path (existing files are never overwritten)")
source = pathlib.Path(__file__).resolve().parent / "macos-image-uploader"
binary = output / "Contents/MacOS/ClaudeImageUploader"
resources = output / "Contents/Resources"
binary.parent.mkdir(parents=True)
resources.mkdir()
subprocess.run(["/usr/bin/swiftc", "-swift-version", "5", "-target", platform.machine() + "-apple-macosx12.0", "-O", str(source / "Transfer.swift"),
                str(source / "main.swift"), "-o", str(binary), "-framework", "AppKit", "-framework", "CryptoKit"], check=True)
config = {"host": args.host}
(resources / "config.json").write_text(json.dumps(config) + "\n")
info = {"CFBundleExecutable": binary.name, "CFBundleIdentifier": "works.monad.claude-image-uploader",
        "CFBundleName": output.stem, "CFBundleDisplayName": output.stem,
        "CFBundlePackageType": "APPL", "CFBundleVersion": "1", "CFBundleShortVersionString": "0.1.0",
        "LSMinimumSystemVersion": "12.0", "NSHighResolutionCapable": True,
        "CFBundleDocumentTypes": [{"CFBundleTypeName": "Files", "CFBundleTypeRole": "Viewer",
                                   "LSHandlerRank": "None", "LSItemContentTypes": ["public.data"]}]}
(output / "Contents/Info.plist").write_bytes(plistlib.dumps(info))
subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(output)], check=True)
print(output)
