from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any


FREQUENCIES = {"USDT": ("5m", "15m", "30m", "1h", "4h", "1d"), "USDC": ("1h", "4h", "1d")}
PLATFORM_FREQUENCIES = {"USDT": ("5m", "15m", "30m", "1h", "4h", "1d"), "USDC": ("1h", "4h", "1d")}
PLATFORMS = ("binance", "bybit", "bitget")
SIDES = {"compra": "BUY", "venta": "SELL"}
ROOT_FIELDS = {
    "schema_version", "asset", "side", "fiat", "frequency", "window_days",
    "as_of_utc", "as_of_bo", "price_unit", "label", "points",
}
POINT_FIELDS = {
    "timestamp_utc", "timestamp_bo", "vwap_bob", "price_observed",
    "minutes_since_last_trade", "status", "activity",
}
PARTICIPATION_FIELDS = {
    "schema_version", "asset", "as_of_utc", "as_of_bo", "decimals", "windows", "scopes", "platform_share",
}
FORBIDDEN_FIELD_FRAGMENTS = {
    "volumeasset", "volumebob", "volumeunit", "validatedevents", "adid", "advno",
    "advertiser", "merchant", "userno", "usermaskid", "userid", "email", "mobile",
    "realname", "account", "payment", "raw", "eventid", "captureid",
}
OBSERVED_SLOT_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d[05]:00Z$")
OBSERVED_DAY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
OBSERVED_INDEX = {"cada_5_minutos": "intervalos", "diario": "fechas"}

