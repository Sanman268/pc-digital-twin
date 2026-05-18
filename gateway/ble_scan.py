"""Diagnostic BLE scan.

Usage (from gateway/ with the venv active):
    python ble_scan.py
    python ble_scan.py --timeout 15
"""
import argparse
import asyncio
from bleak import BleakScanner


async def main(timeout: float) -> None:
    print(f"Scanning for {timeout:.0f}s ...\n")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)

    rows = []
    for address, (device, adv) in devices.items():
        name = device.name or adv.local_name or "<no name>"
        rssi = adv.rssi if adv.rssi is not None else "?"
        services = ", ".join(adv.service_uuids) if adv.service_uuids else ""
        rows.append((rssi, name, address, services))

    rows.sort(key=lambda r: (r[0] if isinstance(r[0], int) else -999), reverse=True)

    print(f"{'RSSI':>5}  {'NAME':<32}  {'ADDRESS':<20}  SERVICE UUIDS")
    print("-" * 100)
    for rssi, name, address, services in rows:
        rssi_s = f"{rssi:>5}" if isinstance(rssi, int) else f"{'?':>5}"
        print(f"{rssi_s}  {name[:32]:<32}  {address:<20}  {services}")

    thunderboards = [r for r in rows if "thunder" in r[1].lower()]
    print()
    if thunderboards:
        print(f"Found {len(thunderboards)} Thunderboard(s):")
        for rssi, name, address, services in thunderboards:
            print(f"  - {name} @ {address} (RSSI {rssi})")
            if services:
                print(f"    Advertised services: {services}")
    else:
        print("No Thunderboard found. Make sure the board is powered (USB cable)")
        print("and within ~5 m of the PC's BLE adapter.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeout", type=float, default=10.0)
    args = ap.parse_args()
    asyncio.run(main(args.timeout))
