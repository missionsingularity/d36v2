"""Capture signed-in local workspace views using the bundled Chromium CDP endpoint."""
import base64
import json
import subprocess
import time
from pathlib import Path

import requests
from websockets.sync.client import connect

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path.home() / "AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe"
PROFILE = ROOT / "qa/chrome-profile"
PORT = 9228


def main():
    proc = subprocess.Popen([
        str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
        f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                target = requests.put(f"http://127.0.0.1:{PORT}/json/new?http://127.0.0.1:8001/#search").json()
                break
            except requests.RequestException:
                time.sleep(.2)
        else:
            raise RuntimeError("Chromium remote debugging did not start")

        out = ROOT / "qa/screenshots"
        with connect(target["webSocketDebuggerUrl"], max_size=20_000_000) as ws:
            next_id = 0

            def command(method, params=None):
                nonlocal next_id
                next_id += 1
                ws.send(json.dumps({"id": next_id, "method": method, "params": params or {}}))
                while True:
                    msg = json.loads(ws.recv())
                    if msg.get("id") == next_id:
                        if "error" in msg:
                            raise RuntimeError(msg["error"])
                        return msg.get("result", {})

            command("Page.enable")
            command("Runtime.enable")
            command("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            command("Page.navigate", {"url": "http://127.0.0.1:8001/#search"})

            def wait_for_view(marker):
                for _ in range(60):
                    result = command("Runtime.evaluate", {"expression": "JSON.stringify({name:document.querySelector('#personaName')?.textContent,view:document.querySelector('#view')?.innerText||''})", "returnByValue": True})
                    state = json.loads(result.get("result", {}).get("value", "{}"))
                    value = state.get("view", "")
                    if state.get("name") == "Rupam Bora" and marker in value and "undefined records" not in value:
                        return value
                    time.sleep(.2)
                raise RuntimeError("Workspace view did not finish rendering")

            def screenshot(name):
                command("Runtime.evaluate", {"expression": "window.scrollTo(0,0)"})
                data = command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})["data"]
                (out / name).write_bytes(base64.b64decode(data))

            wait_for_view("Start your day")
            screenshot("search-1440x900.png")
            command("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
            screenshot("search-1280x800.png")

            command("Runtime.evaluate", {"expression": "document.querySelector('[data-route=apps]').click()"})
            wait_for_view("Workspace applications")
            screenshot("apps-1440x900.png")
            command("Runtime.evaluate", {"expression": "document.querySelector('[data-route=people]').click()"})
            wait_for_view("Officers, offices")
            command("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
            screenshot("people-1280x800.png")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    main()
