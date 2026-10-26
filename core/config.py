def parse_list(value: str) -> list[str]:
    """Split a comma separated setting, ignoring spaces around each item and empty items."""
    return [item.strip() for item in (value or '').split(',') if item.strip()]
