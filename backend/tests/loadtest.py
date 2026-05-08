"""Simple asyncio load test for the predict endpoint.

Runs N concurrent workers. Each one:

  1. Logs in (shares the returned session cookie).
  2. Repeatedly POSTs the same image to /api/predict and polls
     /api/tasks/{id} until status=done.
  3. Records end-to-end latency (submit → done).

Prints P50/P95/P99 and error counts. No external deps: only stdlib +
httpx (already a transitive dep of fastapi's test client, but falls
back to urllib if httpx isn't available).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import time
from pathlib import Path


try:
    import httpx
except ImportError as exc:
    raise SystemExit("pip install httpx") from exc


async def login(client: httpx.AsyncClient, user_id: str, password: str) -> None:
    r = await client.post("/api/auth/login", json={"user_id": user_id, "password": password})
    r.raise_for_status()


async def one_run(client: httpx.AsyncClient, image_bytes: bytes, image_name: str) -> float:
    start = time.perf_counter()
    files = {"images": (image_name, image_bytes, "image/jpeg")}
    data = {"clinical_text": "loadtest", "patient_no": f"LT-{random.randint(1000,9999)}"}
    r = await client.post("/api/predict", files=files, data=data)
    r.raise_for_status()
    body = r.json()
    task_id = body["task_id"]

    while True:
        r = await client.get(f"/api/tasks/{task_id}")
        r.raise_for_status()
        status = r.json().get("status")
        if status == "done":
            return (time.perf_counter() - start) * 1000
        if status == "failed":
            raise RuntimeError("inference failed")
        await asyncio.sleep(0.3)


async def worker(idx: int, client: httpx.AsyncClient, jobs: asyncio.Queue, image_bytes: bytes, image_name: str, latencies: list, errors: list):
    while True:
        try:
            _ = jobs.get_nowait()
        except asyncio.QueueEmpty:
            return
        try:
            ms = await one_run(client, image_bytes, image_name)
            latencies.append(ms)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{type(exc).__name__}: {exc}")
        finally:
            jobs.task_done()


async def run(args) -> None:
    img_path = Path(args.image)
    if not img_path.exists():
        raise SystemExit(f"image not found: {img_path}")
    image_bytes = img_path.read_bytes()
    image_name = img_path.name

    limits = httpx.Limits(max_connections=args.concurrency * 2)
    async with httpx.AsyncClient(base_url=args.base_url, timeout=120, limits=limits) as client:
        await login(client, args.user_id, args.password)
        jobs: asyncio.Queue = asyncio.Queue()
        for i in range(args.total):
            jobs.put_nowait(i)
        latencies: list[float] = []
        errors: list[str] = []
        started = time.perf_counter()
        tasks = [
            asyncio.create_task(worker(i, client, jobs, image_bytes, image_name, latencies, errors))
            for i in range(args.concurrency)
        ]
        await asyncio.gather(*tasks)
        total_s = time.perf_counter() - started

    n = len(latencies)
    print(json.dumps({
        "total_requests": args.total,
        "successful": n,
        "errors": len(errors),
        "wall_time_s": round(total_s, 2),
        "throughput_rps": round(n / total_s, 2) if total_s else 0,
        "latency_ms": {
            "p50": int(statistics.median(latencies)) if latencies else None,
            "p95": int(sorted(latencies)[int(0.95 * (n - 1))]) if latencies else None,
            "p99": int(sorted(latencies)[int(0.99 * (n - 1))]) if latencies else None,
            "max": int(max(latencies)) if latencies else None,
        },
        "error_samples": errors[:5],
    }, indent=2, ensure_ascii=False))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--user-id", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--concurrency", type=int, default=10)
    p.add_argument("--total", type=int, default=30)
    p.add_argument("--image", required=True, help="Path to a sample image")
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
