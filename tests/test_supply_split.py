"""The fair split of the stock between the requests. Pure arithmetic: no database, and the same input always gives the same answer."""
import random

import pytest

from supply.split import SplitEntry, propose_split


def entries(*rows):
    """rows are (id, asked, ceiling) in the order the requests were made."""
    return [SplitEntry(id=i, asked=a, ceiling=c, order=n) for n, (i, a, c) in enumerate(rows)]


def split(stock, *rows):
    return propose_split(stock, entries(*rows))


def test_enough_stock_gives_everyone_what_they_can_take_and_leaves_the_rest():
    assert split(10, ('a', 3, 3), ('b', 2, 2)) == [3, 2]


def test_a_ceiling_below_what_was_asked_caps_the_share():
    assert split(10, ('a', 5, 2), ('b', 4, 4)) == [2, 4]


def test_exactly_the_stock_gives_everyone_their_ceiling():
    assert split(5, ('a', 3, 3), ('b', 2, 2)) == [3, 2]


def test_short_stock_is_shared_in_proportion_to_what_each_can_take():
    # 12 boxes asked in all for a stock of 6: each gets half of what was asked.
    assert split(6, ('a', 8, 8), ('b', 4, 4)) == [4, 2]


def test_whole_boxes_use_the_largest_remainder_and_ties_go_to_the_earlier_request():
    # Three equal asks of 2 against a stock of 4: 4/3 each, so one box is left over and the earliest request gets it.
    assert split(4, ('a', 2, 2), ('b', 2, 2), ('c', 2, 2)) == [2, 1, 1]
    # A bigger remainder wins over an earlier request: the shares are 2, 1.33 and 0.67 of 4, so the last one rounds up.
    assert split(4, ('x', 3, 3), ('y', 2, 2), ('z', 1, 1)) == [2, 1, 1]


def test_nobody_gets_more_than_their_ceiling_even_when_the_remainder_would_give_more():
    assert split(3, ('a', 1, 1), ('b', 1, 1), ('c', 1, 1), ('d', 1, 1)) == [1, 1, 1, 0]


def test_zero_stock_gives_zeros_and_a_zero_ceiling_gives_zero():
    assert split(0, ('a', 3, 3), ('b', 2, 2)) == [0, 0]
    assert split(5, ('a', 3, 0), ('b', 2, 2)) == [0, 2]


def test_no_requests_gives_nothing():
    assert propose_split(5, []) == []


def test_the_same_input_gives_the_same_answer_every_time():
    rows = [('a', 3, 3), ('b', 5, 4), ('c', 2, 2), ('d', 6, 6)]
    assert {tuple(split(7, *rows)) for _ in range(20)} == {tuple(split(7, *rows))}


def test_the_order_the_entries_arrive_in_does_not_change_who_gets_what():
    base = [SplitEntry('a', 2, 2, 0), SplitEntry('b', 2, 2, 1), SplitEntry('c', 2, 2, 2), SplitEntry('d', 5, 5, 3)]
    expected = dict(zip([e.id for e in base], propose_split(5, base)))
    shuffled = base[:]
    random.Random(7).shuffle(shuffled)
    assert dict(zip([e.id for e in shuffled], propose_split(5, shuffled))) == expected


@pytest.mark.parametrize('seed', range(200))
def test_the_split_never_breaks_its_rules_for_any_input(seed):
    rng = random.Random(seed)
    rows = [SplitEntry(i, (asked := rng.randint(0, 12)), rng.randint(0, asked + 3), i) for i in range(rng.randint(0, 9))]
    stock = rng.randint(0, 40)
    result = propose_split(stock, rows)
    assert len(result) == len(rows)
    assert sum(result) <= stock
    for entry, boxes in zip(rows, result):
        assert 0 <= boxes <= min(entry.asked, entry.ceiling)
    # Nothing is held back while someone could still take it.
    can_take = sum(min(e.asked, e.ceiling) for e in rows)
    assert sum(result) == min(stock, can_take)
