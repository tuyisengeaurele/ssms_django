"""Spreadsheet programs run a cell that starts with = + - @ as a formula.

A farmer could write a note like =HYPERLINK("http://evil.example") and an administrator who opens the
export in Excel would run it. A leading apostrophe turns the cell back into plain text.
"""

_FORMULA_STARTS = ('=', '+', '-', '@', '\t', '\r')


def csv_safe(value):
    """Return the value ready for a CSV cell. Only text that could be read as a formula changes."""
    if isinstance(value, str) and value.startswith(_FORMULA_STARTS):
        return "'" + value
    return value


def csv_safe_row(row):
    return [csv_safe(cell) for cell in row]


class _SafeWriter:
    def __init__(self, writer):
        self._writer = writer

    def writerow(self, row):
        return self._writer.writerow(csv_safe_row(row))


def safe_writer(target):
    """A csv writer whose every row goes through csv_safe. Use it in place of csv.writer."""
    import csv

    return _SafeWriter(csv.writer(target))
