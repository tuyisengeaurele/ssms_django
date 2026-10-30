"""A QR code drawn into a PDF."""
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.lib.units import mm

from core.pdf import qr_code


def test_the_drawing_holds_the_address_it_was_given():
    drawing = qr_code('https://ssms.example/lot/abc')
    widgets = [item for item in drawing.contents if isinstance(item, QrCodeWidget)]
    assert [w.value for w in widgets] == ['https://ssms.example/lot/abc']


def test_the_drawing_has_the_size_asked_for_and_a_quiet_margin():
    drawing = qr_code('https://ssms.example/lot/abc', size_mm=30)
    assert round(drawing.width / mm) == 30
    assert round(drawing.height / mm) == 30
    widget = next(item for item in drawing.contents if isinstance(item, QrCodeWidget))
    # The blank border, in modules, that a scanner needs around the code.
    assert widget.barBorder >= 4


def test_it_is_black_on_white_so_a_scanner_reads_it():
    drawing = qr_code('x')
    widget = next(item for item in drawing.contents if isinstance(item, QrCodeWidget))
    assert widget.barFillColor.hexval() == '0x000000'
    background = [item for item in drawing.contents if not isinstance(item, QrCodeWidget)]
    assert background and background[0].fillColor.hexval() == '0xffffff'
