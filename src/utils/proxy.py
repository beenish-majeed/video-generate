"""
Trusted proxy verification and IP parsing utilities.
Provides RFC 7239 compliant right-to-left header parsing, strict CIDR matching,
IPv4-mapped IPv6 normalization, and safe test-client handling.
"""
import ipaddress
import re
from typing import Optional, Sequence
from starlette.requests import Request

from src.core.config import settings


def parse_ip_address(val: Optional[str]) -> Optional[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """
    Parse an IP address string safely into an IPv4Address or IPv6Address.
    Normalizes IPv4-mapped IPv6 addresses (e.g. ::ffff:192.0.2.1 -> 192.0.2.1).
    Returns None if the input is None, empty, or not a valid IP literal.
    """
    if not val:
        return None
    val_clean = str(val).strip()
    if not val_clean:
        return None
    try:
        ip = ipaddress.ip_address(val_clean)
        # Unwrap IPv4-mapped IPv6 addresses
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            return ip.ipv4_mapped
        return ip
    except ValueError:
        return None


def is_ip_in_trusted_proxies(
    ip_val: str | ipaddress.IPv4Address | ipaddress.IPv6Address,
    trusted_proxies: Optional[Sequence[str]] = None,
) -> bool:
    """
    Check if an IP address or hostname belongs to the explicitly configured trusted proxies list.
    Supports:
    - Single IPv4 addresses (e.g. "127.0.0.1")
    - Single IPv6 addresses (e.g. "::1")
    - Configured IPv4 CIDR blocks (e.g. "10.0.0.0/8", "192.168.1.0/24")
    - Configured IPv6 CIDR blocks (e.g. "2001:db8::/32")
    - "testclient" keyword ONLY in non-production environments

    CRITICAL SECURITY INVARIANT:
    Private networks (RFC 1918) are NOT automatically trusted. A private IP is only
    trusted if explicitly configured in `trusted_proxies`.
    """
    if trusted_proxies is None:
        trusted_proxies = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "testclient"])

    env = getattr(settings, "environment", "development").lower().strip()

    # Handle string literal comparisons (e.g. testclient)
    if isinstance(ip_val, str):
        ip_str_clean = ip_val.strip()
        if ip_str_clean == "testclient":
            # Never trust testclient in production
            return env != "production" and "testclient" in trusted_proxies

        ip_obj = parse_ip_address(ip_str_clean)
        if ip_obj is None:
            # Not a valid IP and not an accepted literal
            return False
    else:
        ip_obj = ip_val

    # Normalize IPv4-mapped IPv6
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
        ip_obj = ip_obj.ipv4_mapped

    for entry in trusted_proxies:
        if not entry:
            continue
        entry_str = str(entry).strip()
        if not entry_str:
            continue

        if entry_str == "testclient":
            continue

        try:
            # Parse as network (supports both single IPs like "127.0.0.1" and CIDRs like "10.0.0.0/8")
            net = ipaddress.ip_network(entry_str, strict=False)
            if ip_obj.version == net.version and ip_obj in net:
                return True
        except ValueError:
            # Entry is not a valid IP or CIDR (e.g. hostname), fallback to string equality
            if str(ip_obj) == entry_str:
                return True

    return False


def extract_client_ip(request: Request) -> str:
    """
    Extract the real client IP address with strict trusted-proxy verification.

    Rules:
    1. If request.client is missing or empty, returns 'unknown'.
    2. The direct connecting IP is verified against configured `trusted_proxies`.
    3. If the direct connecting IP is NOT in `trusted_proxies`, all proxy headers
       (X-Forwarded-For, X-Real-IP, Forwarded) are STRICTLY IGNORED.
    4. If the direct connecting IP IS a trusted proxy:
       - Traverses X-Forwarded-For from right to left.
       - Skips ONLY explicitly configured trusted proxy hops.
       - Selects the first untrusted valid client IP.
       - If no untrusted IP exists, falls back to the leftmost valid IP.
       - If no valid X-Forwarded-For, inspects X-Real-IP.
       - If no valid X-Real-IP, inspects RFC 7239 Forwarded header.
       - Avoids insecure fallback on malformed headers.
    """
    direct_ip_raw = request.client.host if request.client and request.client.host else ""
    if not direct_ip_raw:
        return "unknown"

    direct_ip_clean = direct_ip_raw.strip()
    direct_ip_obj = parse_ip_address(direct_ip_clean)
    normalized_direct_ip = str(direct_ip_obj) if direct_ip_obj else direct_ip_clean

    trusted_list = getattr(settings, "trusted_proxies", ["127.0.0.1", "::1", "testclient"])

    # If direct connection is not from an explicitly trusted proxy, ignore all forwarding headers
    if not is_ip_in_trusted_proxies(direct_ip_clean, trusted_list):
        return normalized_direct_ip

    # Direct connection is an explicitly trusted proxy:
    # 1. Parse X-Forwarded-For (standard: client, proxy1, proxy2) right-to-left
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        # Traverse right-to-left
        for p in reversed(parts):
            ip_obj = parse_ip_address(p)
            if ip_obj is None:
                # Malformed IP entry, skip
                continue
            if is_ip_in_trusted_proxies(ip_obj, trusted_list):
                # Intermediate trusted proxy hop, continue stepping left
                continue
            # First untrusted valid IP from right is the real client IP
            return str(ip_obj)

        # If every valid IP in XFF was in trusted_proxies, fallback to leftmost valid IP
        for p in parts:
            ip_obj = parse_ip_address(p)
            if ip_obj is not None:
                return str(ip_obj)

    # 2. Parse X-Real-IP
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        ip_obj = parse_ip_address(x_real_ip)
        if ip_obj is not None:
            return str(ip_obj)

    # 3. Parse Forwarded header (RFC 7239: for="192.0.2.60") right-to-left
    fwd = request.headers.get("Forwarded")
    if fwd:
        matches = re.findall(r'for=(?:"?\[?)([a-zA-Z0-9\.\:]+)(?:\]?"?)', fwd)
        for candidate in reversed(matches):
            ip_obj = parse_ip_address(candidate)
            if ip_obj is None:
                continue
            if is_ip_in_trusted_proxies(ip_obj, trusted_list):
                continue
            return str(ip_obj)

        if matches:
            ip_obj = parse_ip_address(matches[0])
            if ip_obj is not None:
                return str(ip_obj)

    return normalized_direct_ip
