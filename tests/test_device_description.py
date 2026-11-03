from users.devices import describe_device, fingerprint

CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
CHROME_ANDROID_REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
EDGE_WINDOWS = CHROME_WINDOWS + ' Edg/130.0.0.0'
CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'


def test_chrome_on_windows():
    info = describe_device(CHROME_WINDOWS, None)
    assert (info.label, info.browser, info.os, info.is_installed_app) == ('Chrome on Windows', 'Chrome', 'Windows', False)


def test_the_reduced_android_model_is_not_shown():
    # Chrome hides the real phone model in the agent and shows the letter K. Showing it would be wrong.
    assert describe_device(CHROME_ANDROID_REDUCED, None).label == 'Chrome on Android'


def test_a_model_the_browser_reports_is_shown():
    assert describe_device(CHROME_ANDROID_REDUCED, {'model': 'Pixel 9'}).label == 'Chrome on Pixel 9'


def test_a_phone_that_names_itself_in_the_agent_is_shown_by_that_name():
    assert describe_device(SAMSUNG, None).label == 'Samsung Internet on SM-S918B'


def test_safari_on_iphone():
    assert describe_device(SAFARI_IPHONE, None).label == 'Safari on iPhone'


def test_firefox_on_linux_edge_on_windows_and_chrome_on_a_mac():
    assert describe_device(FIREFOX_LINUX, None).label == 'Firefox on Linux'
    assert describe_device(EDGE_WINDOWS, None).label == 'Edge on Windows'
    assert describe_device(CHROME_MAC, None).label == 'Chrome on macOS'


def test_the_installed_app_is_named_as_the_app():
    info = describe_device(CHROME_WINDOWS, {'installed': True})
    assert (info.label, info.is_installed_app) == ('SSMS app on Windows', True)
    assert describe_device(CHROME_ANDROID_REDUCED, {'installed': True, 'model': 'Pixel 9'}).label == 'SSMS app on Pixel 9'


def test_a_hint_is_cleaned_and_cut():
    hostile = '<b>Pixel</b>\x00\x07 9' + ' x' * 40
    label = describe_device(CHROME_ANDROID_REDUCED, {'model': hostile}).label
    model = label.removeprefix('Chrome on ')
    assert model.startswith('Pixel 9 x')
    assert len(model) <= 40
    assert not any(ch in label for ch in '<>\x00\x07')


def test_a_hint_that_is_not_text_is_ignored():
    assert describe_device(CHROME_ANDROID_REDUCED, {'model': 42, 'installed': 'yes'}).label == 'Chrome on Android'


def test_a_one_letter_model_in_a_hint_is_ignored():
    assert describe_device(CHROME_ANDROID_REDUCED, {'model': 'K'}).label == 'Chrome on Android'


def test_an_empty_or_garbage_agent_is_an_unknown_device_and_never_raises():
    for agent in ('', 'x', None, 'a' * 5000):
        info = describe_device(agent, None)
        assert info.label == 'Unknown device'
        assert info.browser == '' and info.os == ''


def test_the_same_browser_gives_the_same_fingerprint_and_another_system_does_not():
    assert fingerprint(describe_device(CHROME_WINDOWS, None)) == fingerprint(describe_device(CHROME_WINDOWS, None))
    assert fingerprint(describe_device(CHROME_WINDOWS, None)) != fingerprint(describe_device(CHROME_MAC, None))
    assert fingerprint(describe_device(CHROME_ANDROID_REDUCED, {'model': 'Pixel 9'})) != \
        fingerprint(describe_device(CHROME_ANDROID_REDUCED, {'model': 'Pixel 8'}))
