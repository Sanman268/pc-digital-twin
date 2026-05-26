"""Connect to a BLE device by address and dump its GATT services.

Usage (from gateway/ with venv active):
    python ble_probe.py XX:XX:XX:XX:XX:XX
"""

import argparse
import asyncio
from bleak import BleakClient


async def main(address: str) -> None:
    print(f"Connecting to {address} ...")
    async with BleakClient(address, timeout=20.0) as client:
        print(f"Connected. MTU={client.mtu_size}\n")
        for service in client.services:
            print(f"[Service]  {service.uuid}  {service.description}")
            for char in service.characteristics:
                props = ",".join(char.properties)
                print(f"  [Char]   {char.uuid}  ({props})  {char.description}")
                if "read" in char.properties:
                    try:
                        value = await client.read_gatt_char(char.uuid)
                        print(
                            f"           value (hex): {value.hex()}  len={len(value)}"
                        )
                    except Exception as e:
                        print(f"           read failed: {e}")
            print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("address", help="BLE address, e.g. XX:XX:XX:XX:XX:XX")
    args = ap.parse_args()
    asyncio.run(main(args.address))
