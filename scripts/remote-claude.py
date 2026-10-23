#!/usr/bin/env python3
"""Open Claude's persistent agent view over SSH; sessions run on the remote host."""
import argparse
import base64
import os
import sys


def quote(value):
    if "\0" in value:
        raise ValueError("Arguments cannot contain NUL")
    return "'" + value.replace("'", "''") + "'"


def command(directory, attach=None, extra=()):
    if attach:
        args = ["attach", attach]
    else:
        args = ["agents", "--dangerously-skip-permissions"]
        args.extend(arg for arg in extra if arg != "--dangerously-skip-permissions")
    script = (
        "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';"
        "[Console]::InputEncoding=New-Object Text.UTF8Encoding;"
        "[Console]::OutputEncoding=New-Object Text.UTF8Encoding;"
        "$OutputEncoding=[Console]::OutputEncoding;"
        "$env:Path=\"$env:USERPROFILE\\.local\\bin;\"+"
        "[Environment]::GetEnvironmentVariable('Path','Machine')+';'+"
        "[Environment]::GetEnvironmentVariable('Path','User');"
        "$env:TERM='xterm-256color';$env:COLORTERM='truecolor';"
        "Set-Location -LiteralPath " + quote(directory) + ";"
        "$cliArgs=@(" + ",".join(quote(arg) for arg in args) + ");"
        "& \"$env:USERPROFILE\\.local\\bin\\claude.exe\" @cliArgs;exit $LASTEXITCODE"
    )
    return "powershell.exe -NoLogo -NoProfile -EncodedCommand " + base64.b64encode(script.encode("utf-16le")).decode("ascii")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="claude-host", help="Existing SSH alias")
    parser.add_argument("--dir", default=r"C:\Projects", help="Remote working directory")
    parser.add_argument("--attach", help="Attach to an existing background job ID or name")
    options, extra = parser.parse_known_args()
    if options.host.startswith("-"):
        parser.error("SSH host cannot start with a dash")
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    if interactive:
        print("远端后台工作台：提交的任务在远端继续运行，关闭本窗口不会停止任务。", flush=True)
    os.execvp("ssh", ["ssh", "-tt" if interactive else "-T", "-e", "none",
        "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=2", options.host, command(options.dir, options.attach, extra)])


if __name__ == "__main__":
    main()