OBSERVED_ASSET = "USDT"
OBSERVED_PLATFORMS = ("binance", "bybit", "bitget")
OBSERVED_SERIES = ("todas_promedio", *OBSERVED_PLATFORMS)
OBSERVED_SIDES = ("BUY", "SELL")
OBSERVED_PAGE_SIDES = {"venta": "BUY", "compra": "SELL"}
OBSERVED_WINDOW = timedelta(days=7)
OBSERVED_ROOT_FIELDS = ("activo", "metodo", "actualizado", "cada_5_minutos", "diario")
OBSERVED_METHOD = (
    "mediana de los 5 primeros anuncios de cada plataforma en cada captura de 5 minutos; "
    "todas_promedio es el promedio simple de las plataformas con dato; "
    "el valor diario es el promedio de los valores de 5 minutos del dia "
    "y solo se publica con al menos 260 de 288 capturas (90%)"
)
def _observed_number(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    parsed = Decimal(str(value))
    return parsed.is_finite() and parsed > 0 and -parsed.as_tuple().exponent <= 4

def _observed_block(block: Any, length: int, name: str) -> list[str]:
    if not isinstance(block, dict) or list(block) != [OBSERVED_INDEX[name], *OBSERVED_PAGE_SIDES]:
        return [f"{name}: campos no permitidos"]
    errors: list[str] = []
    for page in OBSERVED_PAGE_SIDES:
        series = block[page]
        if not isinstance(series, dict) or list(series) != list(OBSERVED_SERIES):
            errors.append(f"{name}.{page}: series no permitidas")
            continue
        for key, values in series.items():
            if not isinstance(values, list) or len(values) != length:
                errors.append(f"{name}.{page}.{key}: longitud incorrecta")
            elif not all(_observed_number(value) for value in values):
                errors.append(f"{name}.{page}.{key}: valores no numericos o con mas de 4 decimales")
    return errors

def validate_observed_payload(payload: Any) -> list[str]:
    if not isinstance(payload, dict) or list(payload) != list(OBSERVED_ROOT_FIELDS):
        return ["campos raiz del precio observado no permitidos"]
    errors: list[str] = []
    if payload["activo"] != OBSERVED_ASSET or payload["metodo"] != OBSERVED_METHOD:
        errors.append("activo o metodo del precio observado incorrecto")
    five = payload["cada_5_minutos"]
    slots = five.get("intervalos") if isinstance(five, dict) else None
    updated = payload["actualizado"]
    if (
        not isinstance(slots, list)
        or not slots
        or not all(isinstance(slot, str) and OBSERVED_SLOT_PATTERN.match(slot) for slot in slots)
        or not isinstance(updated, str)
        or slots[-1] != updated
        or any(left >= right for left, right in zip(slots, slots[1:]))
    ):
        errors.append("intervalos de 5 minutos invalidos")
        slots = []
    elif parse_slot(slots[0]) <= parse_slot(updated) - OBSERVED_WINDOW:
        errors.append("la serie de 5 minutos supera 7 dias")
    errors.extend(_observed_block(five, len(slots), "cada_5_minutos"))
    daily = payload["diario"]
    days = daily.get("fechas") if isinstance(daily, dict) else None
    try:
        valid_days = isinstance(days, list) and all(
            isinstance(day, str) and OBSERVED_DAY_PATTERN.match(day) and date.fromisoformat(day) for day in days
        )
    except ValueError:
        valid_days = False
    if not valid_days or any(left >= right for left, right in zip(days, days[1:])):
        errors.append("fechas diarias invalidas")
        days = []
    errors.extend(_observed_block(daily, len(days), "diario"))
    for field_name in _walk_field_names(payload):
        if any(fragment.replace("_", "") in field_name for fragment in FORBIDDEN_FIELD_FRAGMENTS):
            errors.append(f"campo privado detectado: {field_name}")
            break
    return errors


def parse_slot(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _walk_field_names(value):
    if isinstance(value, dict):
        for key, nested in value.items():
            yield str(key).lower().replace("_", "")
            yield from _walk_field_names(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_field_names(nested)


def _fields(value, expected, where):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValueError(f"{where}: campos incompletos o no permitidos")


def _time_pair(value, utc, bo):
    if not isinstance(value[utc], str) or not isinstance(value[bo], str):
        raise ValueError("timestamps no textuales")
    left, right = parse_slot(value[utc]), parse_slot(value[bo])
    if left.utcoffset() != timedelta(0) or right.utcoffset() != timedelta(hours=-4) or left != right:
        raise ValueError("timestamps UTC/Bolivia no coinciden")
    return left


def _number(value, decimals, minimum=0, maximum=None, nullable=False):
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("valor no numerico")
    parsed = Decimal(str(value))
    if (not parsed.is_finite() or parsed < minimum or -parsed.as_tuple().exponent > decimals
            or (maximum is not None and parsed > maximum)):
        raise ValueError("valor fuera de rango o precision")
    return parsed


def _percentage_group(value, keys):
    _fields(value, keys, "porcentajes")
    if all(item is None for item in value.values()):
        return
    if any(item is None for item in value.values()):
        raise ValueError("grupo de porcentajes parcialmente null")
    if sum(_number(item, 2, maximum=100) for item in value.values()) != Decimal("100.00"):
        raise ValueError("los porcentajes no suman 100.00")


def _series(payload, asset, side, frequency, platform=None):
    _fields(payload, ROOT_FIELDS | ({"platform"} if platform else set()), "serie")
    schema = "p2p-nowcast-public-plataformas-v2" if platform else "p2p-nowcast-public-v4"
    if (payload["schema_version"], payload["asset"], payload["side"], payload["frequency"]) != (schema, asset, side, frequency):
        raise ValueError("esquema/activo/lado/frecuencia incorrectos")
    if platform and payload["platform"] != platform:
        raise ValueError("plataforma incorrecta")
    if type(payload["window_days"]) is not int or payload["window_days"] != 30 or payload["fiat"] != "BOB":
        raise ValueError("ventana/fiat incorrectos")
    if payload["price_unit"] != "BOB por unidad de activo" or not isinstance(payload["label"], str):
        raise ValueError("unidad/etiqueta incorrectas")
    _time_pair(payload, "as_of_utc", "as_of_bo")
    points = payload["points"]
    if not isinstance(points, list) or not points:
        raise ValueError("points debe ser una lista no vacia")
    previous = None
    step = {"5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400}[frequency]
    for point in points:
        _fields(point, POINT_FIELDS | ({"share"} if platform else set()), "punto")
        stamp = _time_pair(point, "timestamp_utc", "timestamp_bo")
        aligned = stamp.timestamp() - (14400 if frequency == "1d" else 0)
        if aligned % step or (previous is not None and (stamp - previous).total_seconds() != step):
            raise ValueError("bloques desalineados o discontinuos")
        previous = stamp
        price = _number(point["vwap_bob"], 4, nullable=True)
        activity = _number(point["activity"], 2, maximum=100)
        if type(point["price_observed"]) is not bool or point["status"] not in {"final", "provisional"}:
            raise ValueError("observacion/status invalidos")
        if (point["price_observed"] and (price is None or price <= 0)) or (not point["price_observed"] and activity != 0):
            raise ValueError("precio/actividad incompatibles con observacion")
        age = point["minutes_since_last_trade"]
        if age is not None and (type(age) is not int or age < 0):
            raise ValueError("edad de operacion invalida")
        if platform:
            _number(point["share"], 2, maximum=100, nullable=True)
    if len(points) != 30 * 86400 // step:
        raise ValueError("ventana publica distinta de 30 dias")


def _participation(payload, asset):
    _fields(payload, PARTICIPATION_FIELDS, "participacion")
    if payload["schema_version"] != "p2p-nowcast-public-participacion-v1" or payload["asset"] != asset:
        raise ValueError("esquema/activo de participacion incorrectos")
    if type(payload["decimals"]) is not int or payload["decimals"] != 2 or payload["windows"] != [1, 7, 30]:
        raise ValueError("precision/ventanas incorrectas")
    if _time_pair(payload, "as_of_utc", "as_of_bo").timestamp() % 300:
        raise ValueError("as_of no alineado al intervalo cerrado")
    _fields(payload["scopes"], ("total", *PLATFORMS), "scopes")
    for windows in payload["scopes"].values():
        _fields(windows, ("1", "7", "30"), "ventanas")
        for metrics in windows.values():
            _fields(metrics, ("volume", "events"), "metricas")
            for group in metrics.values():
                _percentage_group(group, ("BUY", "SELL"))
    _fields(payload["platform_share"], ("1", "7", "30"), "platform_share")
    for sides in payload["platform_share"].values():
        _fields(sides, ("BUY", "SELL", "ALL"), "lados")
        for metrics in sides.values():
            _fields(metrics, ("volume", "events"), "metricas")
            for group in metrics.values():
                _percentage_group(group, PLATFORMS)


def expected_files():
    expected = {}
    for asset, frequencies in FREQUENCIES.items():
        for path_side, side in SIDES.items():
            for frequency in frequencies:
                expected[f"{asset}/{path_side}/{frequency}.json"] = (asset, side, frequency, None)
            for platform in PLATFORMS:
                for frequency in PLATFORM_FREQUENCIES[asset]:
                    expected[f"{asset}/{path_side}/plataformas/{platform}/{frequency}.json"] = (asset, side, frequency, platform)
        expected[f"{asset}/participacion.json"] = (asset,)
    expected["USDT/observado/top5.json"] = ()
    return expected


def verify(data_dir: Path) -> None:
    expected = expected_files()
    actual = {path.relative_to(data_dir).as_posix() for path in data_dir.rglob("*") if path.is_file()}
    if actual != set(expected):
        raise ValueError(f"Se exigen exactamente 75 JSON. Faltan={sorted(set(expected) - actual)}; sobran={sorted(actual - set(expected))}")
    platform_groups = {}
    for relative, identity in expected.items():
        try:
            payload = json.loads((data_dir / relative).read_text(encoding="utf-8"))
            if any(fragment in field for field in _walk_field_names(payload) for fragment in FORBIDDEN_FIELD_FRAGMENTS):
                raise ValueError("campo privado detectado")
            if len(identity) == 4:
                _series(payload, *identity)
                if identity[3]:
                    key = identity[:3]
                    platform_groups.setdefault(key, {})[identity[3]] = payload["points"]
            elif identity:
                _participation(payload, *identity)
            else:
                errors = validate_observed_payload(payload)
                if errors:
                    raise ValueError("; ".join(errors))
        except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as error:
            raise ValueError(f"{relative}: {error}") from error
    for platforms in platform_groups.values():
        for points in zip(*(platforms[p] for p in PLATFORMS)):
            if len({point["timestamp_utc"] for point in points}) != 1:
                raise ValueError("bloques de plataformas distintos")
            _percentage_group({p: point["share"] for p, point in zip(PLATFORMS, points)}, PLATFORMS)


validate_public_directory = verify


if __name__ == "__main__":
    default_target = Path(__file__).resolve().parents[1] / "data"
    verify(Path(sys.argv[1]) if len(sys.argv) > 1 else default_target)
    print("Datos publicos: exactamente 75 JSON v4, sin volumen, conteos, IDs ni RAW.")
