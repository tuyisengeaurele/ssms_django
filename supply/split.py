"""The fair split of a round's stock between the requests. Pure arithmetic, so the same input always gives the same answer.

The supervisor sees this as a proposal and may edit it before confirming. The rules, in order:
1. Nobody gets more than they asked for, their allowance or their room can take. The caller folds the last two into `ceiling`.
2. With enough stock everyone gets their ceiling. Otherwise the stock is shared in proportion to the ceilings.
3. Whole boxes only. The largest remainder gets the boxes that are left, and ties go to the earlier request.
4. The total never passes the stock. Whoever gets nothing waits, in request order.
"""
from typing import NamedTuple


class SplitEntry(NamedTuple):
    id: str
    asked: int
    # The most this farmer can take: the smallest of what they asked, their allowance and their room's free space.
    ceiling: int
    # When the request was made, as a rank (0 is the earliest). It only breaks ties.
    order: int


def propose_split(stock: int, entries: list[SplitEntry]) -> list[int]:
    """The proposed boxes for each entry, in the order the entries were given."""
    ceilings = [max(0, min(e.asked, e.ceiling)) for e in entries]
    total = sum(ceilings)
    if total <= stock:
        return ceilings

    # Integer arithmetic only, so there is no rounding to disagree about. Each share is stock * ceiling / total.
    shares = [(stock * c) // total for c in ceilings]
    remainders = [(stock * c) % total for c in ceilings]
    left = stock - sum(shares)
    # The boxes left go to the largest remainders. Nobody with a zero ceiling is a candidate, and since the stock is short
    # every share is below its ceiling, so one more box never passes it.
    ranked = sorted(
        (i for i, c in enumerate(ceilings) if c > 0),
        key=lambda i: (-remainders[i], entries[i].order, entries[i].id),
    )
    for i in ranked[:left]:
        shares[i] += 1
    return shares
