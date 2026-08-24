"""Verifica las diez series publicas separadas por Compra/Venta."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


EXPECTED = {
    (asset, side, frequency)
    for asset, frequencies in {"USDT": ("5m", "1h", "1d"), "USDC": ("1h", "1d")}.items()
    for side in ("BUY", "SELL")
    for frequency in frequencies
}
SIDE_PATHS = {"BUY": "compra", "SELL": "venta"}
ROOT_FIELDS = {
    "schema_version", "asset", "side", "fiat", "frequency", "window_days",
    "as_of_utc", "as_of_bo", "price_unit", "volume_unit", "label", "points",
}
POINT_FIELDS = {
    "timestamp_utc", "timestamp_bo", "vwap_bob", "volume_asset", "volume_bob",
    "validated_events", "price_observed", "minutes_since_last_trade", "status",
}
PRIVATE_FRAGMENTS = {
    "adid", "advno", "advertiser", "merchant", "userno", "usermaskid", "userid",
    "email", "mobile", "realname", "account", "payment", "raw", "eventid", "captureid",
}
MAX_DECIMALS = {"vwap_bob": 4, "volume_asset": 8, "volume_bob": 2}


def normalized_fields(value):
    if isinstance(value, dict):
        for key, nested in value.items():
            yield str(key).lower().replace("_", "")
            yield from normalized_fields(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from normalized_fields(nested)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def verify(data_dir: Path) -> None:
    expected_paths = {
        data_dir / asset / SIDE_PATHS[side] / f"{frequency}.json": (asset, side, frequency)
        for asset, side, frequency in EXPECTED
    }
    actual_paths = {path for path in data_dir.rglob("*") if path.is_file()}
    if actual_paths != set(expected_paths):
        raise ValueError("La publicacion debe contener exactamente los diez JSON permitidos")
    for path, expected in expected_paths.items():
        payload = json.loads(path.read_text(encoding="utf-8"))
        if set(payload) != ROOT_FIELDS:
            raise ValueError(f"{path}: contrato raiz incompleto o no permitido")
        if (payload.get("asset"), payload.get("side"), payload.get("frequency")) != expected:
            raise ValueError(f"{path}: activo/lado/frecuencia incorrectos")
        if payload.get("window_days") != 30 or payload.get("fiat") != "BOB":
            raise ValueError(f"{path}: ventana/fiat incorrectos")
        points = payload.get("points")
        if not isinstance(points, list):
            raise ValueError(f"{path}: points no es lista")
        for point in points:
            if not isinstance(point, dict) or set(point) != POINT_FIELDS:
                raise ValueError(f"{path}: punto incompleto o con estructura no permitida")
            if point.get("status") not in {"final", "provisional"}:
                raise ValueError(f"{path}: status no permitido")
            for field in ("vwap_bob", "volume_asset", "volume_bob"):
                value = point.get(field)
                if value is None:
                    continue
                try:
                    parsed = Decimal(str(value))
                except (InvalidOperation, ValueError) as error:
                    raise ValueError(f"{path}: {field} no numerico") from error
                if abs(parsed.as_tuple().exponent) > MAX_DECIMALS[field]:
                    raise ValueError(
                        f"{path}: {field} supera {MAX_DECIMALS[field]} decimales"
                    )
        if points and (parse_time(points[-1]["timestamp_utc"]) - parse_time(points[0]["timestamp_utc"])).total_seconds() >= 30 * 86400:
            raise ValueError(f"{path}: supera la ventana publica")
        fields = set(normalized_fields(payload))
        if any(fragment in field for field in fields for fragment in PRIVATE_FRAGMENTS):
            raise ValueError(f"{path}: campo privado detectado")


if __name__ == "__main__":
    default_target = Path(__file__).resolve().parents[1] / "data"
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default_target
    verify(target)
    print("Datos publicos: 10 series Compra/Venta, 30 dias, sin campos privados ni RAW.")
