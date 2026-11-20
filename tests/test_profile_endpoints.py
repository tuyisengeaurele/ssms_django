"""The helpers of scripts/profile_endpoints.py: how a set of timings becomes the numbers and the table that get written down."""
from scripts.profile_endpoints import Measure, estimate_ms, fill, markdown_table, rounds_for, slow, summarize


def test_the_median_and_the_worst_of_the_timings_are_found():
    result = summarize('FARMER', '/api/farms', 200, [0.030, 0.010, 0.050, 0.020, 0.040], queries=5, db_seconds=0.004, size=1200)
    assert result.median_ms == 30.0
    assert result.worst_ms == 50.0
    assert result.queries == 5
    assert result.db_ms == 4.0
    assert result.size_kb == 1.2


def test_the_median_of_an_even_number_of_timings_is_the_middle_of_the_two():
    assert summarize('FARMER', '/x', 200, [0.010, 0.030], queries=1, db_seconds=0, size=0).median_ms == 20.0


def test_a_slower_database_adds_one_round_trip_for_each_query():
    result = Measure('FARMER', '/x', 200, median_ms=40.0, worst_ms=60.0, queries=8, db_ms=10.0, size_kb=1.0)
    assert estimate_ms(result, round_trip_ms=25) == 40.0 + 8 * 25
    assert estimate_ms(result, round_trip_ms=0) == 40.0


def test_only_the_endpoints_over_the_limit_are_called_slow():
    fast = Measure('FARMER', '/fast', 200, 100.0, 120.0, 3, 5.0, 1.0)
    edge = Measure('FARMER', '/edge', 200, 300.0, 310.0, 3, 5.0, 1.0)
    over = Measure('FARMER', '/over', 200, 300.1, 400.0, 3, 5.0, 1.0)
    assert [m.path for m in slow([fast, edge, over], limit_ms=300, round_trip_ms=0)] == ['/over']
    # With a round trip of 25 ms for each of 3 queries, the fast one is 175 ms and the edge one 375 ms.
    assert [m.path for m in slow([fast, edge, over], limit_ms=300, round_trip_ms=25)] == ['/edge', '/over']


def test_the_slowest_come_first_in_the_table_and_the_slow_ones_are_marked():
    rows = [
        Measure('FARMER', '/a', 200, 20.0, 25.0, 2, 3.0, 0.5),
        Measure('SUPERVISOR', '/b', 200, 420.0, 500.0, 9, 300.0, 40.0),
    ]
    table = markdown_table(rows, limit_ms=300, round_trip_ms=25)
    lines = table.splitlines()
    assert lines[0].startswith('| Role | Endpoint |')
    assert '/b' in lines[2] and '/a' in lines[3]
    assert 'SLOW' in lines[2] and 'SLOW' not in lines[3]


def test_a_path_is_filled_in_from_what_was_found():
    context = {'farm': 'f1', 'batch': 'b1'}
    assert fill('/api/farms/{farm}/summary', context) == '/api/farms/f1/summary'
    assert fill('/api/batches/{batch}', context) == '/api/batches/b1'
    assert fill('/api/farms', context) == '/api/farms'


def test_a_slow_endpoint_is_asked_for_fewer_times_so_the_run_does_not_take_an_hour():
    assert rounds_for(warm_seconds=0.05, wanted=7) == 7
    assert rounds_for(warm_seconds=0.99, wanted=7) == 7
    assert rounds_for(warm_seconds=1.0, wanted=7) == 3
    assert rounds_for(warm_seconds=4.9, wanted=7) == 3
    assert rounds_for(warm_seconds=5.0, wanted=7) == 2
    assert rounds_for(warm_seconds=30, wanted=7) == 2
    assert rounds_for(warm_seconds=30, wanted=1) == 1   # never more than was asked for

